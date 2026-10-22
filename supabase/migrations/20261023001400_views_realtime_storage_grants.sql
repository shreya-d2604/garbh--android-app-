-- Views, Realtime publication, storage bucket, function privileges. Owner: head.

-- Public doctor directory (PLAN.md §5.2): readable by every onboarded user.
-- Runs with the view owner's rights (security_invoker = false) and exposes only public fields.
create view public.doctor_directory with (security_invoker = false) as
  select p.id, p.full_name, p.avatar_path, s.designation, s.specialization, s.bio,
         coalesce(s.accepts_new_patients, false) as accepts_new_patients
  from public.profiles p
  left join public.staff_details s on s.profile_id = p.id
  where p.role = 'doctor' and p.is_active and p.deleted_at is null
    and public.auth_role() is not null;

-- Patient/companion-facing AI summaries (PLAN.md §6): published only, `final` only, and the
-- doctor-only attention flags stripped. Staff read ai_summaries directly under RLS.
create view public.published_summaries with (security_invoker = false) as
  select s.id, s.pregnancy_id, s.source_type, s.source_id,
         (s.final - 'doctor_attention_flags') #- '{summary,doctor_attention_flags}' as final,
         s.reviewed_by, s.published_at
  from public.ai_summaries s
  where s.status = 'published'
    and (public.auth_role() = 'admin' or public.can_view_pregnancy(s.pregnancy_id, 'summaries'));

revoke all on public.doctor_directory, public.published_summaries from anon;
grant select on public.doctor_directory, public.published_summaries to authenticated;

-- Realtime (PLAN.md §3 Backend): postgres_changes on these RLS-protected tables.
alter publication supabase_realtime add table
  public.appointments, public.notifications, public.companion_links, public.ai_summaries;

-- Private reports bucket. Object policies are owned by the backend agent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Functions: nothing is callable by anon; authenticated can call public functions
-- (each RPC checks the caller itself). Agents must repeat this for every new function.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

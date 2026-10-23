-- Backend: AI summary review workflow (PLAN.md §8.2, §9.3, §9.5, contracts §5).
-- AI output is always a DRAFT. Nothing reaches a patient or companion except through
-- review_ai_summary('approve_publish') by a care-team doctor:
--   * ai_summaries_published_requires_review (foundation) demands reviewed_by + final
--   * the BEFORE trigger below insists the reviewer is a doctor and strips doctor-only flags
--   * patients/companions only ever read the published_summaries view
-- Edge Functions (service role) are the only writers of drafts.

----------------------------------------------------------------------------
-- Per-doctor AI rate limit (PLAN.md §9.5: 100 calls / hour). Called by the Edge Functions
-- through the CALLER's JWT, so it always counts against the calling doctor.
----------------------------------------------------------------------------
create table private.ai_usage (
  id        bigint generated always as identity primary key,
  doctor_id uuid not null,
  fn        text not null,
  at        timestamptz not null default now()
);
create index ai_usage_doctor_idx on private.ai_usage (doctor_id, at desc);

create function public.consume_ai_quota(p_fn text default 'ai') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if public.auth_role() is distinct from 'doctor' then
    raise exception 'NOT_ALLOWED';
  end if;
  delete from private.ai_usage where at < now() - interval '1 day';
  if (select count(*) from private.ai_usage u
      where u.doctor_id = auth.uid() and u.at > now() - interval '1 hour') >= 100 then
    raise exception 'RATE_LIMITED';
  end if;
  insert into private.ai_usage (doctor_id, fn) values (auth.uid(), left(coalesce(p_fn, 'ai'), 40));
end $$;
revoke execute on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

----------------------------------------------------------------------------
-- Document validation (PLAN.md §9.3). Mirrors src/domain/schemas/ai-summary.ts
-- (aiSummaryDocumentSchema) and supabase/functions/_shared/schemas.ts.
----------------------------------------------------------------------------
create function private.ai_str(j jsonb, k text) returns boolean
language sql immutable set search_path = '' as $$ select jsonb_typeof(j -> k) = 'string' $$;

create function private.ai_items_valid(j jsonb, k text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare e jsonb;
begin
  if jsonb_typeof(j -> k) is distinct from 'array' then return false; end if;
  for e in select * from jsonb_array_elements(j -> k) loop
    if jsonb_typeof(e) is distinct from 'object' or not coalesce(private.ai_str(e, 'item'), false)
       or not coalesce(private.ai_str(e, 'why'), false) then
      return false;
    end if;
  end loop;
  return true;
end $$;

create function private.ai_strings_valid(j jsonb, k text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare e jsonb;
begin
  if jsonb_typeof(j -> k) is distinct from 'array' then return false; end if;
  for e in select * from jsonb_array_elements(j -> k) loop
    if jsonb_typeof(e) is distinct from 'string' then return false; end if;
  end loop;
  return true;
end $$;

create function private.ai_document_valid(d jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare s jsonb; e jsonb;
begin
  if jsonb_typeof(d) is distinct from 'object' then return false; end if;
  s := d -> 'summary';
  if jsonb_typeof(s) is distinct from 'object'
     or not coalesce(private.ai_str(s, 'headline'), false)
     or not coalesce(private.ai_str(s, 'plain_language_summary'), false) then
    return false;
  end if;
  if jsonb_typeof(s -> 'key_findings') is distinct from 'array' then return false; end if;
  for e in select * from jsonb_array_elements(s -> 'key_findings') loop
    if jsonb_typeof(e) is distinct from 'object'
       or not coalesce(private.ai_str(e, 'finding'), false)
       or not coalesce(private.ai_str(e, 'explanation'), false)
       or coalesce(e ->> 'status', '') not in ('normal', 'attention', 'urgent') then
      return false;
    end if;
  end loop;
  if not (private.ai_items_valid(s, 'foods_to_eat') and private.ai_items_valid(s, 'foods_to_avoid')
          and private.ai_items_valid(s, 'medicines_to_avoid')
          and private.ai_strings_valid(s, 'lifestyle_tips') and private.ai_strings_valid(s, 'questions_for_doctor')) then
    return false;
  end if;
  if s ? 'doctor_attention_flags' and not private.ai_strings_valid(s, 'doctor_attention_flags') then return false; end if;
  if s ? 'confidence_note' and not private.ai_str(s, 'confidence_note') then return false; end if;
  if d ? 'lab_values' then
    if jsonb_typeof(d -> 'lab_values') is distinct from 'array' then return false; end if;
    for e in select * from jsonb_array_elements(d -> 'lab_values') loop
      if jsonb_typeof(e) is distinct from 'object'
         or not coalesce(private.ai_str(e, 'raw_name'), false)
         or not (e ? 'test_code' and jsonb_typeof(e -> 'test_code') in ('string', 'null'))
         or not (e ? 'value' and jsonb_typeof(e -> 'value') in ('number', 'null'))
         or not (e ? 'value_text' and jsonb_typeof(e -> 'value_text') in ('string', 'null'))
         or not (e ? 'unit' and jsonb_typeof(e -> 'unit') in ('string', 'null'))
         or not (e ? 'ref_range_on_report' and jsonb_typeof(e -> 'ref_range_on_report') in ('string', 'null'))
         or jsonb_typeof(e -> 'confidence') is distinct from 'number'
         or (e ->> 'confidence')::numeric not between 0 and 1 then
        return false;
      end if;
    end loop;
  end if;
  return true;
end $$;

-- doctor_attention_flags are doctor-only: removed from `final` before anything is published.
create function private.strip_doctor_flags(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when j is null then null else (j - 'doctor_attention_flags') #- '{summary,doctor_attention_flags}' end
$$;

----------------------------------------------------------------------------
-- review_ai_summary (replaces the foundation stub; signature unchanged)
--   save_draft       care-team doctor; stores p_final as `final`, status stays draft
--   approve_publish  care-team doctor only (doctor approval is mandatory; admin cannot publish)
--   reject           care-team doctor or admin (housekeeping)
----------------------------------------------------------------------------
create or replace function public.review_ai_summary(
  p_summary uuid, p_action text, p_final jsonb default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_role  public.user_role := public.auth_role();
  s       public.ai_summaries%rowtype;
  v_final jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_role is null or v_role not in ('doctor', 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_action is null or p_action not in ('save_draft', 'approve_publish', 'reject') then
    raise exception 'INVALID_INPUT' using detail = 'unknown action';
  end if;

  select * into s from public.ai_summaries where id = p_summary for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_role = 'doctor' and not public.on_care_team(s.pregnancy_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_role = 'admin' and p_action <> 'reject' then
    raise exception 'NOT_ALLOWED' using detail = 'only a care-team doctor can edit or publish AI summaries';
  end if;
  if s.status <> 'draft' then
    raise exception 'INVALID_STATUS_CHANGE';
  end if;

  if p_action = 'save_draft' then
    if p_final is null or not private.ai_document_valid(p_final) then
      raise exception 'INVALID_INPUT' using detail = 'final does not match the AI summary schema';
    end if;
    update public.ai_summaries set final = p_final where id = s.id;

  elsif p_action = 'approve_publish' then
    v_final := coalesce(p_final, s.final, s.draft);
    if v_final is null or not private.ai_document_valid(v_final) then
      raise exception 'INVALID_INPUT' using detail = 'final does not match the AI summary schema';
    end if;
    update public.ai_summaries
      set final = private.strip_doctor_flags(v_final), status = 'published',
          reviewed_by = v_uid, reviewed_at = now(), published_at = now(),
          doctor_note = coalesce(p_note, doctor_note)
      where id = s.id;

  else
    update public.ai_summaries
      set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), doctor_note = p_note
      where id = s.id;
  end if;
end $$;
revoke execute on function public.review_ai_summary(uuid, text, jsonb, text) from public, anon;
grant execute on function public.review_ai_summary(uuid, text, jsonb, text) to authenticated;

----------------------------------------------------------------------------
-- Publish guard (BEFORE): any path that publishes (RPC, admin write, seed) must name a doctor
-- as reviewer, and the doctor-only flags never survive into a published row.
----------------------------------------------------------------------------
create function private.trg_ai_summary_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' then
    if not exists (select 1 from public.profiles p where p.id = new.reviewed_by and p.role = 'doctor') then
      raise exception 'NOT_ALLOWED' using detail = 'a published AI summary needs a doctor as reviewer';
    end if;
    new.final := private.strip_doctor_flags(new.final);
  end if;
  return new;
end $$;

create trigger ai_summary_guard
  before insert or update on public.ai_summaries
  for each row execute function private.trg_ai_summary_guard();

----------------------------------------------------------------------------
-- After a summary is published the doctor has approved the report's values: verify them.
-- (Not wrapped in an exception handler: a failure here must abort the publish.)
----------------------------------------------------------------------------
create function private.trg_ai_summary_verify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and new.source_type = 'report' and new.source_id is not null then
    update public.lab_results set verified = true, verified_by = new.reviewed_by
      where report_id = new.source_id and not verified;
    update public.reports set verified_by = new.reviewed_by, verified_at = coalesce(new.published_at, now())
      where id = new.source_id and verified_at is null;
  end if;
  return null;
end $$;

create trigger ai_summary_verify
  after insert or update of status on public.ai_summaries
  for each row execute function private.trg_ai_summary_verify();

----------------------------------------------------------------------------
-- Notifications: draft ready -> care-team doctors; published -> patient + companions (summaries).
----------------------------------------------------------------------------
create function private.trg_ai_summary_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_patient uuid;
begin
  begin
    if new.status = 'draft' and (tg_op = 'INSERT' or old.status is distinct from 'draft') then
      perform private.notify_care_team(new.pregnancy_id, 'ai_draft_ready', 'AI draft ready',
                                       'A new AI draft is waiting for your review.',
                                       '/doctor/ai-inbox/' || new.id, jsonb_build_object('summary_id', new.id));
    elsif new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      select pr.patient_id into v_patient from public.pregnancies pr where pr.id = new.pregnancy_id;
      perform private.notify_patient_side(
        v_patient, 'summary_published', 'New update from your doctor',
        'Your doctor has reviewed and shared a summary with you.',
        'A new summary was shared for %s.',
        '/patient/reports/summaries/' || new.id, '/companion/' || v_patient || '/summaries', 'summaries',
        jsonb_build_object('summary_id', new.id));
    end if;
  exception when others then
    raise warning 'summary notification failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger ai_summary_notify
  after insert or update of status on public.ai_summaries
  for each row execute function private.trg_ai_summary_notify();

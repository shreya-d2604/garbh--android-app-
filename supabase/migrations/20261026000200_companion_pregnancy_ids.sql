-- Companion read helper. Owner: companion agent.
--
-- A companion who follows several patients reads clinical rows (summaries, reports, prescriptions)
-- filtered by pregnancy_id, but `pregnancies` itself is only readable with the `journey` permission.
-- This returns the pregnancy ids of ONE patient the caller follows (any approved link), so the app
-- can scope its queries to the selected patient. Ids only: every row is still filtered by RLS.
create function public.companion_pregnancy_ids(p_patient uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select pr.id
  from public.pregnancies pr
  where pr.patient_id = p_patient and public.companion_can(p_patient, 'any')
  order by pr.created_at desc
$$;

revoke execute on function public.companion_pregnancy_ids(uuid) from public, anon;
grant  execute on function public.companion_pregnancy_ids(uuid) to authenticated;

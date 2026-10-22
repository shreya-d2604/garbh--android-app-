-- Domain RPC CONTRACT STUBS. Owner of this file: head. Owner of each implementation: see AGENTS.md.
--
-- Each function below exists so that src/types/database.ts already contains its exact
-- signature and every agent can code against it in parallel. The owning agent replaces the
-- body with `create or replace function` in a migration in THEIR timestamp range, keeping the
-- signature (name, parameter names/types/defaults, return type) EXACTLY as declared here.
-- Behaviour and error codes are specified in docs/contracts.md.

create function private.not_implemented(p_name text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'NOT_IMPLEMENTED' using detail = p_name;
end $$;

-- ---------------------------------------------------------------- reception agent
create function public.verify_patient(p_patient uuid, p_mrn text, p_merge_into uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('verify_patient'); end $$;

create function public.merge_patients(p_source uuid, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('merge_patients'); end $$;

create function public.available_slots(p_doctor uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin perform private.not_implemented('available_slots'); end $$;

create function public.book_appointment(
  p_doctor uuid, p_starts_at timestamptz, p_visit uuid default null,
  p_pregnancy uuid default null, p_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('book_appointment'); return null; end $$;

create function public.reschedule_appointment(p_appt uuid, p_new_starts_at timestamptz, p_doctor uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('reschedule_appointment'); return null; end $$;

create function public.cancel_appointment(p_appt uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('cancel_appointment'); end $$;

create function public.set_appointment_status(p_appt uuid, p_status public.appt_status) returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('set_appointment_status'); end $$;

-- ---------------------------------------------------------------- doctor agent
create function public.add_backup_doctor(p_pregnancy uuid, p_doctor uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('add_backup_doctor'); end $$;

create function public.remove_care_team_member(p_pregnancy uuid, p_doctor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('remove_care_team_member'); end $$;

create function public.hand_over_primary(p_pregnancy uuid, p_new_primary uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('hand_over_primary'); end $$;

-- ---------------------------------------------------------------- companion agent
create function public.create_companion_invite() returns text
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('create_companion_invite'); return null; end $$;

create function public.redeem_companion_code(p_code text, p_relation text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('redeem_companion_code'); return null; end $$;

create function public.decide_companion_link(p_link uuid, p_approve boolean, p_perms jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('decide_companion_link'); end $$;

create function public.end_companion_link(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('end_companion_link'); end $$;

-- ---------------------------------------------------------------- backend agent
create function public.review_ai_summary(
  p_summary uuid, p_action text, p_final jsonb default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin perform private.not_implemented('review_ai_summary'); end $$;

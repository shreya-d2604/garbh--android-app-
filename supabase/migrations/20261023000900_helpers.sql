-- RLS helper functions (PLAN.md §5.3 "Who am I?") + pregnancy math. Owner: head.
-- All helpers are SECURITY DEFINER so they can be used inside RLS policies without recursion.
-- A deactivated or soft-deleted profile has auth_role() = null, which denies every role-based policy.

create function public.auth_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.is_active and p.deleted_at is null
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_role() in ('admin','doctor','receptionist'), false)
$$;

create function public.my_patient_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select pt.id from public.patients pt
  where pt.user_id = auth.uid() and pt.deleted_at is null and public.auth_role() = 'patient'
$$;

-- p_perm: 'any' | 'appointments' | 'journey' | 'summaries' | 'reports' | 'prescriptions' | 'notifications'
create function public.companion_can(p_patient uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_role() = 'companion', false) and exists (
    select 1 from public.companion_links l
    where l.patient_id = p_patient
      and l.companion_user_id = auth.uid()
      and l.status = 'approved'
      and case p_perm
            when 'any'           then true
            when 'appointments'  then l.can_view_appointments
            when 'journey'       then l.can_view_journey
            when 'summaries'     then l.can_view_summaries
            when 'reports'       then l.can_view_reports
            when 'prescriptions' then l.can_view_prescriptions
            when 'notifications' then l.receive_notifications
            else false
          end
  )
$$;

create function public.on_care_team(p_pregnancy uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_role() = 'doctor', false) and exists (
    select 1 from public.care_team ct
    where ct.pregnancy_id = p_pregnancy and ct.doctor_id = auth.uid() and ct.removed_at is null
  )
$$;

create function public.on_patient_care_team(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_role() = 'doctor', false) and exists (
    select 1 from public.care_team ct
    join public.pregnancies pr on pr.id = ct.pregnancy_id
    where pr.patient_id = p_patient and ct.doctor_id = auth.uid() and ct.removed_at is null
  )
$$;

create function public.is_primary_doctor(p_pregnancy uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.auth_role() = 'doctor', false) and exists (
    select 1 from public.care_team ct
    where ct.pregnancy_id = p_pregnancy and ct.doctor_id = auth.uid()
      and ct.care_role = 'primary' and ct.removed_at is null
  )
$$;

-- Convenience for clinical-table policies: care-team doctor, the patient herself,
-- or an approved companion holding p_companion_perm. (Admin is covered by admin_all policies.)
create function public.can_view_pregnancy(p_pregnancy uuid, p_companion_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.on_care_team(p_pregnancy) or exists (
    select 1 from public.pregnancies pr
    where pr.id = p_pregnancy
      and (pr.patient_id = public.my_patient_id() or public.companion_can(pr.patient_id, p_companion_perm))
  )
$$;

-- "Today" in the hospital's timezone (the DB clock runs in UTC).
create function public.hospital_today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select timezone from public.hospital_settings where id = 1), 'Asia/Kolkata'))::date
$$;

-- Pure GA math (PLAN.md §10). Mirrored by src/domain/pregnancy-math.ts; both must agree.
-- GA days = p_on - (edd - 280); trimester: < 14w -> 1, < 28w -> 2, else 3.
create function public.ga_from_edd(p_edd date, p_on date)
returns table (weeks int, days int, trimester int, days_to_edd int)
language sql immutable set search_path = '' as $$
  select y.w, x.d - y.w * 7, case when y.w < 14 then 1 when y.w < 28 then 2 else 3 end, p_edd - p_on
  from (select (p_on - (p_edd - 280)) as d) x
  cross join lateral (select floor(x.d / 7.0)::int as w) y
  where p_edd is not null
$$;

-- SECURITY INVOKER: only returns a row if the caller can see the pregnancy under RLS.
create function public.gestational_age(p_pregnancy uuid, p_on date default public.hospital_today())
returns table (weeks int, days int, trimester int, days_to_edd int)
language sql stable set search_path = '' as $$
  select g.weeks, g.days, g.trimester, g.days_to_edd
  from public.pregnancies pr
  cross join lateral public.ga_from_edd(pr.edd_final, p_on) g
  where pr.id = p_pregnancy
$$;

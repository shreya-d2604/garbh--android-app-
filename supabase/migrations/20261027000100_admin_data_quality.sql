-- Admin: data-quality rules and dashboard metrics (PLAN.md §7.6 #1 and #4). Owner: admin agent.
--
-- Every public function here is admin-only: it raises NOT_AUTHENTICATED / NOT_ALLOWED for anyone else
-- (doctor, receptionist, patient, companion). The rule queries live in private.dq_issues(), which the
-- public wrappers call as the function owner, so no RLS applies to the rule queries themselves.

----------------------------------------------------------------------------
-- helpers
----------------------------------------------------------------------------
create function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if public.auth_role() is distinct from 'admin' then
    raise exception 'NOT_ALLOWED';
  end if;
end $$;

-- Service-role callers (Edge Functions) pass the acting admin explicitly; this re-checks them in SQL
-- so a bug in the Edge Function can never let a non-admin act.
create function private.require_active_admin(p_actor uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = p_actor and p.role = 'admin' and p.is_active and p.deleted_at is null
  ) then
    raise exception 'NOT_ALLOWED' using detail = 'actor is not an active admin';
  end if;
end $$;

-- Makes auth.uid() return p_actor for the rest of the transaction, so the audit triggers attribute
-- writes done by a service-role function to the admin who asked for them.
create function private.act_as(p_actor uuid) returns void
language sql volatile set search_path = '' as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true)
$$;

create function private.active_admin_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.profiles p where p.role = 'admin' and p.is_active and p.deleted_at is null
$$;

----------------------------------------------------------------------------
-- Data-quality rules. One row per failing entity.
--   rule        key of the rule (the app maps it to a title and a fix screen)
--   severity    high | medium | low
--   entity_id   the offending row (pregnancy, appointment, consultation, report, summary, patient, lab value)
--   detail      structured facts for the message, never free text
--   since       when the problem started (oldest first in the list)
-- Rules: no_edd, ga_over_42, no_primary, primary_inactive, t3_no_backup, unverified_14d, past_booked,
--        consult_unpublished, lab_unverified_48h, ai_draft_24h, no_app_account, implausible_values.
-- Soft-deleted patients are ignored by every rule.
----------------------------------------------------------------------------
create function private.dq_issues()
returns table (
  rule text, severity text, patient_id uuid, pregnancy_id uuid, entity_id uuid,
  patient_name text, detail jsonb, since timestamptz
)
language sql stable security definer set search_path = '' as $$
  with cfg as (
    select public.hospital_today() as today,
           coalesce((select h.timezone from public.hospital_settings h where h.id = 1), 'Asia/Kolkata') as tz
  ),
  preg as (   -- active pregnancies of live patients, with days since day 0 (edd_final - 280)
    select pr.id, pr.patient_id, pt.full_name, pt.verified_at, pr.edd_final, pr.created_at,
           case when pr.edd_final is null then null else cfg.today - (pr.edd_final - 280) end as ga_days
    from public.pregnancies pr
    join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
    cross join cfg
    where pr.status = 'active'
  ),
  care as (   -- active care-team rows; doctor_ok = still an active doctor account
    select ct.pregnancy_id, ct.care_role,
           (p.is_active and p.deleted_at is null and p.role = 'doctor') as doctor_ok
    from public.care_team ct
    join public.profiles p on p.id = ct.doctor_id
    where ct.removed_at is null
  )
  -- 1. no LMP / EDD
  select 'no_edd'::text, 'high'::text, p.patient_id, p.id, p.id, p.full_name, '{}'::jsonb, p.created_at
  from preg p where p.edd_final is null

  union all -- 2. still active past 42 weeks
  select 'ga_over_42', 'high', p.patient_id, p.id, p.id, p.full_name,
         jsonb_build_object('weeks', p.ga_days / 7, 'days', p.ga_days % 7), p.created_at
  from preg p where p.ga_days > 294

  union all -- 3. no active primary doctor (verified patients only: a self-registered patient
            --    legitimately has no care team until her first booking)
  select 'no_primary', 'high', p.patient_id, p.id, p.id, p.full_name, '{}'::jsonb, p.created_at
  from preg p
  where p.verified_at is not null
    and not exists (select 1 from care c where c.pregnancy_id = p.id and c.care_role = 'primary')

  union all -- 4. care team exists but every doctor on it is deactivated (or no longer a doctor)
  select 'primary_inactive', 'high', p.patient_id, p.id, p.id, p.full_name, '{}'::jsonb, p.created_at
  from preg p
  where exists (select 1 from care c where c.pregnancy_id = p.id)
    and not exists (select 1 from care c where c.pregnancy_id = p.id and c.doctor_ok)

  union all -- 5. third trimester (28w+) with a primary but no usable backup
  select 't3_no_backup', 'medium', p.patient_id, p.id, p.id, p.full_name,
         jsonb_build_object('weeks', p.ga_days / 7), p.created_at
  from preg p
  where p.ga_days >= 196
    and exists (select 1 from care c where c.pregnancy_id = p.id and c.care_role = 'primary')
    and not exists (select 1 from care c where c.pregnancy_id = p.id and c.care_role = 'backup' and c.doctor_ok)

  union all -- 6. self-registered, still unverified after 14 days
  select 'unverified_14d', 'medium', pt.id,
         (select pr.id from public.pregnancies pr where pr.patient_id = pt.id and pr.status = 'active'),
         pt.id, pt.full_name,
         jsonb_build_object('days', extract(day from now() - pt.created_at)::int), pt.created_at
  from public.patients pt
  where pt.verified_at is null and pt.registration_source = 'app' and pt.deleted_at is null
    and pt.created_at < now() - interval '14 days'

  union all -- 7. appointment from an earlier day still booked / confirmed
  select 'past_booked', 'medium', a.patient_id, a.pregnancy_id, a.id, pt.full_name,
         jsonb_build_object('starts_at', a.starts_at, 'status', a.status), a.starts_at
  from public.appointments a
  join public.patients pt on pt.id = a.patient_id and pt.deleted_at is null
  cross join cfg
  where a.status in ('booked', 'confirmed') and (a.starts_at at time zone cfg.tz)::date < cfg.today

  union all -- 8. consultation never published, older than 24 hours
  select 'consult_unpublished', 'medium', pr.patient_id, c.pregnancy_id, c.id, pt.full_name,
         jsonb_build_object('created_at', c.created_at), c.created_at
  from public.consultations c
  join public.pregnancies pr on pr.id = c.pregnancy_id
  join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
  where c.published_at is null and c.created_at < now() - interval '24 hours'

  union all -- 9. lab values still unverified after 48 hours (one row per report)
  select 'lab_unverified_48h', 'medium', pr.patient_id, l.pregnancy_id, l.report_id, pt.full_name,
         jsonb_build_object('count', count(*)), min(l.created_at)
  from public.lab_results l
  join public.pregnancies pr on pr.id = l.pregnancy_id
  join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
  where not l.verified and l.created_at < now() - interval '48 hours'
  group by pr.patient_id, l.pregnancy_id, l.report_id, pt.full_name

  union all -- 10. AI draft waiting for review for more than 24 hours
  select 'ai_draft_24h', 'medium', pr.patient_id, s.pregnancy_id, s.id, pt.full_name,
         jsonb_build_object('source_type', s.source_type), coalesce(s.generated_at, s.created_at)
  from public.ai_summaries s
  join public.pregnancies pr on pr.id = s.pregnancy_id
  join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
  where s.status = 'draft' and coalesce(s.generated_at, s.created_at) < now() - interval '24 hours'

  union all -- 11. patient without an app account
  select 'no_app_account', 'low', pt.id,
         (select pr.id from public.pregnancies pr where pr.patient_id = pt.id and pr.status = 'active'),
         pt.id, pt.full_name, '{}'::jsonb, pt.created_at
  from public.patients pt
  where pt.user_id is null and pt.deleted_at is null

  union all -- 12a. implausible vitals (likely typos). Ranges are deliberately wide: they catch BP 300/20, not high BP.
  select 'implausible_values', 'high', pr.patient_id, c.pregnancy_id, c.id, pt.full_name, v.detail, c.created_at
  from public.consultations c
  join public.pregnancies pr on pr.id = c.pregnancy_id
  join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
  cross join lateral (
    select jsonb_strip_nulls(jsonb_build_object(
      'bp', case when c.bp_systolic not between 60 and 260
                   or c.bp_diastolic not between 30 and 160
                   or c.bp_systolic <= c.bp_diastolic
                 then jsonb_build_object('systolic', c.bp_systolic, 'diastolic', c.bp_diastolic) end,
      'pulse', case when c.pulse not between 30 and 220 then c.pulse end,
      'temperature', case when c.temperature not between 34 and 42 then c.temperature end,
      'spo2', case when c.spo2 < 70 then c.spo2 end,
      'weight_kg', case when c.weight_kg not between 30 and 200 then c.weight_kg end,
      'fetal_heart_rate', case when c.fetal_heart_rate not between 60 and 220 then c.fetal_heart_rate end,
      'fundal_height_cm', case when c.fundal_height_cm not between 5 and 60 then c.fundal_height_cm end
    )) as detail
  ) v
  where v.detail <> '{}'::jsonb

  union all -- 12b. negative lab values
  select 'implausible_values', 'high', pr.patient_id, l.pregnancy_id, l.id, pt.full_name,
         jsonb_build_object('test', l.test_code, 'value', l.value_num), l.created_at
  from public.lab_results l
  join public.pregnancies pr on pr.id = l.pregnancy_id
  join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
  where l.value_num < 0
$$;

-- The list behind the "Data quality" screens: oldest problems first, optionally one rule.
create function public.admin_data_quality_issues(p_rule text default null, p_limit int default 200)
returns table (
  rule text, severity text, patient_id uuid, pregnancy_id uuid, entity_id uuid,
  patient_name text, detail jsonb, since timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select i.rule, i.severity, i.patient_id, i.pregnancy_id, i.entity_id, i.patient_name, i.detail, i.since
    from private.dq_issues() i
    where p_rule is null or i.rule = p_rule
    order by i.since nulls last, i.patient_name
    limit greatest(coalesce(p_limit, 200), 1);
end $$;

-- One row per rule that currently has problems (rules with no problems are simply absent).
create function public.admin_data_quality_counts()
returns table (rule text, severity text, issue_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
    select i.rule, min(i.severity), count(*)
    from private.dq_issues() i
    group by i.rule
    order by i.rule;
end $$;

----------------------------------------------------------------------------
-- Dashboard (PLAN.md §7.6 #1). One row, hospital timezone for "today" and "this week" (Mon-Sun).
-- no_show_rate = no-shows / (completed + no-shows) over the last 30 days, null when there is no data.
----------------------------------------------------------------------------
create function public.admin_dashboard_metrics()
returns table (
  active_pregnancies int, trimester_1 int, trimester_2 int, trimester_3 int, high_risk int,
  appointments_today int, appointments_week int,
  no_show_rate numeric, no_show_sample int,
  ai_pending int, unverified_values int, missed_visits int,
  unverified_patients int, open_issues int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today      date := public.hospital_today();
  v_tz         text := coalesce((select h.timezone from public.hospital_settings h where h.id = 1), 'Asia/Kolkata');
  v_week_start date;
begin
  perform private.require_admin();
  v_week_start := date_trunc('week', v_today::timestamp)::date;

  return query
  select
    (select count(*)::int from public.pregnancies pr
       join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
       where pr.status = 'active'),
    (select count(*)::int from public.pregnancies pr
       join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
       cross join lateral public.ga_from_edd(pr.edd_final, v_today) g
       where pr.status = 'active' and g.trimester = 1),
    (select count(*)::int from public.pregnancies pr
       join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
       cross join lateral public.ga_from_edd(pr.edd_final, v_today) g
       where pr.status = 'active' and g.trimester = 2),
    (select count(*)::int from public.pregnancies pr
       join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
       cross join lateral public.ga_from_edd(pr.edd_final, v_today) g
       where pr.status = 'active' and g.trimester = 3),
    (select count(*)::int from public.pregnancies pr
       join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
       where pr.status = 'active' and pr.risk_level = 'high'),
    (select count(*)::int from public.appointments a
       where a.status <> 'cancelled' and (a.starts_at at time zone v_tz)::date = v_today),
    (select count(*)::int from public.appointments a
       where a.status <> 'cancelled'
         and (a.starts_at at time zone v_tz)::date between v_week_start and v_week_start + 6),
    (select case when count(*) = 0 then null
                 else round(count(*) filter (where a.status = 'no_show')::numeric / count(*), 4) end
       from public.appointments a
       where a.status in ('completed', 'no_show')
         and (a.starts_at at time zone v_tz)::date between v_today - 30 and v_today),
    (select count(*)::int from public.appointments a
       where a.status in ('completed', 'no_show')
         and (a.starts_at at time zone v_tz)::date between v_today - 30 and v_today),
    (select count(*)::int from public.ai_summaries s where s.status = 'draft'),
    (select count(*)::int from public.lab_results l where not l.verified),
    (select count(*)::int from public.visits v
       join public.pregnancies pr on pr.id = v.pregnancy_id and pr.status = 'active'
       join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
       where v.status = 'missed' or (v.status = 'planned' and v.due_to < v_today)),
    (select count(*)::int from public.patients pt
       where pt.verified_at is null and pt.registration_source = 'app' and pt.deleted_at is null),
    (select count(*)::int from private.dq_issues());
end $$;

revoke execute on function public.admin_data_quality_issues(text, int) from public, anon;
grant execute on function public.admin_data_quality_issues(text, int) to authenticated;
revoke execute on function public.admin_data_quality_counts() from public, anon;
grant execute on function public.admin_data_quality_counts() to authenticated;
revoke execute on function public.admin_dashboard_metrics() from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;

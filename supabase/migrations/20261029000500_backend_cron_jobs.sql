-- Backend: scheduled jobs (PLAN.md §8.6). Every job body is a function in schema `private`
-- returning the number of rows it acted on, so pgTAP can call it without waiting for cron.
-- pg_cron runs in UTC; the schedules below are the IST times from the plan (IST = UTC+5:30).
-- Jobs are idempotent: re-running one never notifies twice for the same thing.

----------------------------------------------------------------------------
-- Appointment reminders (24h, 2h): appointments starting in the 15 minutes before the lead
-- time, stamped so they fire once. Patient + companions with `appointments`.
----------------------------------------------------------------------------
create function private.send_reminder(p_appt public.appointments, p_lead text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_doc text; v_when text;
begin
  select p.full_name into v_doc from public.profiles p where p.id = p_appt.doctor_id;
  v_when := private.fmt_when(p_appt.starts_at);
  perform private.notify_patient_side(
    p_appt.patient_id, 'appointment_reminder', 'Appointment reminder',
    format('Reminder: your visit with %s is in %s, on %s.', coalesce(v_doc, 'your doctor'), p_lead, v_when),
    '%s has a visit in ' || p_lead || ', on ' || v_when || '.',
    '/patient/appointments/' || p_appt.id, '/companion/' || p_appt.patient_id || '/appointments', 'appointments',
    jsonb_build_object('appointment_id', p_appt.id));
end $$;

create function private.job_reminders_24h() returns int
language plpgsql security definer set search_path = '' as $$
declare a public.appointments; n int := 0;
begin
  for a in
    select * from public.appointments x
    where x.status in ('booked', 'confirmed') and x.reminder_24h_sent_at is null
      and x.starts_at > now() + interval '23 hours 45 minutes' and x.starts_at <= now() + interval '24 hours'
    for update skip locked
  loop
    perform private.send_reminder(a, '24 hours');
    update public.appointments set reminder_24h_sent_at = now() where id = a.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create function private.job_reminders_2h() returns int
language plpgsql security definer set search_path = '' as $$
declare a public.appointments; n int := 0;
begin
  for a in
    select * from public.appointments x
    where x.status in ('booked', 'confirmed') and x.reminder_2h_sent_at is null
      and x.starts_at > now() + interval '1 hour 45 minutes' and x.starts_at <= now() + interval '2 hours'
    for update skip locked
  loop
    perform private.send_reminder(a, '2 hours');
    update public.appointments set reminder_2h_sent_at = now() where id = a.id;
    n := n + 1;
  end loop;
  return n;
end $$;

----------------------------------------------------------------------------
-- Visit due: planned, unbooked visits whose window opens within 7 days (or is open now).
-- Patient gets a "book now" deep link. Each visit is announced once.
----------------------------------------------------------------------------
create function private.job_visit_due() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_today date := public.hospital_today();
begin
  for r in
    select v.id as visit_id, v.title, v.due_from, v.due_to, pt.id as patient_id, pt.user_id
    from public.visits v
    join public.pregnancies pr on pr.id = v.pregnancy_id and pr.status = 'active'
    join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null and pt.user_id is not null
    where v.status = 'planned' and v.appointment_id is null
      and v.due_from <= v_today + 7 and v.due_to >= v_today
      and not exists (select 1 from public.notifications nf
                      where nf.user_id = pt.user_id and nf.type = 'visit_due' and nf.data ->> 'visit_id' = v.id::text)
  loop
    perform private.notify_user(
      r.user_id, 'visit_due', 'Time to book your next visit',
      format('Your "%s" visit is due between %s and %s. Book a time that suits you.', r.title,
             to_char(r.due_from, 'DD Mon'), to_char(r.due_to, 'DD Mon')),
      jsonb_build_object('route', '/patient/appointments/book?visit=' || r.visit_id,
                         'visit_id', r.visit_id, 'patient_id', r.patient_id));
    n := n + 1;
  end loop;
  return n;
end $$;

----------------------------------------------------------------------------
-- Missed visits: planned, unbooked visits whose window has passed become `missed`.
-- The patient is nudged only for windows that closed in the last 7 days (no flood for a
-- woman who registers late in pregnancy). Reception works from visits.status = 'missed'
-- and from booked appointments in the past (their own worklist queries).
----------------------------------------------------------------------------
create function private.job_missed_visits() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_today date := public.hospital_today();
begin
  for r in
    update public.visits v set status = 'missed'
    where v.status = 'planned' and v.appointment_id is null and v.due_to < v_today
    returning v.id as visit_id, v.pregnancy_id, v.title, v.due_to
  loop
    n := n + 1;
    if r.due_to >= v_today - 7 then
      perform private.notify_user(
        pt.user_id, 'visit_due', 'A visit was missed',
        format('Your "%s" visit window has passed. Please book it as soon as you can.', r.title),
        jsonb_build_object('route', '/patient/appointments/book?visit=' || r.visit_id,
                           'visit_id', r.visit_id, 'patient_id', pt.id))
      from public.pregnancies pr
      join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
      where pr.id = r.pregnancy_id and pr.status = 'active';
    end if;
  end loop;
  return n;
end $$;

----------------------------------------------------------------------------
-- Week milestone / trimester change: when an active pregnancy starts a new gestational week.
-- Patient + companions with `journey`. Once per pregnancy and week.
----------------------------------------------------------------------------
create function private.job_week_updates() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in
    select pr.id as pregnancy_id, pr.patient_id, g.weeks, g.trimester
    from public.pregnancies pr
    join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null and pt.user_id is not null
    cross join lateral public.ga_from_edd(pr.edd_final, public.hospital_today()) g
    where pr.status = 'active' and g.weeks between 4 and 42 and g.days in (0, 1)
      and not exists (select 1 from public.notifications nf
                      where nf.user_id = pt.user_id and nf.type in ('week_update', 'trimester_change')
                        and nf.data ->> 'pregnancy_id' = pr.id::text and nf.data ->> 'week' = g.weeks::text)
  loop
    perform private.notify_patient_side(
      r.patient_id,
      case when r.weeks in (14, 28) then 'trimester_change' else 'week_update' end,
      case when r.weeks in (14, 28) then format('Trimester %s begins', r.trimester) else format('You are now %s weeks', r.weeks) end,
      format('You are now %s weeks pregnant. See what is new this week.', r.weeks),
      '%s is now ' || r.weeks || ' weeks pregnant.',
      '/patient/journey', '/companion/' || r.patient_id || '/journey', 'journey',
      jsonb_build_object('pregnancy_id', r.pregnancy_id, 'week', r.weeks));
    n := n + 1;
  end loop;
  return n;
end $$;

----------------------------------------------------------------------------
-- Companion invites: codes past their expiry are revoked.
----------------------------------------------------------------------------
create function private.job_expire_invites() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.companion_invites set revoked_at = now()
    where used_at is null and revoked_at is null and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

----------------------------------------------------------------------------
-- Data-quality nudges (once a day per recipient, only when there is something to fix):
--   stale AI drafts   draft generated more than 24 h ago, still unreviewed
--   unverified values AI-extracted lab values unverified for more than 48 h
-- Doctors hear about their own care-team patients; every admin hears the hospital total.
----------------------------------------------------------------------------
create function private.job_data_quality() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_today date := public.hospital_today();
begin
  for r in
    with doc as (
      select ct.doctor_id as user_id, '/doctor/patients'::text as route,
             count(distinct s.id) as drafts, count(distinct lr.id) as vals
      from public.care_team ct
      left join public.ai_summaries s on s.pregnancy_id = ct.pregnancy_id and s.status = 'draft'
           and coalesce(s.generated_at, s.created_at) < now() - interval '24 hours'
      left join public.lab_results lr on lr.pregnancy_id = ct.pregnancy_id and not lr.verified
           and lr.source = 'ai_extracted' and lr.created_at < now() - interval '48 hours'
      where ct.removed_at is null
      group by ct.doctor_id
    ), adm as (
      select p.id as user_id, '/admin/data-quality'::text as route,
             (select count(*) from public.ai_summaries s
               where s.status = 'draft' and coalesce(s.generated_at, s.created_at) < now() - interval '24 hours') as drafts,
             (select count(*) from public.lab_results lr
               where not lr.verified and lr.source = 'ai_extracted' and lr.created_at < now() - interval '48 hours') as vals
      from public.profiles p where p.role = 'admin'
    )
    select * from (select * from doc union all select * from adm) x where x.drafts + x.vals > 0
  loop
    if not exists (
      select 1 from public.notifications nf
      where nf.user_id = r.user_id and nf.type = 'data_quality'
        and (nf.created_at at time zone coalesce((select timezone from public.hospital_settings where id = 1), 'Asia/Kolkata'))::date = v_today
    ) and private.notify_user(
      r.user_id, 'data_quality', 'Data quality check',
      format('%s AI draft(s) and %s lab value(s) are waiting for review.', r.drafts, r.vals),
      jsonb_build_object('route', r.route, 'ai_drafts', r.drafts, 'unverified_values', r.vals)) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

----------------------------------------------------------------------------
-- Schedules (UTC). Re-running this migration on a reset database re-creates them by name.
----------------------------------------------------------------------------
select cron.schedule('garbh-reminders-24h',  '*/15 * * * *', 'select private.job_reminders_24h()');
select cron.schedule('garbh-reminders-2h',   '*/15 * * * *', 'select private.job_reminders_2h()');
select cron.schedule('garbh-visit-due',      '30 3 * * *',   'select private.job_visit_due()');       -- 09:00 IST
select cron.schedule('garbh-missed-visits',  '30 17 * * *',  'select private.job_missed_visits()');   -- 23:00 IST
select cron.schedule('garbh-week-updates',   '30 2 * * *',   'select private.job_week_updates()');    -- 08:00 IST
select cron.schedule('garbh-expire-invites', '5 * * * *',    'select private.job_expire_invites()');  -- hourly
select cron.schedule('garbh-data-quality',   '30 4 * * *',   'select private.job_data_quality()');    -- 10:00 IST

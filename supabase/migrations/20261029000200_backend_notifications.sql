-- Backend: notifications (PLAN.md §8.5, §11, contracts §6).
--   * mark-read policy (read_at only) and push token policies
--   * register_push_token() so a device that changes hands is re-assigned to the new user
--   * triggers that create the notification rows for every event of §11 that is data-driven
--     (time-driven events live in the cron migration)
--   * dispatch of every new notification to the send-push Edge Function through pg_net
-- Lock-screen push text is generic and is built in send-push, never copied from these rows.
-- Notification code must never break the clinical write that fired it, so every trigger
-- body is wrapped: a failure becomes a WARNING (SQLSTATE only, no data) and the write proceeds.

----------------------------------------------------------------------------
-- Policies
----------------------------------------------------------------------------
-- A user may only change read_at on their own notifications.
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_self_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_tokens_self_insert on public.push_tokens for insert to authenticated
  with check (user_id = auth.uid() and public.auth_role() is not null);
create policy push_tokens_self_update on public.push_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_self_delete on public.push_tokens for delete to authenticated
  using (user_id = auth.uid());

-- Upsert that also moves a token to the caller when the device changed hands (a plain upsert
-- would hit the RLS wall of the previous owner's row and the old user would keep getting pushes).
create function public.register_push_token(p_token text, p_platform text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if public.auth_role() is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_token is null or p_token !~ '^(Expo|Exponent)PushToken\[[^\]]+\]$' then
    raise exception 'INVALID_INPUT' using detail = 'not an Expo push token';
  end if;
  insert into public.push_tokens (user_id, expo_push_token, platform, last_seen_at)
  values (auth.uid(), p_token, nullif(p_platform, ''), now())
  on conflict (expo_push_token)
  do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;
revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

----------------------------------------------------------------------------
-- Helpers (schema private; only called from SECURITY DEFINER code)
----------------------------------------------------------------------------
create function private.notify_user(p_user uuid, p_type text, p_title text, p_body text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_user is null or not exists (
    select 1 from public.profiles p where p.id = p_user and p.is_active and p.deleted_at is null
  ) then
    return null;
  end if;
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- "Fri 24 Oct, 11:00 AM" in the hospital timezone.
create function private.fmt_when(p_ts timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select to_char(p_ts at time zone coalesce((select timezone from public.hospital_settings where id = 1), 'Asia/Kolkata'),
                 'Dy DD Mon, HH12:MI AM')
$$;

-- The patient (when she has an account) and approved companions who hold p_perm AND
-- receive_notifications (PLAN.md §11 footnote). Companion routes are supplied by the caller.
create function private.notify_patient_side(
  p_patient uuid, p_type text, p_title text, p_patient_body text, p_companion_body text,
  p_patient_route text, p_companion_route text, p_companion_perm text, p_extra jsonb default '{}'
) returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  perform private.notify_user(pt.user_id, p_type, p_title, p_patient_body,
                              jsonb_build_object('route', p_patient_route, 'patient_id', pt.id) || p_extra)
  from public.patients pt
  where pt.id = p_patient and pt.deleted_at is null and pt.user_id is not null;

  for r in
    select l.companion_user_id, pt.full_name
    from public.companion_links l
    join public.patients pt on pt.id = l.patient_id and pt.deleted_at is null
    where l.patient_id = p_patient and l.status = 'approved' and l.receive_notifications
      and case p_companion_perm
            when 'appointments'  then l.can_view_appointments
            when 'journey'       then l.can_view_journey
            when 'summaries'     then l.can_view_summaries
            when 'reports'       then l.can_view_reports
            when 'prescriptions' then l.can_view_prescriptions
            else false
          end
  loop
    perform private.notify_user(r.companion_user_id, p_type, p_title,
                                format(p_companion_body, split_part(r.full_name, ' ', 1)),
                                jsonb_build_object('route', p_companion_route, 'patient_id', p_patient) || p_extra);
  end loop;
end $$;

-- Active care-team doctors of a pregnancy, optionally skipping one user (the actor).
create function private.notify_care_team(
  p_pregnancy uuid, p_type text, p_title text, p_body text, p_route text,
  p_extra jsonb default '{}', p_skip uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select ct.doctor_id from public.care_team ct
    where ct.pregnancy_id = p_pregnancy and ct.removed_at is null and ct.doctor_id is distinct from p_skip
  loop
    perform private.notify_user(r.doctor_id, p_type, p_title, p_body,
                                jsonb_build_object('route', p_route, 'pregnancy_id', p_pregnancy) || p_extra);
  end loop;
end $$;

----------------------------------------------------------------------------
-- Appointments: booked / changed / cancelled (any channel) + patient checked in
--   patient + permitted companions + the appointment's doctor (unless the doctor is the actor).
--   Reception never gets notifications (it sees bookings live in the calendar).
--   A reschedule is cancel-old + insert-new in one transaction; it produces ONE "changed"
--   notification, whichever order the two writes happen in.
----------------------------------------------------------------------------
create function private.trg_appointment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_type    text;
  v_title   text;
  v_doc     text;
  v_when    text;
  v_patient_body text;
  v_comp_body    text;
  v_doc_body     text;
  v_doc_type     text;
  v_succ    public.appointments%rowtype;
  v_old     public.appointments%rowtype;
  v_notify_patient boolean := true;
begin
  begin
    if tg_op = 'INSERT' then
      if new.status not in ('booked', 'confirmed') then
        return null;
      end if;
      v_type := case when new.rescheduled_from is not null then 'appointment_changed' else 'appointment_booked' end;
      v_doc_type := v_type;
      if new.rescheduled_from is not null then
        select * into v_old from public.appointments a where a.id = new.rescheduled_from;
        -- A different doctor receives a fresh booking, not a change.
        if v_old.doctor_id is distinct from new.doctor_id then
          v_doc_type := 'appointment_booked';
        end if;
        -- Drop the "cancelled" notices the cancel half of this reschedule already produced
        -- (kept for the old doctor when the doctor changed: they really lost the visit).
        delete from public.notifications n
        where n.type = 'appointment_cancelled' and n.created_at = now()
          and n.data ->> 'appointment_id' = new.rescheduled_from::text
          and (v_old.doctor_id is not distinct from new.doctor_id or n.user_id is distinct from v_old.doctor_id);
      end if;
    else
      if new.status = 'checked_in' and old.status is distinct from 'checked_in' then
        perform private.notify_user(new.doctor_id, 'patient_checked_in', 'Patient checked in',
                                    'A patient has checked in for their visit.',
                                    jsonb_build_object('route', '/doctor/today', 'appointment_id', new.id,
                                                       'pregnancy_id', new.pregnancy_id));
        return null;
      elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
        select * into v_succ from public.appointments a where a.rescheduled_from = new.id limit 1;
        if found then
          -- Rescheduled: the successor's insert notifies patient side; only a doctor who
          -- loses the visit still needs to hear about the cancellation.
          if v_succ.doctor_id is not distinct from new.doctor_id then
            return null;
          end if;
          v_notify_patient := false;
        end if;
        v_type := 'appointment_cancelled';
        v_doc_type := v_type;
      elsif new.status in ('booked', 'confirmed')
            and (new.starts_at is distinct from old.starts_at or new.doctor_id is distinct from old.doctor_id) then
        v_type := 'appointment_changed';
        v_doc_type := v_type;
      else
        return null;
      end if;
    end if;

    select p.full_name into v_doc from public.profiles p where p.id = new.doctor_id;
    v_when := private.fmt_when(new.starts_at);
    v_doc := coalesce(v_doc, 'your doctor');

    if v_notify_patient then
      v_title := case v_type
        when 'appointment_booked' then 'Appointment booked'
        when 'appointment_changed' then 'Appointment changed'
        else 'Appointment cancelled' end;
      v_patient_body := case v_type
        when 'appointment_booked' then format('Your visit with %s is on %s.', v_doc, v_when)
        when 'appointment_changed' then format('Your visit with %s is now on %s.', v_doc, v_when)
        else format('Your visit with %s on %s was cancelled.', v_doc, v_when) end;
      v_comp_body := case v_type
        when 'appointment_booked' then '%s has a visit booked on ' || v_when || '.'
        when 'appointment_changed' then '%s''s visit has moved to ' || v_when || '.'
        else '%s''s visit on ' || v_when || ' was cancelled.' end;
      perform private.notify_patient_side(
        new.patient_id, v_type, v_title, v_patient_body, v_comp_body,
        '/patient/appointments/' || new.id, '/companion/' || new.patient_id || '/appointments', 'appointments',
        jsonb_build_object('appointment_id', new.id));
    end if;

    if new.doctor_id is distinct from auth.uid() then
      perform private.notify_user(new.doctor_id, v_doc_type,
        case v_doc_type when 'appointment_booked' then 'New booking'
                        when 'appointment_changed' then 'Booking changed'
                        else 'Booking cancelled' end,
        case v_doc_type when 'appointment_booked' then 'A visit was booked for ' || v_when || '.'
                        when 'appointment_changed' then 'A visit now takes place on ' || v_when || '.'
                        else 'The visit on ' || v_when || ' was cancelled.' end,
        jsonb_build_object('route', '/doctor/today', 'appointment_id', new.id, 'pregnancy_id', new.pregnancy_id));
    end if;
  exception when others then
    raise warning 'appointment notification failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger appointment_notify
  after insert or update of status, starts_at, doctor_id on public.appointments
  for each row execute function private.trg_appointment_notify();

----------------------------------------------------------------------------
-- Doctor time off that clashes with booked appointments -> "please rebook"
----------------------------------------------------------------------------
create function private.trg_time_off_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  begin
    for r in
      select a.id, a.patient_id, a.starts_at
      from public.appointments a
      where a.doctor_id = new.doctor_id and a.status in ('booked', 'confirmed')
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(new.starts_at, new.ends_at)
        and not exists (
          select 1 from public.notifications n
          where n.type = 'appointment_changed' and n.data ->> 'appointment_id' = a.id::text
            and n.data ->> 'time_off_id' = new.id::text)
    loop
      perform private.notify_patient_side(
        r.patient_id, 'appointment_changed', 'Please rebook your visit',
        'Your doctor is not available on ' || private.fmt_when(r.starts_at) || '. Please rebook.',
        '%s''s doctor is not available on ' || private.fmt_when(r.starts_at) || '. A new time is needed.',
        '/patient/appointments/' || r.id, '/companion/' || r.patient_id || '/appointments', 'appointments',
        jsonb_build_object('appointment_id', r.id, 'time_off_id', new.id));
    end loop;
  exception when others then
    raise warning 'time-off notification failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger time_off_notify
  after insert or update of starts_at, ends_at on public.doctor_time_off
  for each row execute function private.trg_time_off_notify();

----------------------------------------------------------------------------
-- Account verified at the desk (verified_at null -> set), patient has an account
----------------------------------------------------------------------------
create function private.trg_patient_verified_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if old.verified_at is null and new.verified_at is not null and new.user_id is not null then
      perform private.notify_user(new.user_id, 'account_verified', 'Your account is verified',
                                  'Thank you. Your account is verified and you can now invite family members.',
                                  jsonb_build_object('route', '/patient', 'patient_id', new.id));
    end if;
  exception when others then
    raise warning 'verification notification failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger patient_verified_notify
  after update of verified_at on public.patients
  for each row execute function private.trg_patient_verified_notify();

----------------------------------------------------------------------------
-- Consultation published (advice + prescriptions): patient + companions with `prescriptions`
----------------------------------------------------------------------------
create function private.trg_consultation_published_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_patient uuid;
begin
  begin
    if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
      select pr.patient_id into v_patient from public.pregnancies pr where pr.id = new.pregnancy_id;
      perform private.notify_patient_side(
        v_patient, 'consultation_published', 'New update from your doctor',
        'Your doctor has shared advice and prescriptions from your visit.',
        'New advice and prescriptions were shared for %s.',
        '/patient/prescriptions', '/companion/' || v_patient || '/prescriptions', 'prescriptions',
        jsonb_build_object('consultation_id', new.id));
    end if;
  exception when others then
    raise warning 'consultation notification failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger consultation_published_notify
  after insert or update of published_at on public.consultations
  for each row execute function private.trg_consultation_published_notify();

----------------------------------------------------------------------------
-- Report added (first file attached to a report): patient + companions with `reports`
----------------------------------------------------------------------------
create function private.trg_report_file_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_patient uuid; v_pregnancy uuid;
begin
  begin
    if not exists (select 1 from public.report_files f where f.report_id = new.report_id and f.id <> new.id) then
      select r.pregnancy_id into v_pregnancy
        from public.reports r where r.id = new.report_id and r.deleted_at is null;
      select pr.patient_id into v_patient from public.pregnancies pr where pr.id = v_pregnancy;
      if v_patient is not null then
        perform private.notify_patient_side(
          v_patient, 'report_added', 'New report added',
          'A new report was added to your records.',
          'A new report was added for %s.',
          '/patient/reports/' || new.report_id, '/companion/' || v_patient || '/reports', 'reports',
          jsonb_build_object('report_id', new.report_id));
      end if;
    end if;
  exception when others then
    raise warning 'report notification failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger report_file_notify
  after insert on public.report_files
  for each row execute function private.trg_report_file_notify();

----------------------------------------------------------------------------
-- Companion links: request -> patient; decision -> companion
----------------------------------------------------------------------------
create function private.trg_companion_link_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_patient_user uuid;
begin
  begin
    if tg_op = 'INSERT' then
      if new.status = 'pending' then
        select pt.user_id into v_patient_user from public.patients pt where pt.id = new.patient_id and pt.deleted_at is null;
        select p.full_name into v_name from public.profiles p where p.id = new.companion_user_id;
        perform private.notify_user(v_patient_user, 'companion_request', 'Family member request',
                                    coalesce(v_name, 'Someone') || ' would like to follow your pregnancy updates.',
                                    jsonb_build_object('route', '/patient/companions', 'link_id', new.id));
      end if;
    elsif new.status is distinct from old.status then
      if old.status = 'pending' and new.status = 'approved' then
        perform private.notify_user(new.companion_user_id, 'companion_approved', 'Request approved',
                                    'You can now follow the updates that were shared with you.',
                                    jsonb_build_object('route', '/companion', 'patient_id', new.patient_id, 'link_id', new.id));
      elsif (old.status = 'approved' and new.status = 'revoked') or (old.status = 'pending' and new.status = 'rejected') then
        perform private.notify_user(new.companion_user_id, 'companion_revoked',
                                    case new.status when 'revoked' then 'Access ended' else 'Request declined' end,
                                    case new.status when 'revoked' then 'Your access to a family member''s updates has ended.'
                                                    else 'Your request to follow updates was not accepted.' end,
                                    jsonb_build_object('route', '/companion', 'patient_id', new.patient_id, 'link_id', new.id));
      end if;
    end if;
  exception when others then
    raise warning 'companion notification failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger companion_link_notify
  after insert or update of status on public.companion_links
  for each row execute function private.trg_companion_link_notify();

----------------------------------------------------------------------------
-- Care team: backup added / removed, primary handed over -> the affected doctor.
-- The very first primary of a pregnancy is not announced (registration / first booking).
----------------------------------------------------------------------------
create function private.trg_care_team_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_body text; v_route text;
begin
  begin
    if new.doctor_id is not distinct from auth.uid() then
      return null;
    end if;
    v_route := '/doctor/patient/' || new.pregnancy_id;
    if tg_op = 'INSERT' then
      if new.removed_at is not null then
        return null;
      elsif new.care_role = 'backup' then
        v_body := 'You were added as a backup doctor for a patient.';
      elsif exists (select 1 from public.care_team c where c.pregnancy_id = new.pregnancy_id and c.id <> new.id) then
        v_body := 'You are now the primary doctor for a patient.';
      else
        return null;
      end if;
    elsif new.removed_at is not null and old.removed_at is null then
      v_body := 'You were removed from a patient''s care team.';
      v_route := '/doctor/patients';
    elsif new.removed_at is null and new.care_role is distinct from old.care_role then
      v_body := case new.care_role
        when 'primary' then 'You are now the primary doctor for a patient.'
        else 'Primary care of a patient was handed over. You remain on the care team as a backup.' end;
    else
      return null;
    end if;
    perform private.notify_user(new.doctor_id, 'care_team_changed', 'Care team update', v_body,
                                jsonb_build_object('route', v_route, 'pregnancy_id', new.pregnancy_id));
  exception when others then
    raise warning 'care team notification failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger care_team_notify
  after insert or update of care_role, removed_at on public.care_team
  for each row execute function private.trg_care_team_notify();

----------------------------------------------------------------------------
-- Push dispatch: every new notification is handed to the send-push Edge Function via pg_net.
-- Configuration lives in Vault (never in the repo):
--   push_service_key   service-role key sent as the bearer token (REQUIRED; without it dispatch is a no-op)
--   push_function_url  optional, default http://kong:8000/functions/v1/send-push (local stack)
-- Users without a registered device token are skipped. A dispatch failure never blocks the insert.
----------------------------------------------------------------------------
create function private.dispatch_push(p_notification uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_url text;
begin
  select ds.decrypted_secret into v_key from vault.decrypted_secrets ds where ds.name = 'push_service_key' limit 1;
  if v_key is null or v_key = '' then
    return false;
  end if;
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'push_function_url' limit 1;
  perform net.http_post(
    url     := coalesce(nullif(v_url, ''), 'http://kong:8000/functions/v1/send-push'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := jsonb_build_object('notification_id', p_notification));
  return true;
end $$;

create function private.trg_notification_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if exists (select 1 from public.push_tokens t where t.user_id = new.user_id) then
      perform private.dispatch_push(new.id);
    end if;
  exception when others then
    raise warning 'push dispatch failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger notification_push
  after insert on public.notifications
  for each row execute function private.trg_notification_push();

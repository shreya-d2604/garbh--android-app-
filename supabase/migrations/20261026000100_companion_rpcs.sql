-- Companion invite / link RPCs (PLAN.md §8.1, docs/contracts.md §4). Owner: companion agent.
-- Replaces the NOT_IMPLEMENTED stubs from 20261023001200 with the SAME signatures.
--
-- Security notes
--   * Invite codes are never stored: only sha256(code || pepper). The pepper lives in
--     private.app_secrets (schema `private` is not exposed through the API).
--   * Companion tables have no write policies; every write goes through these SECURITY DEFINER RPCs.
--   * redeem_companion_code does NOT raise for a wrong / expired / used / revoked code. It records the
--     failed attempt and returns NULL. A raised exception rolls the whole request back (PostgREST runs
--     each RPC in one transaction), which would also roll back the attempt log and make the
--     "5 failures per hour" lock-out a no-op. See the function comment.

-- ---------------------------------------------------------------- pepper + helpers
create table private.app_secrets (
  key   text primary key,
  value text not null
);
alter table private.app_secrets enable row level security;   -- no policies: never readable through the API
revoke all on private.app_secrets from public, anon, authenticated;

insert into private.app_secrets (key, value)
values ('companion_invite_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- sha256(normalised code || pepper) as hex. The code must already be normalised (6 chars, upper case).
create function private.companion_code_hash(p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(
    extensions.digest(
      p_code || (select s.value from private.app_secrets s where s.key = 'companion_invite_pepper'),
      'sha256'),
    'hex')
$$;

-- 6 random symbols from a 31-symbol alphabet without 0 O 1 I L (31^6 = 887,503,681 codes).
-- Rejection sampling (248 = 31 * 8) keeps every symbol equally likely.
create function private.companion_new_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_byte int;
begin
  while length(v_code) < 6 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < 248 then
      v_code := v_code || substr(c_alphabet, (v_byte % 31) + 1, 1);
    end if;
  end loop;
  return v_code;
end $$;

-- ---------------------------------------------------------------- create_companion_invite
-- Patient only, verified only. Revokes every outstanding invite of the patient, then creates one
-- (24 h, single use, expires_at default) and returns the plaintext code "XXX-XXX" exactly once.
create or replace function public.create_companion_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_patient public.patients%rowtype;
  v_code    text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Lock the patient row: two concurrent calls cannot both leave an active invite behind.
  select pt.* into v_patient from public.patients pt
  where pt.id = public.my_patient_id() for update;
  if not found then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_patient.verified_at is null then
    raise exception 'NOT_VERIFIED';
  end if;

  update public.companion_invites i set revoked_at = now()
  where i.patient_id = v_patient.id and i.revoked_at is null and i.used_at is null;

  loop
    v_code := private.companion_new_code();
    begin
      insert into public.companion_invites (patient_id, code_hash)
      values (v_patient.id, private.companion_code_hash(v_code));
      exit;
    exception when unique_violation then
      null;   -- astronomically unlikely hash collision with an old invite: draw again
    end;
  end loop;

  return substr(v_code, 1, 3) || '-' || substr(v_code, 4, 3);
end $$;

-- ---------------------------------------------------------------- redeem_companion_code
-- Companion only. Normalises the code (strips spaces and '-', upper-cases).
--   * p_relation not in the allowed list           -> raises INVALID_INPUT (not an attempt)
--   * 5 or more failed attempts in the last hour   -> raises RATE_LIMITED (PLAN.md §8.1: <= 5 per hour)
--   * code unknown / expired / already used / revoked / patient deleted
--                                                  -> logs a failed attempt and RETURNS NULL
--   * already pending/approved link to that patient -> raises ALREADY_LINKED (invite stays unused)
--   * otherwise: pending link created, invite marked used, success logged, link id returned.
-- Returning NULL instead of raising INVALID_CODE / CODE_EXPIRED is deliberate (see file header):
-- the client maps NULL to a single "not valid or expired" message, which also avoids telling a
-- guesser that a code existed but has expired.
create or replace function public.redeem_companion_code(p_code text, p_relation text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_invite public.companion_invites%rowtype;
  v_link   uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if public.auth_role() is distinct from 'companion' then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_relation is null or p_relation not in
     ('husband','mother','father','mother_in_law','father_in_law','sibling','friend','other') then
    raise exception 'INVALID_INPUT' using detail = 'unknown relation';
  end if;

  -- One attempt at a time per user, so parallel guesses cannot slip past the counter.
  perform pg_advisory_xact_lock(hashtextextended('companion_redeem:' || v_uid::text, 0));

  if (select count(*) from public.code_redeem_attempts a
      where a.user_id = v_uid and not a.success and a.attempted_at > now() - interval '1 hour') >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  if v_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$' then
    select i.* into v_invite from public.companion_invites i
    where i.code_hash = private.companion_code_hash(v_code) for update;
  end if;

  if v_invite.id is null
     or v_invite.revoked_at is not null
     or v_invite.used_at is not null
     or v_invite.expires_at <= now()
     or not exists (select 1 from public.patients pt
                    where pt.id = v_invite.patient_id and pt.deleted_at is null) then
    insert into public.code_redeem_attempts (user_id, success) values (v_uid, false);
    return null;
  end if;

  if exists (select 1 from public.companion_links l
             where l.patient_id = v_invite.patient_id and l.companion_user_id = v_uid
               and l.status in ('pending','approved')) then
    raise exception 'ALREADY_LINKED';
  end if;

  insert into public.companion_links (patient_id, companion_user_id, relation)
  values (v_invite.patient_id, v_uid, p_relation)
  returning id into v_link;

  update public.companion_invites set used_at = now() where id = v_invite.id;
  insert into public.code_redeem_attempts (user_id, success) values (v_uid, true);
  return v_link;
end $$;

-- ---------------------------------------------------------------- decide_companion_link
-- The patient who owns the link. pending -> approved (permissions from p_perms, missing = false)
-- or rejected. approved + p_approve = true only replaces the permission flags.
-- p_perms keys: appointments, journey, summaries, reports, prescriptions, notifications (booleans).
create or replace function public.decide_companion_link(p_link uuid, p_approve boolean, p_perms jsonb default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_link  public.companion_links%rowtype;
  v_perms jsonb := coalesce(p_perms, '{}'::jsonb);
  v_key   text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if public.my_patient_id() is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_approve is null or jsonb_typeof(v_perms) <> 'object' then
    raise exception 'INVALID_INPUT';
  end if;
  for v_key in select jsonb_object_keys(v_perms) loop
    if v_key not in ('appointments','journey','summaries','reports','prescriptions','notifications')
       or jsonb_typeof(v_perms -> v_key) <> 'boolean' then
      raise exception 'INVALID_INPUT' using detail = 'bad permission key or value';
    end if;
  end loop;

  select l.* into v_link from public.companion_links l where l.id = p_link for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_link.patient_id <> public.my_patient_id() then
    raise exception 'NOT_ALLOWED';
  end if;

  if v_link.status = 'pending' and not p_approve then
    update public.companion_links set status = 'rejected', decided_at = now() where id = v_link.id;
    return;
  end if;
  if not (p_approve and v_link.status in ('pending','approved')) then
    raise exception 'INVALID_STATUS_CHANGE';
  end if;

  update public.companion_links set
    status                 = 'approved',
    decided_at             = coalesce(decided_at, now()),
    can_view_appointments  = coalesce((v_perms ->> 'appointments')::boolean, false),
    can_view_journey       = coalesce((v_perms ->> 'journey')::boolean, false),
    can_view_summaries     = coalesce((v_perms ->> 'summaries')::boolean, false),
    can_view_reports       = coalesce((v_perms ->> 'reports')::boolean, false),
    can_view_prescriptions = coalesce((v_perms ->> 'prescriptions')::boolean, false),
    receive_notifications  = coalesce((v_perms ->> 'notifications')::boolean, false)
  where id = v_link.id;
end $$;

-- ---------------------------------------------------------------- end_companion_link
-- The patient revokes (-> revoked); the companion leaves (-> left). Only from pending / approved.
-- Access ends at once: every companion read policy requires status = 'approved'.
create or replace function public.end_companion_link(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_link public.companion_links%rowtype;
  v_new  public.link_status;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select l.* into v_link from public.companion_links l where l.id = p_link for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_link.patient_id = public.my_patient_id() then
    v_new := 'revoked';
  elsif v_link.companion_user_id = auth.uid() and public.auth_role() = 'companion' then
    v_new := 'left';
  else
    raise exception 'NOT_ALLOWED';
  end if;

  if v_link.status not in ('pending','approved') then
    raise exception 'INVALID_STATUS_CHANGE';
  end if;

  update public.companion_links set status = v_new where id = v_link.id;
end $$;

-- ---------------------------------------------------------------- privileges
revoke execute on function private.companion_code_hash(text) from public, anon, authenticated;
revoke execute on function private.companion_new_code() from public, anon, authenticated;

revoke execute on function public.create_companion_invite() from public, anon;
grant  execute on function public.create_companion_invite() to authenticated;
revoke execute on function public.redeem_companion_code(text, text) from public, anon;
grant  execute on function public.redeem_companion_code(text, text) to authenticated;
revoke execute on function public.decide_companion_link(uuid, boolean, jsonb) from public, anon;
grant  execute on function public.decide_companion_link(uuid, boolean, jsonb) to authenticated;
revoke execute on function public.end_companion_link(uuid) from public, anon;
grant  execute on function public.end_companion_link(uuid) to authenticated;

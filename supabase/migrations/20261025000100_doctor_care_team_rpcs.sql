-- Care-team RPCs (docs/contracts.md §3). Owner: doctor.
-- Replace the stubs from 20261023001200 with `create or replace`, keeping each signature
-- byte-for-byte identical. Writes to care_team happen ONLY through these functions (there is
-- no INSERT/UPDATE/DELETE policy on the table for anyone but admin).
--
-- Who may call: the ACTIVE PRIMARY doctor of the pregnancy, or an admin.
--   other doctors (backups, doctors not on the team) -> PRIMARY_REQUIRED
--   receptionist / patient / companion               -> NOT_ALLOWED
-- A backup therefore cannot add or remove doctors or hand over the primary role.

----------------------------------------------------------------------------
-- Shared guard. Locks the pregnancy row so two concurrent team changes serialise
-- (the partial unique indexes on care_team would otherwise raise 23505 under a race).
----------------------------------------------------------------------------
create function private.require_care_team_manager(p_pregnancy uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.auth_role();
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_role = 'doctor' then
    if not public.is_primary_doctor(p_pregnancy) then
      raise exception 'PRIMARY_REQUIRED';
    end if;
  elsif v_role is distinct from 'admin' then
    raise exception 'NOT_ALLOWED';
  end if;

  perform 1 from public.pregnancies pr where pr.id = p_pregnancy for update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'pregnancy';
  end if;
end $$;

-- The target of an add / hand-over must be an active, non-deleted doctor.
create function private.require_active_doctor(p_doctor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_doctor is null or not exists (
    select 1 from public.profiles p
    where p.id = p_doctor and p.role = 'doctor' and p.is_active and p.deleted_at is null
  ) then
    raise exception 'INVALID_INPUT' using detail = 'target must be an active doctor';
  end if;
end $$;

----------------------------------------------------------------------------
-- add_backup_doctor
----------------------------------------------------------------------------
create or replace function public.add_backup_doctor(p_pregnancy uuid, p_doctor uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_care_team_manager(p_pregnancy);
  perform private.require_active_doctor(p_doctor);

  if exists (
    select 1 from public.care_team ct
    where ct.pregnancy_id = p_pregnancy and ct.doctor_id = p_doctor and ct.removed_at is null
  ) then
    raise exception 'ALREADY_LINKED';
  end if;

  insert into public.care_team (pregnancy_id, doctor_id, care_role, added_by, note)
  values (p_pregnancy, p_doctor, 'backup', auth.uid(), nullif(btrim(p_note), ''));
end $$;

----------------------------------------------------------------------------
-- remove_care_team_member: soft removal; access ends at once because every clinical
-- policy goes through on_care_team(), which only counts rows with removed_at is null.
-- The target does not have to be an ACTIVE doctor profile: a deactivated doctor must still
-- be removable.
----------------------------------------------------------------------------
create or replace function public.remove_care_team_member(p_pregnancy uuid, p_doctor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.care_team%rowtype;
begin
  perform private.require_care_team_manager(p_pregnancy);

  select * into v_member from public.care_team ct
  where ct.pregnancy_id = p_pregnancy and ct.doctor_id = p_doctor and ct.removed_at is null;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'not on the care team';
  end if;
  if v_member.care_role = 'primary' then
    raise exception 'INVALID_INPUT' using detail = 'hand over the primary role before removing';
  end if;

  update public.care_team set removed_at = now(), removed_by = auth.uid() where id = v_member.id;
end $$;

----------------------------------------------------------------------------
-- hand_over_primary: the old primary (if any) becomes a backup and the new doctor becomes the
-- primary. Roles are changed IN PLACE on the existing active rows (a new row is inserted only
-- when the new primary was not on the team), demoting first so the "one active primary"
-- unique index is never violated. An admin may call it for a pregnancy that has no primary.
----------------------------------------------------------------------------
create or replace function public.hand_over_primary(p_pregnancy uuid, p_new_primary uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.care_team%rowtype;
  v_new public.care_team%rowtype;
begin
  perform private.require_care_team_manager(p_pregnancy);
  perform private.require_active_doctor(p_new_primary);

  select * into v_old from public.care_team ct
  where ct.pregnancy_id = p_pregnancy and ct.care_role = 'primary' and ct.removed_at is null;
  if found and v_old.doctor_id = p_new_primary then
    raise exception 'INVALID_INPUT' using detail = 'already the primary';
  end if;

  select * into v_new from public.care_team ct
  where ct.pregnancy_id = p_pregnancy and ct.doctor_id = p_new_primary and ct.removed_at is null;

  if v_old.id is not null then
    update public.care_team set care_role = 'backup' where id = v_old.id;
  end if;

  if v_new.id is not null then
    update public.care_team set care_role = 'primary' where id = v_new.id;
  else
    insert into public.care_team (pregnancy_id, doctor_id, care_role, added_by)
    values (p_pregnancy, p_new_primary, 'primary', auth.uid());
  end if;
end $$;

----------------------------------------------------------------------------
-- Privileges (AGENTS.md §4): nothing callable by anon; helpers live in `private`.
----------------------------------------------------------------------------
revoke execute on function public.add_backup_doctor(uuid, uuid, text) from public, anon;
grant execute on function public.add_backup_doctor(uuid, uuid, text) to authenticated;
revoke execute on function public.remove_care_team_member(uuid, uuid) from public, anon;
grant execute on function public.remove_care_team_member(uuid, uuid) to authenticated;
revoke execute on function public.hand_over_primary(uuid, uuid) from public, anon;
grant execute on function public.hand_over_primary(uuid, uuid) to authenticated;

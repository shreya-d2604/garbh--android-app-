-- Companions, notifications, push tokens, audit log (PLAN.md §5.2). Owner: head (schema only).

create table public.companion_invites (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  code_hash  text not null unique,          -- sha256(code + server pepper); plaintext is never stored
  expires_at timestamptz not null default now() + interval '24 hours',
  max_uses   smallint not null default 1,
  used_at    timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index companion_invites_patient_idx on public.companion_invites (patient_id);

create table public.companion_links (
  id                     uuid primary key default gen_random_uuid(),
  patient_id             uuid not null references public.patients (id) on delete cascade,
  companion_user_id      uuid not null references public.profiles (id) on delete cascade,
  relation               text not null check (relation in ('husband','mother','father','mother_in_law','father_in_law','sibling','friend','other')),
  relation_note          text,
  status                 public.link_status not null default 'pending',
  can_view_appointments  boolean not null default false,
  can_view_journey       boolean not null default false,
  can_view_summaries     boolean not null default false,
  can_view_reports       boolean not null default false,
  can_view_prescriptions boolean not null default false,
  receive_notifications  boolean not null default false,
  requested_at           timestamptz not null default now(),
  decided_at             timestamptz
);
create unique index companion_links_unique_open on public.companion_links (patient_id, companion_user_id)
  where status in ('pending','approved');
create index companion_links_companion_idx on public.companion_links (companion_user_id);

create table public.code_redeem_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now(),
  success      boolean not null
);
create index code_redeem_attempts_user_idx on public.code_redeem_attempts (user_id, attempted_at);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         text not null,   -- appointment_booked|appointment_changed|appointment_reminder|summary_published|...
  title        text not null,
  body         text,
  data         jsonb not null default '{}',   -- deep-link target, e.g. {"route":"/patient/appointments/<id>"}
  read_at      timestamptz,
  push_sent_at timestamptz,
  push_error   text,
  created_at   timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform        text,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- Append-only. Written by private.audit_row() and public.log_sensitive_view(); no update/delete policy for anyone.
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  actor_role public.user_role,
  action     text not null check (action in ('insert','update','delete','view_sensitive','export')),
  table_name text not null,
  record_id  text,
  patient_id uuid,
  old        jsonb,
  new        jsonb,
  at         timestamptz not null default now()
);
create index audit_log_patient_idx on public.audit_log (patient_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index audit_log_table_idx on public.audit_log (table_name, at desc);

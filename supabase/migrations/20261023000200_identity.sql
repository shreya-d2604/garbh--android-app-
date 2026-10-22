-- Identity tables (PLAN.md §5.2 "Identity"). Owner: head.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role,                 -- null until onboarding (complete_signup)
  full_name   text,
  email       text,
  phone       text,
  avatar_path text,
  is_active   boolean not null default true,
  consent_at  timestamptz,                      -- Terms + Privacy + AI consent accepted in-app (record_consent)
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index profiles_role_idx on public.profiles (role);

create table public.staff_details (
  profile_id           uuid primary key references public.profiles (id) on delete cascade,
  designation          text,
  specialization       text,
  registration_no      text,
  signature_path       text,
  bio                  text,
  accepts_new_patients boolean not null default false
);

-- Single-row settings table.
create table public.hospital_settings (
  id                          smallint primary key default 1 check (id = 1),
  name                        text not null,
  address                     text,
  phone                       text,
  logo_path                   text,
  timezone                    text not null default 'Asia/Kolkata',
  default_slot_minutes        smallint not null default 15 check (default_slot_minutes between 5 and 120),
  reminder_lead_hours         smallint[] not null default '{24,2}',
  min_lead_hours              smallint not null default 2 check (min_lead_hours >= 0),
  max_advance_days            smallint not null default 60 check (max_advance_days > 0),
  patient_cancel_cutoff_hours smallint not null default 4 check (patient_cancel_cutoff_hours >= 0),
  unverified_max_upcoming     smallint not null default 1 check (unverified_max_upcoming >= 0),
  verified_max_upcoming       smallint not null default 3 check (verified_max_upcoming >= 0),
  updated_at                  timestamptz not null default now()
);
insert into public.hospital_settings (id, name) values (1, 'GARBH Hospital');

-- Account deletion / data export requests (PLAN.md §7.1 profile, §7.6 #7, §12 DPDP).
create table public.data_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('deletion','export')),
  status      text not null default 'open' check (status in ('open','in_progress','done','rejected')),
  note        text,
  created_at  timestamptz not null default now(),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz
);
create index data_requests_user_idx on public.data_requests (user_id);

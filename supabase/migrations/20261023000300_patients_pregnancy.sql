-- Patients, pregnancies, care team (PLAN.md §5.2). Owner: head.

create table public.patients (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique references public.profiles (id) on delete set null,
  mrn                 text unique,                -- null until verified at the desk
  full_name           text not null,
  dob                 date,
  phone               text,
  email               text,
  address             text,
  blood_group         text check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  rh_negative         boolean,
  allergies           text[] not null default '{}',
  chronic_conditions  text[] not null default '{}',
  emergency_contact   text,
  registration_source text not null check (registration_source in ('app','desk')),
  verified_at         timestamptz,
  verified_by         uuid references public.profiles (id),
  is_verified         boolean generated always as (verified_at is not null) stored,
  consent_ai_at       timestamptz,
  consent_data_at     timestamptz,
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index patients_email_idx on public.patients (lower(email));
create index patients_phone_idx on public.patients (phone);
create index patients_unverified_idx on public.patients (created_at) where verified_at is null;

create table public.pregnancies (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references public.patients (id) on delete cascade,
  lmp_date           date,
  lmp_source         text not null default 'patient_reported' check (lmp_source in ('patient_reported','clinician')),
  edd_lmp            date generated always as (lmp_date + 280) stored,
  edd_usg            date,
  edd_final          date generated always as (coalesce(edd_usg, lmp_date + 280)) stored,
  gravida            smallint check (gravida >= 0),
  para               smallint check (para >= 0),
  abortus            smallint check (abortus >= 0),
  living             smallint check (living >= 0),
  multiple_gestation smallint not null default 1 check (multiple_gestation between 1 and 6),
  risk_level         public.risk_level not null default 'low',
  risk_factors       text[] not null default '{}',
  status             public.pregnancy_status not null default 'active',
  outcome_date       date,
  outcome_notes      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index pregnancies_one_active_per_patient on public.pregnancies (patient_id) where status = 'active';
create index pregnancies_patient_idx on public.pregnancies (patient_id);

create table public.care_team (
  id           uuid primary key default gen_random_uuid(),
  pregnancy_id uuid not null references public.pregnancies (id) on delete cascade,
  doctor_id    uuid not null references public.profiles (id),
  care_role    public.care_role not null,
  added_by     uuid references public.profiles (id),
  added_at     timestamptz not null default now(),
  removed_at   timestamptz,
  removed_by   uuid references public.profiles (id),
  note         text
);
create unique index care_team_one_active_primary on public.care_team (pregnancy_id)
  where care_role = 'primary' and removed_at is null;
create unique index care_team_unique_active_member on public.care_team (pregnancy_id, doctor_id)
  where removed_at is null;
create index care_team_doctor_active_idx on public.care_team (doctor_id) where removed_at is null;

-- Consultations, private notes, prescriptions (PLAN.md §5.2). Owner: head (schema only).

create table public.consultations (
  id                     uuid primary key default gen_random_uuid(),
  appointment_id         uuid unique references public.appointments (id) on delete set null,
  pregnancy_id           uuid not null references public.pregnancies (id) on delete cascade,
  doctor_id              uuid not null references public.profiles (id),
  ga_weeks               smallint,
  ga_days                smallint check (ga_days between 0 and 6),
  weight_kg              numeric(5,2),
  bp_systolic            smallint,
  bp_diastolic           smallint,
  pulse                  smallint,
  temperature            numeric(4,1),
  spo2                   smallint check (spo2 between 0 and 100),
  fundal_height_cm       numeric(4,1),
  fetal_heart_rate       smallint,
  presentation           text,
  fetal_movements        text,
  edema                  text,
  urine_albumin          text,
  urine_sugar            text,
  complaints             text,
  findings               text,
  advice                 text,          -- shown to patient once published
  diet_advice            text,
  next_visit_after_weeks smallint,
  published_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index consultations_pregnancy_idx on public.consultations (pregnancy_id, created_at);

create table public.consultation_private_notes (
  consultation_id uuid primary key references public.consultations (id) on delete cascade,
  pregnancy_id    uuid not null references public.pregnancies (id) on delete cascade,  -- denormalised for RLS
  note            text not null,
  updated_at      timestamptz not null default now()
);

create table public.prescription_items (
  id              uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations (id) on delete cascade,
  pregnancy_id    uuid not null references public.pregnancies (id) on delete cascade,
  drug_name       text not null,
  strength        text,
  dosage_form     text,
  dose            text,
  frequency       text,            -- e.g. 1-0-1
  timing          text,            -- before/after food
  route           text,
  duration_days   smallint check (duration_days > 0),
  start_date      date,
  end_date        date generated always as (start_date + (duration_days - 1)) stored,
  instructions    text,
  stopped_at      timestamptz,
  -- "Active today" = is_active and current_date between start_date and end_date (dates can't be in a generated column).
  is_active       boolean generated always as (stopped_at is null) stored,
  created_at      timestamptz not null default now()
);
create index prescription_items_pregnancy_idx on public.prescription_items (pregnancy_id);
create index prescription_items_consultation_idx on public.prescription_items (consultation_id);

create table public.drug_catalog (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  generic                text,
  common_strengths       text[] not null default '{}',
  pregnancy_caution_note text,
  is_active              boolean not null default true
);

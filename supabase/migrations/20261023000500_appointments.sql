-- Availability + appointments (PLAN.md §5.2 "Appointments"). Owner: head (schema only).
-- Times in doctor_availability are wall-clock times in hospital_settings.timezone.

create table public.doctor_availability (
  id           uuid primary key default gen_random_uuid(),
  doctor_id    uuid not null references public.profiles (id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),   -- 0 = Sunday (extract(dow))
  start_time   time not null,
  end_time     time not null,
  slot_minutes smallint not null default 15 check (slot_minutes between 5 and 120),
  check (start_time < end_time)
);
create index doctor_availability_doctor_idx on public.doctor_availability (doctor_id, weekday);

create table public.doctor_time_off (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.profiles (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);
create index doctor_time_off_doctor_idx on public.doctor_time_off (doctor_id, starts_at);

create table public.appointments (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid not null references public.patients (id) on delete cascade,
  pregnancy_id         uuid not null references public.pregnancies (id) on delete cascade,
  doctor_id            uuid not null references public.profiles (id),
  visit_id             uuid references public.visits (id) on delete set null,
  starts_at            timestamptz not null,
  ends_at              timestamptz not null,
  status               public.appt_status not null default 'booked',
  reason               text,
  notes_for_patient    text,
  booked_by            uuid references public.profiles (id),
  booking_channel      public.booking_channel not null,
  rescheduled_from     uuid references public.appointments (id),
  cancelled_by         uuid references public.profiles (id),
  cancelled_reason     text,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at  timestamptz,
  checked_in_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (starts_at < ends_at)
);

-- No double-booking, enforced in the DB (PLAN.md §5.2). Violations raise SQLSTATE 23P01.
alter table public.appointments add constraint no_doctor_overlap
  exclude using gist (doctor_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status not in ('cancelled','no_show'));

create index appointments_doctor_time_idx on public.appointments (doctor_id, starts_at);
create index appointments_patient_time_idx on public.appointments (patient_id, starts_at);
create index appointments_pregnancy_idx on public.appointments (pregnancy_id);

alter table public.visits
  add constraint visits_appointment_fk foreign key (appointment_id)
  references public.appointments (id) on delete set null;

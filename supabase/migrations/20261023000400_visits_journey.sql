-- Visit plan + journey content (PLAN.md §5.2, §5.4). Owner: head.
-- Week windows are inclusive whole weeks: a window 11..13 means 11w0d .. 13w6d.

create table public.visit_templates (
  id                uuid primary key default gen_random_uuid(),
  schedule          text not null default 'standard' check (schedule in ('standard','high_risk')),
  seq               smallint not null check (seq > 0),
  target_week       smallint not null check (target_week between 4 and 42),
  window_start_week smallint not null check (window_start_week between 4 and 42),
  window_end_week   smallint not null check (window_end_week between 4 and 42),
  title             text not null,
  purpose           text,
  recommended_tests text[] not null default '{}',
  is_active         boolean not null default true,
  check (window_start_week <= target_week and target_week <= window_end_week),
  unique (schedule, seq)
);

create table public.visits (
  id                uuid primary key default gen_random_uuid(),
  pregnancy_id      uuid not null references public.pregnancies (id) on delete cascade,
  seq               smallint not null,
  target_week       smallint not null,
  due_from          date,
  due_to            date,
  title             text not null,
  purpose           text,
  recommended_tests text[] not null default '{}',
  status            public.visit_status not null default 'planned',
  appointment_id    uuid,                       -- FK added in the appointments migration
  added_by          uuid references public.profiles (id),
  reason_added      text,
  is_extra          boolean not null default false,
  contacted_at      timestamptz,                -- reception "Called patient" (PLAN.md §7.5 #4)
  contact_note      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (due_from is null or due_to is null or due_from <= due_to)
);
create index visits_pregnancy_idx on public.visits (pregnancy_id, seq);
create index visits_due_idx on public.visits (due_from) where status = 'planned';

create table public.week_content (
  week             smallint primary key check (week between 4 and 42),
  baby_size_label  text,
  baby_length_cm   numeric(5,1),
  baby_weight_g    numeric(7,1),
  baby_development text,
  mother_changes   text,
  tips             text,
  image_path       text
);

create table public.milestones (
  key         text primary key,
  title       text not null,
  week_from   smallint not null check (week_from between 0 and 42),
  week_to     smallint not null check (week_to between 0 and 42),
  description text,
  category    text not null check (category in ('scan','test','vaccine','education','trimester')),
  check (week_from <= week_to)
);

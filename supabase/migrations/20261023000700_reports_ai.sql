-- Reports, lab catalog/results, AI summaries, curated guidance (PLAN.md §5.2). Owner: head (schema only).

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  pregnancy_id      uuid not null references public.pregnancies (id) on delete cascade,
  consultation_id   uuid references public.consultations (id) on delete set null,
  type              public.report_type not null,
  title             text,
  report_date       date,
  lab_name          text,
  uploaded_by       uuid references public.profiles (id),
  extraction_status public.extraction_status not null default 'pending',
  extraction_error  text,
  doctor_comment    text,
  verified_by       uuid references public.profiles (id),
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index reports_pregnancy_idx on public.reports (pregnancy_id, report_date);

-- Storage path convention: {patient_id}/{pregnancy_id}/{report_id}/{file_id}.{ext} in bucket `reports`.
create table public.report_files (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports (id) on delete cascade,
  storage_path text not null unique,
  mime_type    text not null,
  page_no      smallint not null default 1,
  size_bytes   integer,
  created_at   timestamptz not null default now()
);
create index report_files_report_idx on public.report_files (report_id);

create table public.lab_tests (
  code          text primary key,
  name          text not null,
  unit          text,
  ref_low       numeric,
  ref_high      numeric,
  trimester_ref jsonb,          -- e.g. {"1":{"low":0.1,"high":2.5},"2":{...},"3":{...}}
  is_active     boolean not null default true
);

create table public.lab_results (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid references public.reports (id) on delete cascade,   -- null for values entered outside a report
  pregnancy_id uuid not null references public.pregnancies (id) on delete cascade,
  test_code    text references public.lab_tests (code),
  raw_name     text,          -- name as printed on the report (AI extraction)
  value_num    numeric,
  value_text   text,
  unit         text,
  ref_low      numeric,
  ref_high     numeric,
  flag         text check (flag in ('low','normal','high','abnormal')),
  source       public.result_source not null,
  confidence   numeric(3,2) check (confidence between 0 and 1),
  verified     boolean not null default false,
  verified_by  uuid references public.profiles (id),
  observed_on  date,
  created_at   timestamptz not null default now()
);
create index lab_results_pregnancy_idx on public.lab_results (pregnancy_id, test_code, observed_on);
create index lab_results_report_idx on public.lab_results (report_id);

create table public.ai_summaries (
  id             uuid primary key default gen_random_uuid(),
  pregnancy_id   uuid not null references public.pregnancies (id) on delete cascade,
  source_type    public.summary_source not null,
  source_id      uuid,
  status         public.summary_status not null default 'generating',
  model          text,
  prompt_version text,
  input_hash     text,
  draft          jsonb,
  final          jsonb,
  doctor_note    text,
  generated_at   timestamptz,
  reviewed_by    uuid references public.profiles (id),
  reviewed_at    timestamptz,
  published_at   timestamptz,
  token_usage    jsonb,
  error          text,
  created_at     timestamptz not null default now(),
  -- PLAN.md §9.5: nothing is published without a reviewer.
  constraint ai_summaries_published_requires_review
    check (status <> 'published' or (reviewed_by is not null and published_at is not null and final is not null))
);
create index ai_summaries_pregnancy_idx on public.ai_summaries (pregnancy_id, status);
create index ai_summaries_inbox_idx on public.ai_summaries (status) where status = 'draft';

create table public.curated_guidance (
  id        uuid primary key default gen_random_uuid(),
  kind      text not null check (kind in ('food_avoid','food_recommend','med_avoid','warning_sign')),
  trimester smallint check (trimester between 1 and 3),     -- null = all trimesters
  condition text,                                          -- null = everyone; e.g. 'gdm','anemia','hypertension'
  text      text not null,
  reason    text,
  is_active boolean not null default true
);

-- GARBH foundation: extensions, schemas, enums (PLAN.md §5.1).
-- Owner: head. pg_cron / pg_net are created by the backend agent's migrations.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- Internal helpers and trigger functions live in `private` so they are never
-- exposed through PostgREST and never appear in generated types.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.user_role         as enum ('admin','doctor','receptionist','patient','companion');
create type public.pregnancy_status  as enum ('active','delivered','miscarriage','terminated','transferred','closed');
create type public.risk_level        as enum ('low','moderate','high');
create type public.visit_status      as enum ('planned','scheduled','completed','missed','skipped','cancelled');
create type public.appt_status       as enum ('booked','confirmed','checked_in','in_consultation','completed','cancelled','no_show');
create type public.report_type       as enum ('blood','urine','ultrasound','nt_scan','anomaly_scan','growth_scan','doppler','gtt','thyroid','ecg','other');
create type public.extraction_status as enum ('pending','processing','done','failed','skipped');
create type public.summary_status    as enum ('generating','draft','approved','published','rejected','failed');
create type public.summary_source    as enum ('report','consultation','cumulative');
create type public.link_status       as enum ('pending','approved','rejected','revoked','left');
create type public.care_role         as enum ('primary','backup');
create type public.booking_channel   as enum ('app','reception','doctor','admin');
create type public.result_source     as enum ('ai_extracted','manual');

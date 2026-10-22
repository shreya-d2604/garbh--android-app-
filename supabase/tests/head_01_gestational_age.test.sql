-- PLAN.md §10: SQL GA math. The SAME vectors are asserted in src/domain/__tests__/pregnancy-math.test.ts.
begin;
\ir helpers/setup.psql
select plan(13);

select results_eq(
  $$ select g.weeks, g.days, g.trimester, g.days_to_edd
     from (values
       ('2027-02-08'::date, '2026-10-22'::date, 1), ('2026-12-10', '2026-10-22', 2), ('2026-07-01', '2025-09-24', 3),
       ('2026-07-01', '2025-12-30', 4), ('2026-07-01', '2025-12-31', 5), ('2026-07-01', '2026-04-07', 6),
       ('2026-07-01', '2026-04-08', 7), ('2026-07-01', '2026-07-01', 8), ('2026-07-01', '2026-07-15', 9),
       ('2026-07-01', '2025-09-21', 10), ('2024-02-29', '2023-06-01', 11), ('2025-01-01', '2024-12-31', 12)
     ) v(edd, on_, n)
     cross join lateral public.ga_from_edd(v.edd, v.on_) g order by v.n $$,
  $$ values (24,3,2,109), (33,0,3,49), (0,0,1,280), (13,6,1,183), (14,0,2,182), (27,6,2,85),
            (28,0,3,84), (40,0,3,0), (42,0,3,-14), (-1,4,1,283), (1,0,1,273), (39,6,3,1) $$,
  'ga_from_edd matches the shared vectors'
);

select is_empty($$ select * from public.ga_from_edd(null, current_date) $$, 'no EDD -> no row');

-- gestational_age() reads the pregnancy (edd_final = coalesce(edd_usg, lmp + 280)).
create temp table t as select tests.create_pregnancy(null, null, 20) as preg;
select results_eq(
  $$ select weeks, days from public.gestational_age((select preg from t)) $$,
  $$ values (20, 0) $$, 'gestational_age from LMP');
update public.pregnancies set edd_usg = edd_lmp - 7 where id = (select preg from t);
select results_eq(
  $$ select weeks, days from public.gestational_age((select preg from t)) $$,
  $$ values (21, 0) $$, 'dating-scan EDD overrides LMP');

-- Visit plan: generated on insert, and only 'planned' visits move when the EDD changes.
select is((select count(*)::int from public.visits where pregnancy_id = (select preg from t)),
          (select count(*)::int from public.visit_templates where schedule = 'standard' and is_active),
          'one visit per active standard template');
select is((select due_from from public.visits where pregnancy_id = (select preg from t) and seq = 1),
          (select (edd_final - 280) + 6 * 7 from public.pregnancies where id = (select preg from t)),
          'visit 1 window starts at 6w0d (after EDD shift)');
select is((select due_to from public.visits where pregnancy_id = (select preg from t) and seq = 2),
          (select (edd_final - 280) + 13 * 7 + 6 from public.pregnancies where id = (select preg from t)),
          'visit 2 window ends at 13w6d');

update public.visits set status = 'completed' where pregnancy_id = (select preg from t) and seq = 1;
create temp table before_shift as select seq, due_from from public.visits where pregnancy_id = (select preg from t);
update public.pregnancies set edd_usg = edd_usg + 10 where id = (select preg from t);
select is((select v.due_from - b.due_from from public.visits v join before_shift b using (seq)
           where v.pregnancy_id = (select preg from t) and v.seq = 1), 0, 'completed visit does not move');
select is((select v.due_from - b.due_from from public.visits v join before_shift b using (seq)
           where v.pregnancy_id = (select preg from t) and v.seq = 5), 10, 'planned visit shifts with EDD');

select lives_ok($$ select public.generate_visit_plan((select preg from t)) $$, 'generate_visit_plan is idempotent');
select is((select count(*)::int from public.visits where pregnancy_id = (select preg from t)),
          (select count(*)::int from public.visit_templates where schedule = 'standard' and is_active),
          '...and does not duplicate visits');

-- A pregnancy without LMP gets no visits until an LMP is set.
create temp table t2 as select tests.create_pregnancy(null, null, 10) as preg;
delete from public.visits where pregnancy_id = (select preg from t2);
update public.pregnancies set lmp_date = null where id = (select preg from t2);
select is((select count(*)::int from public.visits where pregnancy_id = (select preg from t2)), 0, 'no LMP -> no visits');
update public.pregnancies set lmp_date = public.hospital_today() - 70 where id = (select preg from t2);
select ok((select count(*) from public.visits where pregnancy_id = (select preg from t2)) > 0, 'setting LMP generates the plan');

select * from finish();
rollback;

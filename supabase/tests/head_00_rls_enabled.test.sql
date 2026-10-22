-- CI gate (PLAN.md §12): every public table has RLS enabled; anon can execute no public function.
begin;
\ir helpers/setup.psql
select plan(2);

select is(
  array(select tablename::text from pg_tables where schemaname = 'public' and not rowsecurity order by 1),
  array[]::text[],
  'every table in public has row level security enabled'
);

select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    order by 1),
  array[]::text[],
  'anon cannot execute any public function'
);

select * from finish();
rollback;

-- AI review workflow: review_ai_summary, the publish guard / verification trigger, the
-- per-doctor quota and the document validator. AI output is a DRAFT until a care-team doctor
-- approves it (PLAN.md §9.5).
begin;
\ir helpers/setup.psql
\ir helpers/backend.psql
select no_plan();
select tests.build_world();
update public.companion_links set receive_notifications = true where companion_user_id = (select c_summ from w);

create temp table docs as select $j$
{"lab_values":[{"raw_name":"Haemoglobin","test_code":"HB","value":10.2,"value_text":null,"unit":"g/dL","ref_range_on_report":"11-15","confidence":0.93}],
 "summary":{"headline":"Your haemoglobin is slightly low.","plain_language_summary":"A short explanation.",
   "key_findings":[{"finding":"Hb 10.2","status":"attention","explanation":"A little low."}],
   "foods_to_eat":[{"item":"Spinach","why":"Iron"}],"foods_to_avoid":[{"item":"Tea with meals","why":"Blocks iron"}],
   "medicines_to_avoid":[],"lifestyle_tips":["Rest"],"questions_for_doctor":["Is it iron?"],
   "doctor_attention_flags":["Hb 10.2 at 20w: consider IV iron?"],"confidence_note":"Check values."}}
$j$::jsonb as ok;
grant select on docs to authenticated;

create function tests.summary(p_status text, p_source uuid default null, p_draft jsonb default null) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.ai_summaries (id, pregnancy_id, source_type, source_id, status, draft)
  values (v, (select p1 from w), case when p_source is null then 'cumulative'::public.summary_source else 'report' end, p_source, p_status::public.summary_status, p_draft);
  return v;
end $$;
grant execute on function tests.summary(text, uuid, jsonb) to authenticated;

----------------------------------------------------------------------------
-- Signature is the contract's, byte for byte
----------------------------------------------------------------------------
select is(pg_get_function_arguments('public.review_ai_summary(uuid,text,jsonb,text)'::regprocedure),
          'p_summary uuid, p_action text, p_final jsonb DEFAULT NULL::jsonb, p_note text DEFAULT NULL::text', 'review_ai_summary arguments unchanged');
select is(pg_get_function_result('public.review_ai_summary(uuid,text,jsonb,text)'::regprocedure), 'void', 'review_ai_summary returns void');
select is(has_function_privilege('anon', 'public.review_ai_summary(uuid,text,jsonb,text)', 'execute'), false, 'anon cannot execute review_ai_summary');
select is(has_function_privilege('anon', 'public.consume_ai_quota(text)', 'execute'), false, 'anon cannot execute consume_ai_quota');

----------------------------------------------------------------------------
-- Who may review
----------------------------------------------------------------------------
create temp table s as select tests.summary('draft', null, (select ok from docs)) as id;
grant select on s to authenticated;
select is(tests.review((select pat1 from w), (select id from s), 'approve_publish'), 'NOT_ALLOWED', 'patient cannot approve');
select is(tests.review((select c_full from w), (select id from s), 'approve_publish'), 'NOT_ALLOWED', 'companion cannot approve');
select is(tests.review((select desk from w), (select id from s), 'approve_publish'), 'NOT_ALLOWED', 'receptionist cannot approve');
select is(tests.review((select nobody from w), (select id from s), 'approve_publish'), 'NOT_ALLOWED', 'a user without a role cannot approve');
select is(tests.review((select doc_b from w), (select id from s), 'approve_publish'), 'NOT_ALLOWED', 'a doctor off the care team cannot approve');
select is(tests.review((select doc_x from w), (select id from s), 'approve_publish'), 'NOT_ALLOWED', 'a removed backup cannot approve');
select is(tests.review((select doc_b from w), (select id from s), 'reject'), 'NOT_ALLOWED', 'a doctor off the care team cannot reject');
select is(tests.review((select doc_b from w), (select id from s), 'save_draft', (select ok from docs)), 'NOT_ALLOWED', 'a doctor off the care team cannot save edits');
select is(tests.review((select admin from w), (select id from s), 'approve_publish'), 'NOT_ALLOWED', 'admin cannot publish AI output (doctor approval is mandatory)');
select is(tests.review((select admin from w), (select id from s), 'save_draft', (select ok from docs)), 'NOT_ALLOWED', 'admin cannot edit drafts');
select is(tests.review(null, (select id from s), 'approve_publish'), 'NOT_AUTHENTICATED', 'no JWT, no review');
select is((select status::text from public.ai_summaries where id = (select id from s)), 'draft', 'all refused attempts left the summary a draft');
select is(tests.review((select doc_a from w), gen_random_uuid(), 'approve_publish'), 'NOT_FOUND', 'unknown summary');
select is(tests.review((select doc_a from w), (select id from s), 'publish_everything'), 'INVALID_INPUT', 'unknown action');
select is(tests.review((select doc_a from w), (select id from s), null), 'INVALID_INPUT', 'null action');

----------------------------------------------------------------------------
-- Validation against PLAN §9.3
----------------------------------------------------------------------------
create temp table bad (name text, doc jsonb);
insert into bad select name, doc from (values
  ('no summary', (select ok - 'summary' from docs)),
  ('headline missing', (select ok #- '{summary,headline}' from docs)),
  ('headline not a string', (select jsonb_set(ok, '{summary,headline}', '42') from docs)),
  ('finding status outside the enum', (select jsonb_set(ok, '{summary,key_findings,0,status}', '"scary"') from docs)),
  ('finding explanation missing', (select ok #- '{summary,key_findings,0,explanation}' from docs)),
  ('foods_to_eat not an array', (select jsonb_set(ok, '{summary,foods_to_eat}', '"x"') from docs)),
  ('food item without why', (select ok #- '{summary,foods_to_eat,0,why}' from docs)),
  ('lifestyle_tips with a number', (select jsonb_set(ok, '{summary,lifestyle_tips}', '[1]') from docs)),
  ('questions_for_doctor missing', (select ok #- '{summary,questions_for_doctor}' from docs)),
  ('flags not strings', (select jsonb_set(ok, '{summary,doctor_attention_flags}', '[1]') from docs)),
  ('confidence_note not a string', (select jsonb_set(ok, '{summary,confidence_note}', '5') from docs)),
  ('lab_values not an array', (select jsonb_set(ok, '{lab_values}', '{}') from docs)),
  ('lab value without unit key', (select ok #- '{lab_values,0,unit}' from docs)),
  ('lab confidence above 1', (select jsonb_set(ok, '{lab_values,0,confidence}', '1.5') from docs)),
  ('lab confidence negative', (select jsonb_set(ok, '{lab_values,0,confidence}', '-0.1') from docs)),
  ('lab value as a string', (select jsonb_set(ok, '{lab_values,0,value}', '"10"') from docs)),
  ('lab raw_name missing', (select ok #- '{lab_values,0,raw_name}' from docs)),
  ('a bare string', '"hello"'::jsonb),
  ('an array', '[]'::jsonb)
) v(name, doc);
select is(private.ai_document_valid(doc), false, 'validator rejects: ' || name) from bad order by name;
select is(tests.review((select doc_a from w), (select id from s), 'approve_publish', doc), 'INVALID_INPUT', 'approve rejects: ' || name) from bad order by name;
select is(tests.review((select doc_a from w), (select id from s), 'save_draft', doc), 'INVALID_INPUT', 'save_draft rejects: ' || name) from bad order by name;
select is(private.ai_document_valid((select ok from docs)), true, 'validator accepts the full document');
select is(private.ai_document_valid((select ok - 'lab_values' from docs)), true, 'lab_values are optional');
select is(private.ai_document_valid((select ok #- '{summary,doctor_attention_flags}' #- '{summary,confidence_note}' from docs)), true, 'flags and confidence note are optional');
select is(private.ai_document_valid((select jsonb_set(ok, '{lab_values,0,test_code}', 'null') from docs)), true, 'test_code may be null');
select is(private.ai_document_valid((select ok || '{"extra":1}' from docs)), true, 'unknown keys are ignored like zod does');
select is(tests.review((select doc_a from w), (select id from s), 'save_draft', null), 'INVALID_INPUT', 'save_draft needs a document');
select is(tests.review((select doc_a from w), (select id from s), 'approve_publish', '{"nope":1}'), 'INVALID_INPUT', 'approve rejects nonsense');
select is((select status::text from public.ai_summaries where id = (select id from s)), 'draft', 'invalid input never changes the status');

----------------------------------------------------------------------------
-- strip_doctor_flags
----------------------------------------------------------------------------
select is(private.strip_doctor_flags('{"doctor_attention_flags":["a"],"summary":{"headline":"h","doctor_attention_flags":["b"]}}'), '{"summary":{"headline":"h"}}'::jsonb, 'flags removed at both levels');
select is(private.strip_doctor_flags(null), null::jsonb, 'null stays null');

----------------------------------------------------------------------------
-- save_draft keeps flags and stays a draft
----------------------------------------------------------------------------
select is(tests.review((select doc_a from w), (select id from s), 'save_draft', (select jsonb_set(ok, '{summary,headline}', '"Edited by the doctor"') from docs)), 'OK', 'care-team doctor saves edits');
select is((select status::text from public.ai_summaries where id = (select id from s)), 'draft', 'save_draft keeps the draft status');
select is((select final #>> '{summary,headline}' from public.ai_summaries where id = (select id from s)), 'Edited by the doctor', 'edits are stored in final');
select is((select draft #>> '{summary,headline}' from public.ai_summaries where id = (select id from s)), 'Your haemoglobin is slightly low.', 'the AI draft itself is never overwritten (edit tracking)');
select ok((select final #> '{summary,doctor_attention_flags}' is not null from public.ai_summaries where id = (select id from s)), 'the doctor still sees the flags while editing');
select is((select reviewed_by from public.ai_summaries where id = (select id from s)), null::uuid, 'saving a draft is not a review');
select is(tests.visible((select pat1 from w), 'select 1 from public.published_summaries where id = ''' || (select id from s) || ''''), 0::bigint, 'the patient cannot see a draft, edited or not');
select is(tests.review((select doc_c from w), (select id from s), 'save_draft', (select ok from docs)), 'OK', 'a backup doctor can edit too');

----------------------------------------------------------------------------
-- approve_publish
----------------------------------------------------------------------------
-- a report with two AI values, plus another report whose values must stay untouched
create temp table rx as select gen_random_uuid() as id;
insert into public.reports (id, pregnancy_id, type, uploaded_by) values ((select id from rx), (select p1 from w), 'blood', (select doc_a from w));
insert into public.lab_results (report_id, pregnancy_id, test_code, value_num, source, verified) values
  ((select id from rx), (select p1 from w), 'HB', 10.2, 'ai_extracted', false),
  ((select id from rx), (select p1 from w), 'PLT', 250, 'ai_extracted', false);
create temp table s1 as select tests.summary('draft', (select id from rx), (select ok from docs)) as id;
delete from public.notifications;

select is(tests.review((select doc_a from w), (select id from s1), 'approve_publish',
                       (select jsonb_set(ok, '{summary,headline}', '"Approved headline"') from docs), 'looks right'), 'OK', 'care-team doctor approves and publishes');
select is((select status::text from public.ai_summaries where id = (select id from s1)), 'published', 'status published');
select is((select reviewed_by from public.ai_summaries where id = (select id from s1)), (select doc_a from w), 'reviewed_by is the approving doctor');
select ok((select reviewed_at is not null and published_at is not null from public.ai_summaries where id = (select id from s1)), 'reviewed_at and published_at are stamped');
select is((select final #>> '{summary,headline}' from public.ai_summaries where id = (select id from s1)), 'Approved headline', 'final holds the doctor''s edits');
select is((select final::text like '%doctor_attention_flags%' from public.ai_summaries where id = (select id from s1)), false, 'doctor_attention_flags are stripped from final');
select ok((select draft::text like '%doctor_attention_flags%' and draft #>> '{summary,headline}' = 'Your haemoglobin is slightly low.' from public.ai_summaries where id = (select id from s1)), 'the original draft is preserved untouched');
select is((select doctor_note from public.ai_summaries where id = (select id from s1)), 'looks right', 'doctor note stored');
select is((select count(*)::int from public.lab_results where report_id = (select id from rx) and verified and verified_by = (select doc_a from w)), 2, 'the report''s lab values are verified by the approving doctor');
select ok((select verified_by = (select doc_a from w) and verified_at is not null from public.reports where id = (select id from rx)), 'the report is marked verified');
select is((select count(*)::int from public.lab_results where report_id = (select r1 from w) and not verified), 1, 'values of other reports are untouched');
-- notifications
select is((select count(*)::int from public.notifications where user_id = (select pat1 from w) and type = 'summary_published'), 1, 'patient notified on publish');
select is((select count(*)::int from public.notifications where user_id = (select c_full from w) and type = 'summary_published'), 1, 'companion with summaries notified on publish');
select is((select count(*)::int from public.notifications where type = 'summary_published' and user_id in ((select c_none from w), (select c_appt from w), (select c_rev from w), (select c_pend from w), (select pat2 from w))), 0, 'others are not notified');
-- visibility
select is(tests.visible((select pat1 from w), 'select 1 from public.published_summaries where id = ''' || (select id from s1) || ''''), 1::bigint, 'patient sees the published summary');
select is(tests.visible((select c_full from w), 'select 1 from public.published_summaries where id = ''' || (select id from s1) || ''''), 1::bigint, 'companion with summaries sees it');
select is(tests.visible((select c_appt from w), 'select 1 from public.published_summaries where id = ''' || (select id from s1) || ''''), 0::bigint, 'companion without summaries does not');
select is(tests.visible((select pat1 from w), 'select 1 from public.published_summaries where final::text like ''%doctor_attention_flags%'''), 0::bigint, 'flags never reach the patient');
select is(tests.visible((select pat1 from w), 'select 1 from public.ai_summaries'), 0::bigint, 'the patient still cannot read the AI table');
-- finality
select is(tests.review((select doc_a from w), (select id from s1), 'approve_publish'), 'INVALID_STATUS_CHANGE', 'cannot publish twice');
select is(tests.review((select doc_a from w), (select id from s1), 'save_draft', (select ok from docs)), 'INVALID_STATUS_CHANGE', 'cannot edit after publishing');
select is(tests.review((select doc_a from w), (select id from s1), 'reject'), 'INVALID_STATUS_CHANGE', 'cannot reject after publishing');
select is(tests.review((select admin from w), (select id from s1), 'reject'), 'INVALID_STATUS_CHANGE', 'admin cannot reject a published summary either');

-- approve with no p_final: saved edits win, otherwise the draft
create temp table s2 as select tests.summary('draft', null, (select ok from docs)) as id;
select is(tests.review((select doc_a from w), (select id from s2), 'save_draft', (select jsonb_set(ok, '{summary,headline}', '"Saved edit"') from docs)), 'OK', 'save an edit');
select is(tests.review((select doc_a from w), (select id from s2), 'approve_publish'), 'OK', 'approve without a document');
select is((select final #>> '{summary,headline}' from public.ai_summaries where id = (select id from s2)), 'Saved edit', 'approve without p_final publishes the saved edit');
create temp table s3 as select tests.summary('draft', null, (select ok from docs)) as id;
select is(tests.review((select doc_b from w), (select id from s3), 'approve_publish'), 'NOT_ALLOWED', 'still the care team only');
select is(tests.review((select doc_c from w), (select id from s3), 'approve_publish'), 'OK', 'a backup doctor may publish');
select is((select final #>> '{summary,headline}' from public.ai_summaries where id = (select id from s3)), 'Your haemoglobin is slightly low.', 'with neither p_final nor edits, the draft is published');
select is((select final::text like '%doctor_attention_flags%' from public.ai_summaries where id = (select id from s3)), false, '... without its doctor flags');
create temp table s4 as select tests.summary('draft') as id;
select is(tests.review((select doc_a from w), (select id from s4), 'approve_publish'), 'INVALID_INPUT', 'a summary with no content cannot be published');

-- reject
create temp table s5 as select tests.summary('draft', null, (select ok from docs)) as id;
delete from public.notifications;
select is(tests.review((select doc_a from w), (select id from s5), 'reject', null, 'not accurate'), 'OK', 'doctor rejects');
select is((select status::text from public.ai_summaries where id = (select id from s5)), 'rejected', 'status rejected');
select is((select doctor_note from public.ai_summaries where id = (select id from s5)), 'not accurate', 'reason stored');
select is((select count(*)::int from public.notifications where type = 'summary_published'), 0, 'rejecting notifies nobody');
select is(tests.review((select doc_a from w), (select id from s5), 'approve_publish', (select ok from docs)), 'INVALID_STATUS_CHANGE', 'a rejected summary cannot be published');
select is(tests.visible((select pat1 from w), 'select 1 from public.published_summaries where id = ''' || (select id from s5) || ''''), 0::bigint, 'a rejected summary is invisible to the patient');
create temp table s6 as select tests.summary('draft', null, (select ok from docs)) as id;
select is(tests.review((select admin from w), (select id from s6), 'reject', null, 'stale'), 'OK', 'admin may reject (housekeeping)');
-- not reviewable states
create temp table s7 as select tests.summary('generating') as id, tests.summary('failed') as failed;
select is(tests.review((select doc_a from w), (select id from s7), 'approve_publish', (select ok from docs)), 'INVALID_STATUS_CHANGE', 'a generating summary cannot be reviewed');
select is(tests.review((select doc_a from w), (select failed from s7), 'approve_publish', (select ok from docs)), 'INVALID_STATUS_CHANGE', 'a failed summary cannot be reviewed');

----------------------------------------------------------------------------
-- No path publishes without a doctor reviewer (publish guard)
----------------------------------------------------------------------------
create temp table s8 as select tests.summary('draft', null, (select ok from docs)) as id;
select is(tests.try_as((select admin from w), format($$update public.ai_summaries set status = 'published', final = draft, reviewed_by = %L, reviewed_at = now(), published_at = now() where id = %L$$, (select admin from w), (select id from s8))),
          'NOT_ALLOWED', 'even admin cannot publish with a non-doctor reviewer');
select is(tests.try_as((select admin from w), format($$update public.ai_summaries set status = 'published', final = draft, published_at = now() where id = %L$$, (select id from s8))),
          'NOT_ALLOWED', 'nor without a reviewer');
select is(tests.write_as((select doc_a from w), format($$update public.ai_summaries set status = 'published' where id = %L$$, (select id from s8))), 0, 'a doctor has no direct write on ai_summaries');
select is(tests.write_as((select pat1 from w), format($$update public.ai_summaries set status = 'published' where id = %L$$, (select id from s8))), 0, 'a patient neither');
select is((select status::text from public.ai_summaries where id = (select id from s8)), 'draft', 'the summary is still a draft');
-- a writer who does name a doctor still cannot leak the flags
create temp table s9 as select gen_random_uuid() as id;
insert into public.ai_summaries (id, pregnancy_id, source_type, status, final, reviewed_by, published_at)
values ((select id from s9), (select p1 from w), 'cumulative', 'published', (select ok from docs), (select doc_a from w), now());
select is((select final::text like '%doctor_attention_flags%' from public.ai_summaries where id = (select id from s9)), false, 'flags are stripped on any publish path');
select is(tests.visible((select pat1 from w), 'select 1 from public.published_summaries where final::text like ''%doctor_attention_flags%'''), 0::bigint, 'and never visible to the patient');

----------------------------------------------------------------------------
-- consume_ai_quota: 100 calls per doctor per hour
----------------------------------------------------------------------------
select is(tests.try_as((select doc_a from w), $$select public.consume_ai_quota('process-report')$$), 'OK', 'a doctor can consume quota');
select is(tests.try_as((select pat1 from w), $$select public.consume_ai_quota()$$), 'NOT_ALLOWED', 'a patient cannot');
select is(tests.try_as((select admin from w), $$select public.consume_ai_quota()$$), 'NOT_ALLOWED', 'admin is not a doctor');
select is(tests.try_as(null, $$select public.consume_ai_quota()$$), 'NOT_AUTHENTICATED', 'no JWT, no quota');
select is(tests.try_as((select doc_a from w), $q$do $d$ begin for i in 1..99 loop perform public.consume_ai_quota('x'); end loop; end $d$$q$), 'OK', 'calls 2..100 pass');
select is((select count(*)::int from private.ai_usage where doctor_id = (select doc_a from w)), 100, 'exactly 100 calls recorded');
select is(tests.try_as((select doc_a from w), $$select public.consume_ai_quota()$$), 'RATE_LIMITED', 'the 101st call within the hour is refused');
select is((select count(*)::int from private.ai_usage where doctor_id = (select doc_a from w)), 100, 'a refused call is not recorded');
select is(tests.try_as((select doc_c from w), $$select public.consume_ai_quota()$$), 'OK', 'other doctors have their own quota');
-- rolling window
insert into private.ai_usage (doctor_id, fn, at) select (select doc_b from w), 'x', now() - interval '2 hours' from generate_series(1, 100);
select is(tests.try_as((select doc_b from w), $$select public.consume_ai_quota()$$), 'OK', 'calls older than an hour do not count');
insert into private.ai_usage (doctor_id, fn, at) values ((select doc_b from w), 'x', now() - interval '3 days');
select is(tests.try_as((select doc_b from w), $$select public.consume_ai_quota()$$), 'OK', 'ok again');
select is((select count(*)::int from private.ai_usage where at < now() - interval '1 day'), 0, 'rows older than a day are purged');
select is(has_schema_privilege('authenticated', 'private', 'usage'), false, 'the usage table is not reachable by clients');

select * from finish();
rollback;

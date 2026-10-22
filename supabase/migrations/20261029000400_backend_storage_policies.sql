-- Backend: object policies for the private `reports` bucket (PLAN.md §6 "Storage").
-- Path convention: {patient_id}/{pregnancy_id}/{report_id}/{file_id}.{ext}
--   * care-team doctors and admins read AND write (upload, overwrite, delete)
--   * patients and companions with `reports` read an object only once it is attached to a
--     report they can see (report_files row + the reports RLS), so a half-uploaded or deleted
--     report never leaks
--   * receptionists, other doctors and other patients get nothing (default deny)
-- Files are fetched through short-lived signed URLs (createSignedUrl(path, 60)).

-- Returns the pregnancy id encoded in a reports-bucket path, or null when the path is malformed
-- or its patient segment does not belong to that pregnancy (stops filing a file under someone
-- else's folder). Public so storage policies (evaluated as the caller) can use it.
create function public.report_object_pregnancy(p_name text) returns uuid
language sql stable security definer set search_path = '' as $$
  select pr.id
  from public.pregnancies pr
  where p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    and pr.id = split_part(p_name, '/', 2)::uuid
    and pr.patient_id = split_part(p_name, '/', 1)::uuid
$$;
revoke execute on function public.report_object_pregnancy(text) from public, anon;
grant execute on function public.report_object_pregnancy(text) to authenticated;

create policy reports_bucket_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'reports' and public.auth_role() = 'admin')
  with check (bucket_id = 'reports' and public.auth_role() = 'admin');

create policy reports_bucket_doctor_select on storage.objects for select to authenticated
  using (bucket_id = 'reports' and public.on_care_team(public.report_object_pregnancy(name)));
create policy reports_bucket_doctor_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and public.on_care_team(public.report_object_pregnancy(name)));
create policy reports_bucket_doctor_update on storage.objects for update to authenticated
  using (bucket_id = 'reports' and public.on_care_team(public.report_object_pregnancy(name)))
  with check (bucket_id = 'reports' and public.on_care_team(public.report_object_pregnancy(name)));
create policy reports_bucket_doctor_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reports' and public.on_care_team(public.report_object_pregnancy(name)));

-- Patient / companion read. The subselect runs under the caller's RLS: report_files_select
-- -> reports_viewer_select (own pregnancy, or companion with `reports`, report not deleted).
create policy reports_bucket_viewer_select on storage.objects for select to authenticated
  using (bucket_id = 'reports' and exists (select 1 from public.report_files rf where rf.storage_path = name));

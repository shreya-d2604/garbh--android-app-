-- Backend: extensions used by notifications (pg_net -> send-push) and scheduled jobs (pg_cron).
-- Owner: backend. Both live outside the public schema, so nothing here is exposed via PostgREST.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

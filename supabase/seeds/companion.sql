-- Companion demo data. Runs after seed.sql. Owner: companion agent.
-- A known invite for Sunita (verified) so the code-entry flow can be tried without a second
-- device: sign in as any NEW email -> "I'm a family member" -> enter SUN-234. Valid for 24 hours
-- after the reset, like a real invite (hash = sha256(code || pepper), see the companion migration).
insert into public.companion_invites (patient_id, code_hash)
values ('10000000-0000-4000-8000-000000000002', private.companion_code_hash('SUN234'));

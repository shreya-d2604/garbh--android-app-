// Edge Function `export-patient-data` (PLAN.md §7.6 #7). Invoked by the app with the admin's JWT:
//   supabase.functions.invoke('export-patient-data', { body: { patient_id } })   // or { user_id }
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createHandler } from './handler.ts';
import { createPort } from './port.ts';

const port = createPort(createClient, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
});

Deno.serve(createHandler(port));

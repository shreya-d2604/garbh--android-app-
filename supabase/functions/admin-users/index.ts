// Edge Function `admin-users` (PLAN.md §7.6 #2). Invoked by the app with the admin's JWT:
//   supabase.functions.invoke('admin-users', { body: { action: 'create', ... } })
// Actions: create, update, set_role, set_active, resend_invite, process_deletion (see handler.ts).
import { createClient } from 'npm:@supabase/supabase-js@2';

import { createHandler } from './handler.ts';
import { createPort } from './port.ts';

const port = createPort(createClient, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
});

Deno.serve(createHandler(port));

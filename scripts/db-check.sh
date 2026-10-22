#!/usr/bin/env bash
# Reset the shared local Supabase DB from THIS worktree's migrations + seeds and run pgTAP.
# All worktrees share one local stack (project_id "garbh"), so runs are serialised with a lock.
#   npm run db:check            # reset + supabase test db
#   npm run db:check -- --types # ...and regenerate src/types/database.ts
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

exec 9>/tmp/garbh-supabase.lock
echo "waiting for the shared Supabase lock..."
flock 9

npx supabase status >/dev/null 2>&1 || npx supabase start
npx supabase db reset
npx supabase test db
if [[ "${1:-}" == "--types" ]]; then
  npm run db:types
fi

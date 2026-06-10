# BotCheck — Session Context

## What this is
app.botcheck.io — SaaS that manages AI presence files 
(llms.txt, tools.json, robots.txt) for small businesses.
Hosted on Supabase, deployed to Vercel.

## Stack
TanStack Start, TypeScript, Supabase, Stripe, 
Firecrawl API, Anthropic Claude API, Resend, Vercel

## Current state (as of June 10 2026)
All of the following are built and working:
- Free scan at / (Firecrawl + Claude, stores in Supabase)
- Admin dashboard at /admin (auth protected)
- Onboarding chat at /onboarding/$clientId (auth protected)
- Stripe webhook handler at /api/webhooks/stripe
- Supabase edge function: serve-profile (deployed, public)
- Auth: login at /login, session cookies

## What was just being fixed
The onboarding chat at /onboarding/$clientId was throwing 
a Seroval serialization error. Claude Code just fixed it 
by replacing `object` types with `{ [key: string]: JsonValue }` 
in three places:
- src/lib/onboarding.functions.ts (runOnboardingChat validator)
- src/lib/onboarding.functions.ts (generateProfile validator)  
- src/lib/onboarding.server.ts (loader return type)

## Next thing to do
Test the onboarding chat by visiting:
http://localhost:3000/onboarding/f730a399-341a-45a2-87b6-d03e7188504c

If it loads, walk through the chat to completion and 
verify generateProfile fires and creates a pending_review 
row in the profiles table.

If it still errors, fix whatever is blocking the chat UI.

## After onboarding chat works
Build the weekly monitoring cron job:
supabase/functions/weekly-monitor/index.ts

- Runs every Monday 6am CT via Supabase cron
- For each active client: crawl → score → diff against 
  stored profile → update if changed → send alert email
- Drift detection uses Claude to compare old profile 
  against new crawl
- Only alerts on: broken booking links, pricing changes, 
  services added/removed, hours/location changes, 
  booking system switches

## Supabase project
Project ref: mbqpbtrmodglklfofwlz
Tables: clients, profiles, agencies, scans
Edge function deployed: serve-profile

## GitHub
https://github.com/sgleisten/botcheck-app

## Test client record in Supabase
UUID: f730a399-341a-45a2-87b6-d03e7188504c
Domain: rpms.org
Business: Rogers Park Montessori School

## Key files
src/lib/scan.functions.ts — free scan logic
src/lib/onboarding.functions.ts — chat + profile generation
src/lib/onboarding.server.ts — auth + data loading
src/lib/admin.functions.ts — admin auth + data
src/lib/auth.functions.ts — user auth
src/routes/index.tsx — free scan UI
src/routes/admin/index.tsx — admin dashboard
src/routes/admin/login.tsx — admin login
src/routes/onboarding/$clientId.tsx — onboarding chat
src/routes/login.tsx — user login
supabase/functions/serve-profile/index.ts — file serving
supabase/migrations/20260609000000_initial_schema.sql

## Environment variables needed
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
FIRECRAWL_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_STARTER
RESEND_API_KEY
ADMIN_USER_ID
SESSION_SECRET
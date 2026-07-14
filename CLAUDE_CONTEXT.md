# BotCheck — Session Context

## What this is

https://www.botcheck.io — SaaS that manages AI presence files (llms.txt, tools.json) for small businesses. Hosted on Supabase, deployed to Vercel via Nitro.

## Stack

TanStack Start, TypeScript, Supabase, Stripe, Firecrawl API, Anthropic Claude API, Resend, Vercel

## Current state (as of June 11 2026)

All core flows are built and deployed:

- **9-step scan funnel** at `/` — Firecrawl + Claude, stores in `scans` table
  - Steps 1–3: URL entry, scanning, persist results (`src/routes/index.tsx`, `src/lib/scan.functions.ts`)
  - Steps 4–9: score, categories, before/after demo, email gate, full report, $299/mo CTA (`src/components/scan/ScanResultsView.tsx`)
- **Teaser email** on email unlock — score + link to full report, not the full report body (`sendScanTeaserEmail` in `src/lib/email.server.ts`)
- **Report deep link** at `/report/$scanId` — same results UI, for email links
- **Checkout** — Stripe Checkout + custom deals at `/checkout/$token`
- **Stripe webhook** at `/api/webhooks/stripe` — checkout → onboarding, subscription lifecycle
- **Onboarding chat** at `/onboarding/$clientId` — auth protected, 6-item questionnaire → profile generation
- **Onboarding status** at `/onboarding/status`
- **Admin dashboard** at `/admin` — approve profiles, create deals, client list (`src/routes/admin/index.tsx`)
- **Profile serving** at `/sites/$clientId/llms.txt` and `/sites/$clientId/tools.json` — TanStack server route (`src/routes/sites/$clientId/$filename.ts`)
- **Auth** — login at `/login`, admin login at `/admin/login`, session cookies
- **Weekly monitor** — `supabase/functions/weekly-monitor/index.ts` (drift detection + alert emails only; does not auto-regenerate profiles)
- **Supabase edge function** `serve-profile` — legacy/alternate serving; production URLs use Vercel `/sites/*` route

Deploy guide: `docs/DEPLOY.md`

## Scan → conversion funnel

1. User enters URL on `/`
2. `runScan` scrapes site, Claude scores ARS (0–100) + categories + before/after diff
3. Results shown inline (steps 4–6)
4. Email gate (step 7) — `saveEmail` saves email, sends teaser with link to `/report/{scanId}`
5. Full report unlocked (step 8)
6. Checkout CTA (step 9) — `createCheckoutSession` → Stripe → webhook → `/onboarding/$clientId`

## Supabase project

- Project ref: `mbqpbtrmodglklfofwlz`
- Tables: `clients`, `profiles`, `agencies`, `scans`
- Migrations: `supabase/migrations/`

## GitHub

https://github.com/sgleisten/botcheck-app

## Test client record

- Client UUID: `098895ea-00e5-4b23-8100-2432a0286626`
- Domain: `heybodhi.ai`
- Contact: `sam@aieducators.ai`
- Onboarding URL: `https://www.botcheck.io/onboarding/098895ea-00e5-4b23-8100-2432a0286626`
- Note: `f730a399-341a-45a2-87b6-d03e7188504c` is the auth user id, NOT the client id

## Admin

- Admin email: `sam@aieducators.ai` (`ADMIN_EMAIL`)
- Admin dashboard: `/admin` (requires `ADMIN_USER_ID` Supabase auth UUID)

## Key files

| Area | Path |
|------|------|
| Free scan | `src/lib/scan.functions.ts`, `src/routes/index.tsx` |
| Scan UI | `src/components/scan/ScanResultsView.tsx`, `src/components/ui/BeforeAfterDemo.tsx` |
| Report route | `src/routes/report/$scanId.tsx` |
| Email | `src/lib/email.server.ts` |
| Billing | `src/lib/billing.server.ts`, `src/lib/checkout.functions.ts` |
| Stripe webhook | `src/routes/api/webhooks/stripe.ts` |
| Onboarding | `src/lib/onboarding.functions.ts`, `src/routes/onboarding/$clientId.tsx` |
| Admin | `src/lib/admin.functions.ts`, `src/routes/admin/index.tsx` |
| Auth | `src/lib/auth.functions.ts`, `src/routes/login.tsx` |
| Profile serving | `src/routes/sites/$clientId/$filename.ts` |
| Weekly monitor | `supabase/functions/weekly-monitor/index.ts` |
| Deploy | `docs/DEPLOY.md`, `vite.config.ts`, `vercel.json` |
| Funnel verify | `scripts/verify-funnel.mjs` |

## Environment variables

### Vercel app

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | yes | |
| `SUPABASE_ANON_KEY` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server only |
| `SESSION_SECRET` | yes | 32+ chars in production |
| `ADMIN_USER_ID` | yes | Supabase auth UUID |
| `ANTHROPIC_API_KEY` | yes | Scan + onboarding |
| `FIRECRAWL_API_KEY` | yes | Website scraping |
| `STRIPE_SECRET_KEY` | yes | |
| `STRIPE_WEBHOOK_SECRET` | yes (prod) | From Stripe webhook endpoint |
| `STRIPE_PRICE_ID_STARTER` | optional | Falls back to inline $299/mo price |
| `RESEND_API_KEY` | yes (prod) | Skips send if missing |
| `ADMIN_EMAIL` | yes (prod) | `sam@aieducators.ai` |
| `APP_URL` | yes (prod) | `https://www.botcheck.io` |
| `EMAIL_FROM` | optional | Default `BotCheck <notifications@botcheck.io>` |

### Supabase edge functions (weekly-monitor)

`FIRECRAWL_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`, `APP_URL`, `CRON_SECRET`

Cron: `0 11 * * 1` (Monday 11:00 UTC) with `Authorization: Bearer {CRON_SECRET}`

## Production checklist

1. DNS: `www.botcheck.io` → Vercel; `app.botcheck.io` redirects to www (Vercel + Worker pass-through)
2. Vercel env vars set (see above) → redeploy
3. Stripe webhook: `https://www.botcheck.io/api/webhooks/stripe`
4. Deploy edge functions: `serve-profile`, `weekly-monitor`
5. Set Supabase secrets + schedule weekly-monitor cron
6. Smoke test: `APP_URL=https://www.botcheck.io node scripts/verify-funnel.mjs`

## Local dev notes

- `.env` in project root (gitignored) — placeholder Stripe/Resend keys OK for dev
- Stripe CLI for local webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- Emails skipped without `RESEND_API_KEY`; unlock still works in UI

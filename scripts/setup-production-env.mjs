#!/usr/bin/env node
/**
 * Prints Vercel + Stripe production setup checklist.
 * Run: node scripts/setup-production-env.mjs
 *
 * Vercel CLI must be logged in (`npx vercel login`) to push env vars automatically.
 */

const PRODUCTION_URL = 'https://app.botcheck.io'
const VERCEL_FALLBACK = 'https://botcheck-app.vercel.app'

const envVars = {
  APP_URL: PRODUCTION_URL,
  ADMIN_EMAIL: 'sam@aieducators.ai',
  // Set these from your secret stores — do not commit real values:
  RESEND_API_KEY: '<from Resend dashboard>',
  STRIPE_WEBHOOK_SECRET: '<from Stripe webhook after creating endpoint>',
  STRIPE_PRICE_ID_STARTER: '<optional — omit to use $299 inline fallback>',
}

console.log(`
BotCheck production environment setup
=====================================

Canonical URL: ${PRODUCTION_URL}
Vercel fallback (live now): ${VERCEL_FALLBACK}

## 1. Vercel custom domain

1. Vercel project → Domains → add app.botcheck.io
2. Add DNS CNAME per Vercel instructions
3. Wait for SSL

## 2. Vercel environment variables (Production)

Set in dashboard or via CLI:

`)

for (const [key, value] of Object.entries(envVars)) {
  console.log(`  ${key}=${value}`)
}

console.log(`
Plus existing vars from docs/DEPLOY.md (SUPABASE_*, SESSION_SECRET, ADMIN_USER_ID, ANTHROPIC_API_KEY, FIRECRAWL_API_KEY, STRIPE_SECRET_KEY).

CLI example (after vercel login, from project root):
  npx vercel env add APP_URL production
  npx vercel env add ADMIN_EMAIL production
  npx vercel env add RESEND_API_KEY production
  npx vercel env add STRIPE_WEBHOOK_SECRET production

Then redeploy: npx vercel --prod

## 3. Stripe webhook

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: ${PRODUCTION_URL}/api/webhooks/stripe
   (Use ${VERCEL_FALLBACK}/api/webhooks/stripe until DNS is live)
3. Events: checkout.session.completed, invoice.paid, customer.subscription.deleted, invoice.payment_failed
4. Copy signing secret → STRIPE_WEBHOOK_SECRET on Vercel → redeploy

## 4. Supabase (done via CLI)

- serve-profile + weekly-monitor deployed
- Secrets set: FIRECRAWL_API_KEY, ANTHROPIC_API_KEY, ADMIN_EMAIL, APP_URL, CRON_SECRET
- Cron: botcheck-weekly-monitor (0 11 * * 1)

## 5. Smoke test

  APP_URL=${PRODUCTION_URL} node scripts/verify-funnel.mjs

Or until DNS is live:
  APP_URL=${VERCEL_FALLBACK} node scripts/verify-funnel.mjs
`)

#!/usr/bin/env node
/**
 * Verifies BotCheck funnel prerequisites and DB schema.
 * Run: npm run verify:funnel
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

function loadEnv() {
  if (!existsSync('.env')) throw new Error('.env file not found')
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'SESSION_SECRET',
  'ANTHROPIC_API_KEY',
  'FIRECRAWL_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_ID_STARTER',
  'ADMIN_USER_ID',
]

const optionalEnv = ['STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'ADMIN_EMAIL', 'APP_URL']

let failed = 0

function pass(msg) {
  console.log(`  ✓ ${msg}`)
}
function fail(msg) {
  console.log(`  ✗ ${msg}`)
  failed++
}

console.log('\nBotCheck funnel verification\n')

const env = loadEnv()

console.log('Environment variables')
for (const key of requiredEnv) {
  if (env[key]) pass(key)
  else fail(`${key} missing`)
}
for (const key of optionalEnv) {
  if (env[key]) pass(`${key} (optional)`)
  else console.log(`  · ${key} not set (optional)`)
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

console.log('\nDatabase schema')
const { error: billingErr } = await sb
  .from('clients')
  .select('billing_type, checkout_token, quoted_monthly_cents, scan_id')
  .limit(1)
if (billingErr) fail(`clients billing columns: ${billingErr.message}`)
else pass('clients billing + scan_id columns')

const { error: scanErr } = await sb.from('scans').select('site_snapshot, client_id').limit(1)
if (scanErr) fail(`scans columns: ${scanErr.message}`)
else pass('scans client_id + site_snapshot columns')

console.log('\nCore tables')
for (const table of ['clients', 'profiles', 'scans']) {
  const { error } = await sb.from(table).select('id').limit(1)
  if (error) fail(`${table}: ${error.message}`)
  else pass(table)
}

console.log('\nAdmin user')
const { data: adminUser, error: adminErr } = await sb.auth.admin.getUserById(env.ADMIN_USER_ID)
if (adminErr || !adminUser.user) fail(`ADMIN_USER_ID invalid: ${adminErr?.message}`)
else pass(`Admin auth user: ${adminUser.user.email}`)

console.log('\nTest client (onboarding without new payment)')
const TEST_CLIENT = '098895ea-00e5-4b23-8100-2432a0286626'
const { data: testClient, error: clientErr } = await sb
  .from('clients')
  .select('id, domain, status, contact_email')
  .eq('id', TEST_CLIENT)
  .maybeSingle()
if (clientErr || !testClient) fail(`Test client ${TEST_CLIENT} not found`)
else {
  pass(`Test client: ${testClient.domain} (${testClient.status})`)
  console.log(`    Onboarding URL: ${env.APP_URL ?? 'http://localhost:3000'}/onboarding/${TEST_CLIENT}`)
}

console.log('\nCustom deal smoke test')
const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
const { data: dealClient, error: dealErr } = await sb
  .from('clients')
  .insert({
    domain: 'verify-test.example.com',
    contact_email: 'verify@example.com',
    status: 'pending_payment',
    billing_type: 'custom_checkout',
    quoted_monthly_cents: 19900,
    checkout_token: token,
  })
  .select('id, checkout_token')
  .single()

if (dealErr) fail(`Create deal insert: ${dealErr.message}`)
else {
  pass('Admin create-deal schema accepts insert')
  const checkoutUrl = `${env.APP_URL ?? 'http://localhost:3000'}/checkout/${dealClient.checkout_token}`
  console.log(`    Sample checkout URL: ${checkoutUrl}`)
  await sb.from('clients').delete().eq('id', dealClient.id)
  pass('Cleaned up test deal row')
}

console.log('\nDev server')
try {
  const res = await fetch(`${env.APP_URL ?? 'http://localhost:3000'}/`)
  if (res.ok) pass(`Homepage ${res.status}`)
  else fail(`Homepage returned ${res.status}`)
} catch {
  fail('Dev server not reachable — run npm run dev')
}

console.log(`\n${failed === 0 ? 'All checks passed.' : `${failed} check(s) failed.`}\n`)
console.log('Manual E2E steps:')
console.log('  1. Scan at / → checkout with 4242 4242 4242 4242')
console.log('  2. stripe listen --forward-to localhost:3000/api/webhooks/stripe')
console.log('  3. Onboarding chat → admin approve → /sites/{clientId}/llms.txt')
console.log('  4. Admin → Create deal → pay via /checkout/{token}\n')

process.exit(failed > 0 ? 1 : 0)

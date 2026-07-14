#!/usr/bin/env node
/**
 * Automated production smoke tests for BotCheck funnel.
 * Run: node scripts/e2e-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

const BASE = process.env.APP_URL ?? 'https://www.botcheck.io'
const TEST_CLIENT = '098895ea-00e5-4b23-8100-2432a0286626'
const TEST_SCAN = 'f6c0d54e-8be8-4cc1-95a7-0a2d233d32dc'

function loadEnv() {
  if (!existsSync('.env')) return {}
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

let failed = 0
function pass(msg) {
  console.log(`  ✓ ${msg}`)
}
function fail(msg) {
  console.log(`  ✗ ${msg}`)
  failed++
}

async function check(label, url, opts = {}) {
  const { expectStatus = 200, includes } = opts
  try {
    const res = await fetch(url, { method: opts.method ?? 'GET', body: opts.body })
    if (res.status !== expectStatus) {
      fail(`${label}: expected ${expectStatus}, got ${res.status}`)
      return null
    }
    if (includes) {
      const text = await res.text()
      if (!text.includes(includes)) {
        fail(`${label}: missing "${includes}"`)
        return null
      }
    }
    pass(label)
    return res
  } catch (err) {
    fail(`${label}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

console.log(`\nBotCheck E2E smoke test — ${BASE}\n`)

console.log('HTTP endpoints')
await check('Homepage', `${BASE}/`)
await check('Magic moment report', `${BASE}/report/${TEST_SCAN}`, {
  includes: 'With BotCheck',
})
await check('Profile llms.txt', `${BASE}/sites/${TEST_CLIENT}/llms.txt`)
await check('Stripe webhook rejects unsigned', `${BASE}/api/webhooks/stripe`, {
  method: 'POST',
  body: '{}',
  expectStatus: 400,
})
await check('Admin login page', `${BASE}/admin/login`)
await check('Onboarding status', `${BASE}/onboarding/status`)

console.log('\nLegacy app subdomain')
const appRes = await fetch('https://app.botcheck.io/', { redirect: 'manual' }).catch(() => null)
if (appRes && (appRes.status === 301 || appRes.status === 308 || appRes.status === 200)) {
  pass(`app.botcheck.io responds (${appRes.status})`)
} else {
  fail(`app.botcheck.io — expected redirect or 200, got ${appRes?.status ?? 'no response'}`)
}

console.log('\nDatabase')
const env = loadEnv()
if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: client } = await sb
    .from('clients')
    .select('id, domain, status')
    .eq('id', TEST_CLIENT)
    .single()
  if (client) pass(`Test client ${client.domain} (${client.status})`)
  else fail('Test client not found')

  const { data: profile } = await sb
    .from('profiles')
    .select('status')
    .eq('client_id', TEST_CLIENT)
    .eq('status', 'live')
    .maybeSingle()
  if (profile) pass('Live profile exists for test client')
  else fail('No live profile for test client (approve in /admin to fix)')
} else {
  fail('Supabase credentials missing in .env')
}

console.log('\nEmail (Resend)')
if (env.RESEND_API_KEY?.startsWith('re_')) pass('RESEND_API_KEY configured locally')
else fail('RESEND_API_KEY not set — run: node scripts/configure-resend.mjs after adding key to .env')

console.log(`\n${failed === 0 ? 'All automated checks passed.' : `${failed} check(s) need attention.`}`)
console.log('\nManual steps (require browser):')
console.log('  1. Free scan → email gate → teaser email in inbox')
console.log('  2. Checkout → onboarding chat')
console.log('  3. Admin approve → customer live email\n')

process.exit(failed > 0 ? 1 : 0)

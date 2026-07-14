#!/usr/bin/env node
/**
 * Automates production setup steps that don't require interactive login.
 * Run: node scripts/complete-production.mjs
 *
 * Optional: VERCEL_TOKEN=... node scripts/complete-production.mjs
 *   → pushes APP_URL, ADMIN_EMAIL, STRIPE_WEBHOOK_SECRET to Vercel production env
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

const PRODUCTION_URL = 'https://www.botcheck.io'
const VERCEL_URL = 'https://botcheck-app.vercel.app'
const WEBHOOK_PATH = '/api/webhooks/stripe'
const STRIPE_EVENTS = [
  'checkout.session.completed',
  'invoice.paid',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]

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

async function ensureStripeWebhook(stripeKey, targetUrl) {
  const listRes = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=20', {
    headers: { Authorization: `Basic ${Buffer.from(`${stripeKey}:`).toString('base64')}` },
  })
  const list = await listRes.json()
  if (!listRes.ok) throw new Error(`Stripe list webhooks failed: ${JSON.stringify(list)}`)

  const existing = (list.data ?? []).find((e) => e.url === targetUrl && e.status === 'enabled')
  if (existing) {
    console.log(`  ✓ Stripe webhook already registered: ${targetUrl}`)
    return { endpointId: existing.id, secret: null, created: false }
  }

  const body = new URLSearchParams()
  body.set('url', targetUrl)
  for (const ev of STRIPE_EVENTS) body.append('enabled_events[]', ev)

  const createRes = await fetch('https://api.stripe.com/v1/webhook_endpoints', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${stripeKey}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const created = await createRes.json()
  if (!createRes.ok) throw new Error(`Stripe create webhook failed: ${JSON.stringify(created)}`)

  console.log(`  ✓ Created Stripe webhook: ${targetUrl}`)
  return { endpointId: created.id, secret: created.secret, created: true }
}

async function findVercelProject(token) {
  const res = await fetch('https://api.vercel.com/v9/projects?search=botcheck', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Vercel projects list failed: ${JSON.stringify(json)}`)
  const project =
    json.projects?.find((p) => p.name === 'botcheck-app') ??
    json.projects?.find((p) => p.name?.includes('botcheck'))
  if (!project) throw new Error('Could not find botcheck Vercel project')
  return project
}

async function upsertVercelEnv(token, projectId, key, value, target = ['production']) {
  const listRes = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env?decrypt=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const list = await listRes.json()
  if (!listRes.ok) throw new Error(`Vercel env list failed: ${JSON.stringify(list)}`)

  const existing = (list.envs ?? []).find((e) => e.key === key && e.target?.includes('production'))

  if (existing) {
    const patchRes = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value, target }),
      },
    )
    const patched = await patchRes.json()
    if (!patchRes.ok) throw new Error(`Vercel env patch ${key} failed: ${JSON.stringify(patched)}`)
    console.log(`  ✓ Updated Vercel env: ${key}`)
    return
  }

  const createRes = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key, value, type: 'encrypted', target }),
  })
  const created = await createRes.json()
  if (!createRes.ok) throw new Error(`Vercel env create ${key} failed: ${JSON.stringify(created)}`)
  console.log(`  ✓ Created Vercel env: ${key}`)
}

async function triggerVercelRedeploy(token, projectId, projectName) {
  const res = await fetch(`https://api.vercel.com/v13/deployments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      project: projectId,
      target: 'production',
      gitSource: { type: 'github', ref: 'main', repoId: undefined },
    }),
  })
  const json = await res.json()
  if (!res.ok) {
    console.log(`  ⚠ Redeploy skipped (may need dashboard): ${json.error?.message ?? JSON.stringify(json)}`)
    return
  }
  console.log(`  ✓ Triggered production redeploy`)
}

async function smokeTest(baseUrl) {
  let failed = 0
  async function check(label, url, expectStatus = 200) {
    try {
      const res = await fetch(url)
      if (res.status === expectStatus) console.log(`  ✓ ${label}: ${res.status}`)
      else {
        console.log(`  ✗ ${label}: expected ${expectStatus}, got ${res.status}`)
        failed++
      }
    } catch (err) {
      console.log(`  ✗ ${label}: ${err instanceof Error ? err.message : err}`)
      failed++
    }
  }

  await check('Homepage', `${baseUrl}/`)
  await check('Profile llms.txt', `${baseUrl}/sites/098895ea-00e5-4b23-8100-2432a0286626/llms.txt`)
  try {
    const res = await fetch(`${baseUrl}${WEBHOOK_PATH}`, { method: 'POST', body: '{}' })
    if (res.status === 400) console.log(`  ✓ Stripe webhook (no sig): ${res.status}`)
    else {
      console.log(`  ✗ Stripe webhook (no sig): expected 400, got ${res.status}`)
      failed++
    }
  } catch (err) {
    console.log(`  ✗ Stripe webhook (no sig): ${err instanceof Error ? err.message : err}`)
    failed++
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: client } = await sb
    .from('clients')
    .select('id, domain, status')
    .eq('id', '098895ea-00e5-4b23-8100-2432a0286626')
    .single()
  if (client) console.log(`  ✓ Test client: ${client.domain} (${client.status})`)
  else {
    console.log('  ✗ Test client not found')
    failed++
  }

  return failed === 0
}

console.log('\nBotCheck production completion\n')

const env = loadEnv()
process.env.SUPABASE_URL = env.SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

const stripeKey = env.STRIPE_SECRET_KEY
if (!stripeKey || stripeKey.includes('your-')) throw new Error('STRIPE_SECRET_KEY missing in .env')

console.log('Stripe webhook')
const webhookUrl = `${VERCEL_URL}${WEBHOOK_PATH}`
const { secret, created } = await ensureStripeWebhook(stripeKey, webhookUrl)
const webhookSecret = secret ?? env.STRIPE_WEBHOOK_SECRET
if (created && secret) {
  console.log(`  → New signing secret (add to Vercel STRIPE_WEBHOOK_SECRET): ${secret}`)
} else if (env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
  console.log('  → Using STRIPE_WEBHOOK_SECRET from .env')
} else {
  console.log('  ⚠ Webhook exists but signing secret unknown — roll in Stripe Dashboard or delete & re-run')
}

console.log('\nDNS check')
const dnsRes = await fetch(`https://dns.google/resolve?name=app.botcheck.io&type=A`).catch(() => null)
if (dnsRes?.ok) {
  const dns = await dnsRes.json()
  const hasRecords = (dns.Answer ?? []).length > 0
  if (hasRecords) console.log('  ✓ app.botcheck.io has DNS records')
  else console.log('  ⚠ app.botcheck.io has no DNS — add CNAME in Vercel Domains + registrar')
} else {
  console.log('  ⚠ Could not check DNS for app.botcheck.io')
}

const vercelToken = process.env.VERCEL_TOKEN
if (vercelToken) {
  console.log('\nVercel environment')
  const project = await findVercelProject(vercelToken)
  const envToSet = {
    APP_URL: PRODUCTION_URL,
    ADMIN_EMAIL: 'sam@aieducators.ai',
  }
  if (webhookSecret?.startsWith('whsec_')) envToSet.STRIPE_WEBHOOK_SECRET = webhookSecret
  if (env.RESEND_API_KEY && !env.RESEND_API_KEY.includes('your-')) {
    envToSet.RESEND_API_KEY = env.RESEND_API_KEY
  }

  for (const [key, value] of Object.entries(envToSet)) {
    await upsertVercelEnv(vercelToken, project.id, key, value)
  }
  await triggerVercelRedeploy(vercelToken, project.id, project.name)
} else {
  console.log('\nVercel environment')
  console.log('  ⚠ VERCEL_TOKEN not set — set env vars manually in Vercel dashboard:')
  console.log(`    APP_URL=${PRODUCTION_URL}`)
  console.log('    ADMIN_EMAIL=sam@aieducators.ai')
  if (webhookSecret?.startsWith('whsec_')) console.log(`    STRIPE_WEBHOOK_SECRET=${webhookSecret}`)
  if (!env.RESEND_API_KEY?.startsWith('re_')) console.log('    RESEND_API_KEY=<from Resend dashboard>')
}

console.log(`\nSmoke test (${VERCEL_URL})`)
const ok = await smokeTest(VERCEL_URL)
console.log(ok ? '\nProduction checks passed.\n' : '\nSome production checks failed.\n')
process.exit(ok ? 0 : 1)

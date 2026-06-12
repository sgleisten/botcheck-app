#!/usr/bin/env node
/**
 * Push RESEND_API_KEY to Vercel + Supabase when set in .env.
 * Run after adding: RESEND_API_KEY=re_... to .env
 *
 *   node scripts/configure-resend.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'

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

const env = loadEnv()
const key = env.RESEND_API_KEY

if (!key?.startsWith('re_')) {
  console.log(`
RESEND_API_KEY not configured.

1. Get your key from https://resend.com/api-keys
2. Add to .env:  RESEND_API_KEY=re_...
3. Re-run:       node scripts/configure-resend.mjs
`)
  process.exit(1)
}

console.log('Setting RESEND_API_KEY on Vercel (production)...')
execSync(`printf '%s' '${key}' | npx vercel env add RESEND_API_KEY production --scope hey-bodhi --force`, {
  stdio: 'inherit',
  shell: true,
})

console.log('Setting RESEND_API_KEY on Supabase...')
execSync(
  `supabase secrets set RESEND_API_KEY='${key}' --project-ref mbqpbtrmodglklfofwlz`,
  { stdio: 'inherit' },
)

console.log('Redeploying Vercel production...')
execSync('npx vercel redeploy botcheck-app.vercel.app --scope hey-bodhi', { stdio: 'inherit' })

console.log('\nDone. Emails should work after deploy completes (~30s).')

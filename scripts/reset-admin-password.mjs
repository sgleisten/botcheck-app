#!/usr/bin/env node
/**
 * Emergency admin password reset via Supabase service role.
 *
 * Usage:
 *   node scripts/reset-admin-password.mjs 'YourNewSecurePassword123'
 *
 * Requires in .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_USER_ID
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const [, key, raw] = m
    if (process.env[key] == null) {
      process.env[key] = raw.replace(/^["']|["']$/g, '')
    }
  }
}

loadEnv()

const password = process.argv[2]
if (!password || password.length < 8) {
  console.error('Usage: node scripts/reset-admin-password.mjs "NewPassword8chars+"')
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminUserId = process.env.ADMIN_USER_ID

if (!url || !key || !adminUserId) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or ADMIN_USER_ID in .env')
  process.exit(1)
}

const sb = createClient(url, key)

const { data: user, error: fetchError } = await sb.auth.admin.getUserById(adminUserId)
if (fetchError || !user.user) {
  console.error('ADMIN_USER_ID not found in Supabase Auth:', fetchError?.message)
  process.exit(1)
}

const { error } = await sb.auth.admin.updateUserById(adminUserId, { password })
if (error) {
  console.error('Failed to update password:', error.message)
  process.exit(1)
}

console.log(`Admin password updated for ${user.user.email}`)
console.log('Sign in at /admin/login with that email and your new password.')

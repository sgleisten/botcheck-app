# Deploy BotCheck to Vercel

## Why you saw a 404

TanStack Start needs the **Nitro** Vite plugin to build for Vercel. Without it, Vercel has no server entry point and every route returns `NOT_FOUND`. This repo now includes Nitro in [`vite.config.ts`](../vite.config.ts). **Push the latest code and redeploy** — the site should load after that.

## Prerequisites

- GitHub repo pushed: https://github.com/sgleisten/botcheck-app
- Supabase migrations applied (see `supabase/migrations/`)
- Stripe live products/prices configured
- Resend domain verified for `notifications@botcheck.io` (or set `EMAIL_FROM` in env)

## 1. Connect Vercel

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new)
2. Framework preset: **TanStack Start** (Vercel auto-detects Nitro)
3. Build command: `npm run build` (default — do not point output at `dist/`)
4. Deploy — Vercel sets `VERCEL=1` during build and produces the correct serverless output

If the preset is wrong: Project → Settings → General → Framework Preset → **TanStack Start**, then redeploy.

## 2. Environment variables

In Vercel → your project → **Settings** → **Environment Variables**, add each variable for **Production** (and Preview if you want):

| Variable | Notes |
|----------|--------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only — never expose to client |
| `SESSION_SECRET` | 32+ char random string |
| `ADMIN_USER_ID` | Supabase auth UUID for admin |
| `ANTHROPIC_API_KEY` | Scan + onboarding + monitor |
| `FIRECRAWL_API_KEY` | Website scraping |
| `STRIPE_SECRET_KEY` | Live secret key in production |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook endpoint |
| `STRIPE_PRICE_ID_STARTER` | Live $299/mo price ID |
| `RESEND_API_KEY` | Transactional email |
| `ADMIN_EMAIL` | **Your inbox** — e.g. `sam@aieducators.ai` — for “profile ready for review” alerts |
| `APP_URL` | `https://botcheck.io` (apex — the app is now the whole site) |
| `EMAIL_FROM` | Optional — default `BotCheck <notifications@botcheck.io>` |
| `CLOUDFLARE_API_TOKEN` | Cloudflare for SaaS — Custom Hostnames Edit + Worker deploy |
| `CLOUDFLARE_ZONE_ID` | Zone ID for `botcheck.io` |
| `CLOUDFLARE_FALLBACK_ORIGIN` | Optional — CNAME target clients point at; default `fallback.botcheck.io` |

After adding or changing env vars, go to **Deployments** → ⋮ on the latest deploy → **Redeploy**.

### Step 1 (local): set `ADMIN_EMAIL` in `.env`

This is the same idea as Vercel, but for your laptop:

1. Open the project folder in your editor
2. Open (or create) a file named `.env` in the project root
3. Add a line: `ADMIN_EMAIL=your-email@example.com` (use the address where you want review alerts)
4. Save the file
5. Restart the dev server (`npm run dev`) if it is already running

The app reads this when someone finishes onboarding — you get an email pointing you to `/admin` to approve the profile.

## 3. Stripe webhook (production)

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://botcheck.io/api/webhooks/stripe`
3. Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET` on Vercel
5. Redeploy after updating env vars

## 4. Supabase edge functions

Deploy profile serving and weekly monitor:

```bash
supabase functions deploy serve-profile --project-ref mbqpbtrmodglklfofwlz
supabase functions deploy weekly-monitor --project-ref mbqpbtrmodglklfofwlz
supabase functions deploy hostname-lookup --project-ref mbqpbtrmodglklfofwlz
```

`hostname-lookup` resolves a custom hostname → `{ client_id, status }` for the
Cloudflare Worker (section 7). It uses the service-role key server-side (already
in the function's env) and returns nothing else from the row.

Set secrets on Supabase for `weekly-monitor`:

```bash
supabase secrets set FIRECRAWL_API_KEY=... ANTHROPIC_API_KEY=... RESEND_API_KEY=... ADMIN_EMAIL=sam@aieducators.ai APP_URL=https://botcheck.io CRON_SECRET=...
```

Schedule weekly monitor (Supabase Dashboard → Edge Functions → Cron):

```
0 11 * * 1
```

(6am CT ≈ 11:00 UTC on Mondays — adjust as needed)

Invoke with header: `Authorization: Bearer {CRON_SECRET}`

## 5. Custom domain — apex `botcheck.io` (the app is now the whole site)

As of the marketing/app consolidation, **`botcheck-app` is the entire site**: landing page, `/how-it-works`,
`/agencies`, `/pricing`, the scan funnel, and the app. The old `agent-site-score` marketing repo is retired.
Point the apex domain at this Vercel project:

1. In Vercel → `hey-bodhi/botcheck-app` → **Settings → Domains**, add **`botcheck.io`** (apex) and **`www.botcheck.io`**.
2. At **Cloudflare** (registrar for `botcheck.io`):
   - Apex `botcheck.io`: **A record** → `76.76.21.21` (Vercel), or switch nameservers to `ns1/ns2.vercel-dns.com`.
   - `www`: **CNAME** → `cname.vercel-dns.com` (Vercel will set the `www` ↔ apex redirect).
3. (Optional) Keep **`app.botcheck.io`** as a **redirect** to `https://botcheck.io` so any old links/emails still resolve.
   Add it as a domain in Vercel and set it to redirect to the apex.
4. Wait for SSL provisioning (Vercel emails when verification completes).
5. Ensure `APP_URL=https://botcheck.io` on Vercel **and** the Stripe webhook URL (section 3) match.
6. **Retire the marketing site:** once apex resolves to this project, archive `sgleisten/agent-site-score`
   on GitHub and remove/redirect its Vercel deployment so two front doors don't coexist.

Until DNS propagates, production works at `https://botcheck-app.vercel.app`.

### Resend (transactional email)

After you have a Resend API key (`re_...`):

```bash
# Add RESEND_API_KEY=re_... to .env, then:
npm run configure:resend
```

This sets Vercel + Supabase secrets and redeploys.

### Smoke test

```bash
npm run verify:e2e
```

Profile files are served by the TanStack app at `/sites/{clientId}/llms.txt` and `/sites/{clientId}/tools.json` (`src/routes/sites/$clientId/$filename.ts`). The Supabase `serve-profile` edge function is a legacy alternate; production emails link to `APP_URL/sites/...`, and the custom-hostname Worker (section 7) proxies to this app route too — so it is the canonical path and should not be removed without updating the Worker.

## 6. Post-deploy smoke test

```bash
APP_URL=https://botcheck.io node scripts/verify-funnel.mjs
```

1. Free scan on production homepage
2. Test checkout (Stripe test mode first if desired)
3. Onboarding chat completes → admin approve → customer receives live email
4. Profile loads at `/sites/{clientId}/llms.txt`

## 7. Client custom subdomains — Cloudflare for SaaS + Worker

Each client can serve their AI profile from their **own** subdomain (e.g.
`ai.midstatehealth.net`) with a valid cert on their domain, instead of a
`botcheck.io/sites/...` URL. The pieces:

- **`hostname-lookup`** edge function (section 4) — resolves a Host → `client_id`.
- **`botcheck-profile-router`** Worker (`cloudflare/worker/`) — the fallback
  origin. Reads the Host header, calls `hostname-lookup`, proxies to
  `APP_URL/sites/{clientId}/{file}`, and returns it as if served from the
  client's domain. Holds **no** Supabase credential.
- **`clients.custom_hostname*`** columns (migration `20260711000000`) — store
  the hostname, Cloudflare's hostname ID, and verification status.

### One-time setup (Cloudflare dashboard — operator, not automated)

Cloudflare for SaaS Custom Hostnames is available on Free/Pro/Business (100
hostnames free, then $0.10/mo each). It is an **opt-in** feature per zone.

1. **Enable Cloudflare for SaaS** on the `botcheck.io` zone (SSL/TLS → Custom
   Hostnames).
2. **Deploy the Worker:**
   ```bash
   cd cloudflare/worker
   npm install
   npx wrangler login
   npx wrangler deploy
   ```
   (`SUPABASE_URL` and `APP_URL` are set as `[vars]` in `wrangler.toml` — no
   secrets needed; the Worker holds no credentials.)
3. **Set the Worker as the fallback origin** for custom hostnames (Cloudflare's
   "Workers as your fallback origin" flow). Point `fallback.botcheck.io` (or
   whatever you set as `CLOUDFLARE_FALLBACK_ORIGIN`) at the Worker.

### Per-client flow

1. Admin opens `/admin`, clicks **Setup Hostname** on the client row, enters
   `ai.{clientdomain}` → registers it with Cloudflare via `setupCustomHostname`.
2. Client adds one **CNAME**: `ai` → `fallback.botcheck.io` (the onboarding
   page at `/onboarding/dns-setup/{clientId}` shows this and auto-polls).
3. Once the CNAME is live, Cloudflare validates + issues the cert automatically
   (HTTP DCV — no second record for the client). Status flips to `active`, the
   client is marked live, and the live email goes out.
4. Admin can **Check Hostname** / **Re-register Hostname** from the same row;
   the onboarding page surfaces Cloudflare's error detail if verification fails.

Watch Worker logs during a launch: `cd cloudflare/worker && npx wrangler tail`.

## Step 2 (local): test checkout with Stripe webhooks

This checks that payment → onboarding works on your machine before you rely on production.

1. **Install Stripe CLI** (one time): https://stripe.com/docs/stripe-cli — then run `stripe login` in Terminal
2. **Start the app**: in one terminal, `npm run dev`
3. **Forward webhooks**: in a second terminal:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Stripe prints a line like `whsec_...` — copy that value
5. Add to `.env`: `STRIPE_WEBHOOK_SECRET=whsec_...` (paste your value)
6. Restart `npm run dev`
7. In the browser: run a free scan → enter your email → **Fix this for me — $299/mo** → pay with test card `4242 4242 4242 4242`, any future expiry, any CVC
8. After payment you should land on onboarding chat; complete it, then check `/admin` for a pending profile

You only need the Stripe CLI listener for **local** testing. Production uses the webhook URL in the Stripe Dashboard (section 3 above).

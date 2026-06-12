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
| `APP_URL` | `https://app.botcheck.io` |
| `EMAIL_FROM` | Optional — default `BotCheck <notifications@botcheck.io>` |

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
2. URL: `https://app.botcheck.io/api/webhooks/stripe`
3. Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET` on Vercel
5. Redeploy after updating env vars

## 4. Supabase edge functions

Deploy profile serving and weekly monitor:

```bash
supabase functions deploy serve-profile --project-ref mbqpbtrmodglklfofwlz
supabase functions deploy weekly-monitor --project-ref mbqpbtrmodglklfofwlz
```

Set secrets on Supabase for `weekly-monitor`:

```bash
supabase secrets set FIRECRAWL_API_KEY=... ANTHROPIC_API_KEY=... RESEND_API_KEY=... ADMIN_EMAIL=sam@aieducators.ai APP_URL=https://app.botcheck.io CRON_SECRET=...
```

Schedule weekly monitor (Supabase Dashboard → Edge Functions → Cron):

```
0 11 * * 1
```

(6am CT ≈ 11:00 UTC on Mondays — adjust as needed)

Invoke with header: `Authorization: Bearer {CRON_SECRET}`

## 5. Custom domain (app.botcheck.io)

Domain is added on Vercel (`hey-bodhi/botcheck-app`). Finish DNS at **Cloudflare** (registrar for `botcheck.io`):

1. Add **A record**: `app` → `76.76.21.21` (Vercel recommended)
2. Or switch nameservers to Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`)
3. Wait for SSL provisioning (Vercel emails when verification completes)
4. Ensure `APP_URL=https://app.botcheck.io` on Vercel and Stripe webhook URL match

Until DNS propagates, production works at `https://botcheck-app.vercel.app`.

Profile files are served by the TanStack app at `/sites/{clientId}/llms.txt` and `/sites/{clientId}/tools.json` (`src/routes/sites/$clientId/$filename.ts`). The Supabase `serve-profile` edge function is a legacy alternate; production emails link to `APP_URL/sites/...`.

## 6. Post-deploy smoke test

```bash
APP_URL=https://app.botcheck.io node scripts/verify-funnel.mjs
```

1. Free scan on production homepage
2. Test checkout (Stripe test mode first if desired)
3. Onboarding chat completes → admin approve → customer receives live email
4. Profile loads at `/sites/{clientId}/llms.txt`

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

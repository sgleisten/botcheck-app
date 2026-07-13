# Agency service checklist (SOP)

One tier for every client. Cloudflare for everyone; on-site files when you have hosting access.

**Console:** `https://botcheck.io/admin` (or `{APP_URL}/admin`)

---

## Before your first client

- [ ] Supabase migrations applied (including `20260713000000_agency_client_tracking.sql`)
- [ ] Vercel production deploy is current (`npm run build` passes locally)
- [ ] Cloudflare Worker deployed: `cd cloudflare/worker && npx wrangler deploy`
- [ ] Env vars set in Vercel: `SUPABASE_*`, `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `CLOUDFLARE_*`, `ADMIN_USER_ID`, `APP_URL`
- [ ] (Optional) Resend configured for drift alert emails
- [ ] (Optional) Deploy Cloudflare **ai-brand-visibility-template** for brand mention testing

---

## Path A: Client signed up on botcheck.io

1. **They run a free scan** → enter email → pay via Stripe → complete onboarding chat.
2. **You get an email** when their profile is ready for review (`ADMIN_EMAIL`).
3. **Open `/admin`** → **Pending Review** table → **Review & edit** or **Approve**.
4. Continue with **Delivery** below.

**Baseline score:** Set automatically from their funnel scan when they checkout. Check the **Score** column (`42 → —` means baseline captured, post-delivery not run yet).

---

## Path B: You add the client manually

1. **`/admin` → + Add Client**
   - Domain, business name, contact email
   - Check **hosting access** if you can upload files to their site
   - Baseline scan runs automatically
2. Complete **onboarding** (on their behalf or send them the onboarding link).
3. **Approve** profile when ready.
4. Continue with **Delivery** below.

---

## Delivery (every client)

Open **`/admin` → Clients → Deploy** on the client row.

### Step 1 — Record baseline brand visibility (before deploy)

1. In Cloudflare **ai-brand-visibility-template**, add the client's domain.
2. Run 5–10 prompts (e.g. "best [service] in [city]").
3. Note how many of 5 models mention the brand (e.g. **0/5**).
4. In the Deploy panel → **Brand visibility** → type **Baseline** → Record.

### Step 2 — Cloudflare (required for every client)

1. In Deploy panel, enter custom hostname: `ai.clientdomain.com`
2. Click **Register hostname**
3. Send client the **DNS setup link** (Copy DNS setup link for client)
   - They add CNAME: `ai` → `fallback.botcheck.io` (or your `CLOUDFLARE_FALLBACK_ORIGIN`)
4. Click **Check status** until **active**
5. Verify live surfaces (after profile is approved):
   - `https://botcheck.io/sites/{clientId}/llms.txt`
   - Same path for `tools.json`, `index.json`, `jsonld`
   - Or via their custom hostname once DNS is live

### Step 3 — On their website (only if hosting access)

Use **Copy** buttons in Deploy panel:

1. Upload **llms.txt** to site root → `https://theirdomain.com/llms.txt`
2. Upload **tools.json** to site root
3. Append **robots.txt additions** to their existing robots.txt
4. Add **JSON-LD snippet** to homepage `<head>`
5. Verify each URL loads publicly (no login, no redirect loop)

### Step 4 — Post-delivery proof

1. In Deploy panel → **Run post-delivery scan**
2. Score column should show **before → after** (e.g. `42 → 78`)
3. Re-run brand visibility in Cloudflare → Record as **Post-delivery** (e.g. **3/5**)
4. Click **Client report (PDF)** → Save as PDF → send to client

---

## Client report — what to tell them

You can honestly say:

- **"Your Agent Readiness Score went from X to Y"** (measured re-scan)
- **"We deployed AI discovery files"** (llms.txt, tools.json, JSON-LD, Cloudflare agent surfaces)
- **"Brand mentions in AI models improved from A/5 to B/5"** (your brand visibility tests)

You cannot guarantee ChatGPT browse or training inclusion — frame it as tested prompt results and technical readiness.

---

## Monthly maintenance (per client, ~15–30 min)

1. Check `/admin` for drift alerts (weekly monitor emails if Resend is on)
2. Re-run **post-delivery scan** if their site changed significantly
3. Re-run brand visibility check and update records
4. Re-approve profile edits if you regenerate content

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Score shows `— → —` | Run baseline: re-scan won't set baseline if missing — use **+ Add Client** flow or link scan manually in Supabase |
| Self-serve client, no baseline | Redeploy app (baseline links on checkout). For existing clients: run scan from admin and set `baseline_scan_id` in Supabase |
| Hostname stuck pending | Client must add CNAME; click **Check status**; see `docs/DEPLOY.md` §7 |
| Profile 404 on `/sites/...` | Profile must be **approved** (status `live`) |
| Deploy panel errors on brand check | Confirm `brand_checks` migration ran with RLS enabled |
| Can't log into `/admin` | Use `/admin/login` → **Forgot password**; or `node scripts/reset-admin-password.mjs '...'`; see `docs/DEPLOY.md` § Admin login |

---

## Quick links

| What | URL |
|------|-----|
| Admin | `/admin` |
| Onboarding (client) | `/onboarding/{clientId}` |
| DNS setup (client) | `/onboarding/dns-setup/{clientId}` |
| Client PDF report | `/print/client/{clientId}` |
| Public scan (sales) | `/` |
| Deploy guide | `docs/DEPLOY.md` |
| Custom billing | `docs/custom-deals-manual.md` |

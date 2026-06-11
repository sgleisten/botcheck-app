# Custom deals — manual workflow (no code)

Use this when you need a one-off price or billing terms before the in-app "Create deal" flow is set up, or for edge cases (annual, net-30) that Stripe Checkout does not cover.

## Option A: Stripe Payment Link + manual client row

Best for: negotiated monthly price, quick close without deploying code.

1. In **Stripe Dashboard → Payment Links**, create a subscription link at the agreed price.
2. In **Supabase → clients**, insert a row:
   - `domain`, `contact_email`, `business_name`
   - `status`: `pending_payment` (until they pay) or `onboarding` (if already paid)
   - `billing_type`: `invoice` or `custom_checkout` (after migration)
3. Send the prospect:
   - Payment Link URL (Stripe)
   - After payment: `{APP_URL}/onboarding/{client_id}` to finish setup
4. They use **First time** on `/login` with the same email as `contact_email`.

Onboarding, profile generation, and admin approve work the same — they only need a valid `client_id`.

## Option B: Stripe Invoice (annual, net-30, setup fees)

Best for: non-standard terms, enterprise, or "pay by invoice."

1. Create the **client row** in Supabase first (`status: pending_payment`, `billing_type: invoice`).
2. In Stripe, create an **Invoice** for that customer; add `client_id` to invoice metadata if using webhooks.
3. When paid (or when you confirm payment), set `clients.status` to `onboarding`.
4. Send onboarding link: `{APP_URL}/onboarding/{client_id}`.

In-app: use **Admin → Mark paid** for invoice clients once payment is confirmed.

## Option C: Comped / beta (no payment)

Best for: friends, beta testers, internal demos.

1. Insert `clients` row with `status: onboarding`, `billing_type: comped`.
2. Send onboarding link directly — no Stripe step.

## Option D: Discount off public price

Best for: small promotions on the standard $299/mo self-serve funnel.

1. Create a **Coupon** in Stripe (e.g. 20% off for 3 months).
2. Either pass `discounts` when creating Checkout in code, or share a Payment Link that includes the coupon.

Public scan → checkout still uses `STRIPE_PRICE_ID_STARTER`; only the discount changes.

## Metadata checklist

For Stripe Checkout or webhooks to activate the client automatically, session metadata must include:

- `client_id` — UUID from `clients.id`

The webhook handler at `/api/webhooks/stripe` sets `status: onboarding` on `checkout.session.completed` when this metadata is present.

## In-app custom deals (preferred)

After billing fields are deployed, use **Admin → Create deal** to:

- Set custom monthly price or Stripe Price ID
- Copy a private checkout link: `{APP_URL}/checkout/{token}`
- Or mark invoice/comped clients without Stripe

See migration `20260612000000_client_billing.sql` and admin dashboard.

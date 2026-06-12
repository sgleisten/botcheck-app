import { randomBytes } from 'node:crypto'
import type Stripe from 'stripe'
import type { BillingType } from '@/lib/billing'

export type { BillingType }

export type ClientBilling = {
  id: string
  domain: string
  contact_email: string | null
  business_name: string | null
  billing_type: BillingType
  stripe_price_id: string | null
  quoted_monthly_cents: number | null
  checkout_token: string | null
  status: string
}

export const STARTER_MONTHLY_CENTS = 29900

export function generateCheckoutToken(): string {
  return randomBytes(24).toString('base64url')
}

function isPlaceholderEnv(value: string | undefined): boolean {
  if (!value?.trim()) return true
  const v = value.trim().toLowerCase()
  return v.startsWith('your-') || v.includes('placeholder') || v === 'changeme'
}

export function getStarterStripePriceId(): string | null {
  const value = process.env.STRIPE_PRICE_ID_STARTER?.trim()
  if (isPlaceholderEnv(value)) return null
  return value ?? null
}

function starterLineItem(domain: string): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    price_data: {
      currency: 'usd',
      product_data: {
        name: `BotCheck — ${domain}`,
        description: 'AI presence profile, hosting, and weekly updates',
      },
      unit_amount: STARTER_MONTHLY_CENTS,
      recurring: { interval: 'month' },
    },
    quantity: 1,
  }
}

export function resolveCheckoutLineItems(
  client: Pick<ClientBilling, 'stripe_price_id' | 'quoted_monthly_cents' | 'domain'>,
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  if (client.stripe_price_id) {
    return [{ price: client.stripe_price_id, quantity: 1 }]
  }

  if (client.quoted_monthly_cents != null && client.quoted_monthly_cents > 0) {
    return [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `BotCheck — ${client.domain}`,
            description: 'AI presence profile, hosting, and weekly updates',
          },
          unit_amount: client.quoted_monthly_cents,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      },
    ]
  }

  const defaultPrice = getStarterStripePriceId()
  if (defaultPrice) return [{ price: defaultPrice, quantity: 1 }]

  return [starterLineItem(client.domain)]
}

export function appBaseUrl(): string {
  const url = process.env.APP_URL?.trim()
  return url && url.length > 0 ? url.replace(/\/+$/, '') : 'http://localhost:3000'
}

export function checkoutUrl(token: string): string {
  return `${appBaseUrl()}/checkout/${token}`
}

export function onboardingUrl(clientId: string): string {
  return `${appBaseUrl()}/onboarding/${clientId}`
}

type CheckoutSessionInput = {
  clientId: string
  domain: string
  email: string
  billing: Pick<ClientBilling, 'billing_type' | 'stripe_price_id' | 'quoted_monthly_cents' | 'domain'>
  scanId?: string
  cancelUrl: string
}

export async function createStripeCheckoutSession(input: CheckoutSessionInput): Promise<string> {
  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const lineItems = resolveCheckoutLineItems(input.billing)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: lineItems,
    customer_email: input.email,
    metadata: {
      client_id: input.clientId,
      domain: input.domain,
      scan_id: input.scanId ?? '',
      billing_type: input.billing.billing_type,
    },
    success_url: `${appBaseUrl()}/onboarding/${input.clientId}`,
    cancel_url: input.cancelUrl,
  })

  if (!session.url) throw new Error('Stripe did not return a checkout URL')
  return session.url
}

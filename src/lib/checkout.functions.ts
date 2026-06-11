import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  type ClientBilling,
  createStripeCheckoutSession,
  onboardingUrl,
} from '@/lib/billing.server'
import { formatMonthlyPrice } from '@/lib/billing'

export const getDealByToken = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ token: z.string().min(8) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select(
        'id, domain, business_name, contact_email, billing_type, stripe_price_id, quoted_monthly_cents, checkout_token, status',
      )
      .eq('checkout_token', data.token)
      .single()

    if (error || !client) throw new Error('This checkout link is invalid or expired.')

    const billing = client as ClientBilling

    if (billing.billing_type === 'comped') {
      throw new Error('This account is already comped. Use the onboarding link instead.')
    }

    if (billing.billing_type === 'invoice') {
      throw new Error('This account is billed by invoice. Contact support to complete payment.')
    }

    if (billing.status !== 'pending_payment') {
      throw new Error('Payment for this account has already been completed.')
    }

    return {
      clientId: billing.id,
      domain: billing.domain,
      businessName: billing.business_name,
      contactEmail: billing.contact_email,
      priceLabel:
        billing.quoted_monthly_cents != null
          ? formatMonthlyPrice(billing.quoted_monthly_cents)
          : billing.stripe_price_id
            ? 'Custom plan'
            : formatMonthlyPrice(null),
      onboardingUrl: onboardingUrl(billing.id),
    }
  })

export const createCheckoutForToken = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        token: z.string().min(8),
        email: z.string().email().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { appBaseUrl } = await import('@/lib/billing.server')

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select(
        'id, domain, contact_email, billing_type, stripe_price_id, quoted_monthly_cents, checkout_token, status',
      )
      .eq('checkout_token', data.token)
      .single()

    if (error || !client) throw new Error('This checkout link is invalid or expired.')

    const billing = client as ClientBilling

    if (billing.billing_type === 'comped' || billing.billing_type === 'invoice') {
      throw new Error('This account cannot use self-serve checkout.')
    }

    if (billing.status !== 'pending_payment') {
      throw new Error('Payment for this account has already been completed.')
    }

    const email = data.email ?? billing.contact_email
    if (!email) throw new Error('Email is required to continue to checkout.')

    if (data.email && data.email !== billing.contact_email) {
      await supabaseAdmin
        .from('clients')
        .update({ contact_email: data.email })
        .eq('id', billing.id)
    }

    const url = await createStripeCheckoutSession({
      clientId: billing.id,
      domain: billing.domain,
      email,
      billing,
      cancelUrl: `${appBaseUrl()}/checkout/${data.token}`,
    })

    return { url }
  })

export const createCheckoutForClientId = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        scanId: z.string().uuid().optional(),
        email: z.string().email(),
        domain: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { appBaseUrl, createStripeCheckoutSession } = await import('@/lib/billing.server')

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('id, domain, billing_type, stripe_price_id, quoted_monthly_cents, status')
      .eq('id', data.clientId)
      .single()

    if (error || !client) throw new Error('Client not found')

    const billing = client as ClientBilling

    if (data.scanId) {
      await supabaseAdmin.from('scans').update({ client_id: billing.id }).eq('id', data.scanId)
    }

    const url = await createStripeCheckoutSession({
      clientId: billing.id,
      domain: data.domain,
      email: data.email,
      billing: { ...billing, domain: data.domain },
      scanId: data.scanId,
      cancelUrl: `${appBaseUrl()}/`,
    })

    return { url }
  })

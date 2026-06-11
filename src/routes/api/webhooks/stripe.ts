import { createFileRoute } from '@tanstack/react-router'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export const Route = createFileRoute('/api/webhooks/stripe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text()
        const signature = request.headers.get('stripe-signature')

        if (!signature) {
          return new Response('Missing stripe-signature header', { status: 400 })
        }

        let event: Stripe.Event
        try {
          event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!,
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          console.error('Stripe webhook signature verification failed:', message)
          return new Response(`Webhook error: ${message}`, { status: 400 })
        }

        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session
            const clientId = session.metadata?.client_id
            if (!clientId) {
              console.error('No client_id in session metadata')
              break
            }
            const { error } = await supabase
              .from('clients')
              .update({
                status: 'onboarding',
                stripe_customer_id: session.customer as string,
                stripe_subscription_id: session.subscription as string,
              })
              .eq('id', clientId)
            if (error) {
              console.error('Failed to update client on checkout.session.completed:', error)
              return new Response('Database error', { status: 500 })
            }
            break
          }

          case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription
            const { error } = await supabase
              .from('clients')
              .update({ status: 'cancelled' })
              .eq('stripe_customer_id', subscription.customer as string)
            if (error) {
              console.error('Failed to cancel client on customer.subscription.deleted:', error)
              return new Response('Database error', { status: 500 })
            }
            break
          }

          case 'invoice.payment_failed': {
            const invoice = event.data.object as Stripe.Invoice
            console.error('Payment failed for customer:', invoice.customer, {
              invoice_id: invoice.id,
              amount_due: invoice.amount_due,
              attempt_count: invoice.attempt_count,
            })
            break
          }

          default:
            console.log('Unhandled Stripe event type:', event.type)
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})

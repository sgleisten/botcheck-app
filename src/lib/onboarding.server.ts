import { createServerFn } from '@tanstack/react-start'
import { useSession } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { userSessionConfig } from './auth.functions'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export const getOnboardingData = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const session = await useSession<{ userId?: string }>(userSessionConfig())
    if (!session.data.userId) {
      throw redirect({ to: '/login', search: { redirectTo: `/onboarding/${data.clientId}` } })
    }

    const { data: client, error } = await supabaseAdmin
      .from('clients')
      .select('id, domain, business_name, user_id, status')
      .eq('id', data.clientId)
      .single()

    if (error || !client) throw redirect({ to: '/login' })
    // Ensure the logged-in user owns this client record
    if (client.user_id !== session.data.userId) throw redirect({ to: '/login' })

    // Load crawl data from the most recent profile for this client (may not exist yet)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('crawl_data')
      .eq('client_id', data.clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      client: client as {
        id: string
        domain: string
        business_name: string | null
        user_id: string
        status: string
      },
      crawlData: (profile?.crawl_data ?? {}) as { [key: string]: JsonValue },
    }
  })

import { createServerFn } from '@tanstack/react-start'
import Anthropic from '@anthropic-ai/sdk'
import { useSession } from '@tanstack/react-start/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { redirectToLogin, userSessionConfig } from './auth.functions'
import {
  buildSiteScanFromRow,
  formatSiteScanForPrompt,
  type JsonValue,
  type SiteScan,
} from './site-scan'

let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

const ONBOARDING_INSTRUCTIONS = `\
You are an AI presence specialist helping a small business owner set up their AI presence files \
(llms.txt, tools.json, robots.txt). You already ran a free Agent Readiness Scan on their website \
and have the findings below.

Your job is to confirm what you found and collect exactly these six pieces of information:

1. Current pricing for their main services (confirm what you found or ask for correction)
2. Confirmed booking/contact link — provide the actual URL you found and ask them to confirm
3. How they want AI to describe them in one sentence (their brand voice/positioning)
4. Anything they don't want AI to say about their business
5. Which AI crawlers should get full access (default: all crawlers)
6. Confirmed business hours and phone number per location

Be conversational and warm. Reference the scan findings to confirm details rather than asking \
from scratch. Work through the six items systematically — don't ask for everything at once. \
Never say "crawl data" — refer to it as "what we found on your website" or "your scan results".

When you have confirmed all six items with the user, end your response with exactly: \
READY_TO_GENERATE`

const GENERATION_SYSTEM = `\
You are an AI presence file generator. Given website scan findings and confirmed business details, \
you generate three files in a single response:

1. llms.txt — follows the llms.txt standard (plain text, markdown headings, concise factual \
   description of the business, its services, pricing, hours, contact info, and instructions \
   for AI systems)
2. tools.json — a JSON array of tool definitions describing the business's bookable services, \
   APIs, or interactive features that AI assistants can use on behalf of users
3. robots_txt_additions — lines to APPEND to an existing robots.txt (never a full replacement); \
   controls AI crawler access per the client's preferences

Respond with valid JSON only — no markdown fences, no prose. The JSON must have exactly \
these three top-level keys: "llms_txt", "tools_json", "robots_txt_additions". \
"tools_json" must be a JSON array (not a string). "llms_txt" and "robots_txt_additions" \
must be strings.`

type OnboardingClient = {
  id: string
  domain: string
  business_name: string | null
  user_id: string | null
  status: string
  contact_email: string | null
}

async function loadSiteScanForClient(clientId: string, domain: string): Promise<SiteScan | null> {
  const { data: byClient } = await supabaseAdmin
    .from('scans')
    .select('url, ars_score, categories, top_failures, quick_wins')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const fromClient = buildSiteScanFromRow(byClient)
  if (fromClient) return fromClient

  const normalizedDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')

  const { data: byDomain } = await supabaseAdmin
    .from('scans')
    .select('url, ars_score, categories, top_failures, quick_wins')
    .ilike('url', `%${normalizedDomain}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return buildSiteScanFromRow(byDomain)
}

async function assertOnboardingAccess(
  clientId: string,
  returnPath?: string,
): Promise<{ userId: string; client: OnboardingClient }> {
  const session = await useSession<{ userId?: string }>(userSessionConfig())
  const loginPath = returnPath ?? `/onboarding/${clientId}`

  if (!session.data.userId) {
    redirectToLogin(loginPath)
  }

  const userId = session.data.userId!

  const { data: client, error } = await supabaseAdmin
    .from('clients')
    .select('id, domain, business_name, user_id, status, contact_email')
    .eq('id', clientId)
    .single()

  if (error || !client) {
    throw new Error('Client not found')
  }

  if (client.user_id === null) {
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (authError || !authUser.user) {
      throw new Error('Could not verify your account')
    }

    const userEmail = authUser.user.email?.toLowerCase()
    const checkoutEmail = client.contact_email?.toLowerCase()

    if (checkoutEmail && userEmail && checkoutEmail !== userEmail) {
      throw new Error('Sign in with the email address from your checkout receipt.')
    }

    await supabaseAdmin.from('clients').update({ user_id: userId }).eq('id', clientId)
    client.user_id = userId
  } else if (client.user_id !== userId) {
    throw new Error('You do not have access to this onboarding session.')
  }

  return { userId, client }
}

export const runOnboardingChat = createServerFn({ method: 'POST' })
  .validator((input: {
    clientId: string
    messages: { role: 'user' | 'assistant'; content: string }[]
    siteScan: SiteScan
  }) => input)
  .handler(async ({ data }) => {
    await assertOnboardingAccess(data.clientId)

    const { messages, siteScan } = data

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: ONBOARDING_INSTRUCTIONS,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: `Website scan findings:\n${formatSiteScanForPrompt(siteScan)}`,
        },
      ],
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    )
    if (!textBlock) throw new Error('No text response from Claude')

    return { message: textBlock.text }
  })

export const generateProfile = createServerFn({ method: 'POST' })
  .validator((input: {
    clientId: string
    siteScan: SiteScan
    questionnaireAnswers: string
  }) => input)
  .handler(async ({ data }) => {
    await assertOnboardingAccess(data.clientId)

    const { clientId, siteScan, questionnaireAnswers } = data

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, status')
      .eq('client_id', clientId)
      .in('status', ['pending_review', 'live'])
      .maybeSingle()

    if (existingProfile) {
      throw new Error(
        existingProfile.status === 'live'
          ? 'Your profile is already live.'
          : 'Your profile is already submitted for review.',
      )
    }

    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: GENERATION_SYSTEM,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Generate the three AI presence files for this business.

Website scan findings:
${formatSiteScanForPrompt(siteScan)}

Confirmed details from onboarding questionnaire:
${questionnaireAnswers}`,
        },
      ],
    })

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    )
    if (!textBlock) throw new Error('No text response from Claude')

    const raw = textBlock.text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let parsed: {
      llms_txt: string
      tools_json: { [key: string]: JsonValue }[]
      robots_txt_additions: string
    }

    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`)
    }

    const { llms_txt, tools_json, robots_txt_additions } = parsed

    const { data: inserted, error } = await supabaseAdmin
      .from('profiles')
      .insert({
        client_id: clientId,
        status: 'pending_review',
        llms_txt,
        tools_json,
        robots_txt_additions,
        crawl_data: siteScan as unknown as { [key: string]: JsonValue },
        questionnaire_answers: { raw: questionnaireAnswers },
        generated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error || !inserted) throw new Error(`Failed to store profile: ${error?.message ?? 'unknown'}`)

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('domain, business_name')
      .eq('id', clientId)
      .single()

    try {
      const { sendProfileReviewEmail } = await import('./email.server')
      await sendProfileReviewEmail({
        profileId: inserted.id,
        clientId,
        domain: client?.domain ?? siteScan.url,
        businessName: client?.business_name ?? null,
      })
    } catch (err) {
      console.error('[email] Profile review notification error:', err)
    }

    return { profileId: inserted.id, llms_txt, tools_json, robots_txt_additions }
  })

export const getOnboardingData = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const returnPath = `/onboarding/${data.clientId}`
    const { client } = await assertOnboardingAccess(data.clientId, returnPath)
    const siteScan = await loadSiteScanForClient(data.clientId, client.domain)

    return {
      client: client as {
        id: string
        domain: string
        business_name: string | null
        user_id: string
        status: string
      },
      siteScan,
    }
  })

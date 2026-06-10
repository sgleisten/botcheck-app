import { createServerFn } from '@tanstack/react-start'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Stable portion of the onboarding system prompt — cached across turns
const ONBOARDING_INSTRUCTIONS = `\
You are an AI presence specialist helping a small business owner set up their AI presence files \
(llms.txt, tools.json, robots.txt). You have already crawled their website and have the crawl \
data below.

Your job is to confirm what you found and collect exactly these six pieces of information:

1. Current pricing for their main services (confirm what you found or ask for correction)
2. Confirmed booking/contact link — provide the actual URL you found and ask them to confirm
3. How they want AI to describe them in one sentence (their brand voice/positioning)
4. Anything they don't want AI to say about their business
5. Which AI crawlers should get full access (default: all crawlers)
6. Confirmed business hours and phone number per location

Be conversational and warm. Reference the crawl data to confirm details rather than asking \
from scratch. Work through the six items systematically — don't ask for everything at once.

When you have confirmed all six items with the user, end your response with exactly: \
READY_TO_GENERATE`

// Generation system prompt — stable, will cache well across calls
const GENERATION_SYSTEM = `\
You are an AI presence file generator. Given crawl data and confirmed business details, \
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

export const runOnboardingChat = createServerFn({ method: 'POST' })
  .validator((input: {
    clientId: string
    messages: { role: 'user' | 'assistant'; content: string }[]
    crawlData: object
  }) => input)
  .handler(async ({ data }) => {
    const { messages, crawlData } = data

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        // Cache the stable instructions — not the crawl data, which varies per client
        {
          type: 'text',
          text: ONBOARDING_INSTRUCTIONS,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: `Crawl data from their website:\n${JSON.stringify(crawlData, null, 2)}`,
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
    crawlData: object
    questionnaireAnswers: string
  }) => input)
  .handler(async ({ data }) => {
    const { clientId, crawlData, questionnaireAnswers } = data

    const response = await anthropic.messages.create({
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

Crawl data:
${JSON.stringify(crawlData, null, 2)}

Confirmed details from onboarding questionnaire:
${questionnaireAnswers}`,
        },
      ],
    })

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    )
    if (!textBlock) throw new Error('No text response from Claude')

    // Strip markdown fences if Claude wrapped the JSON anyway
    const raw = textBlock.text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let parsed: {
      llms_txt: string
      tools_json: unknown[]
      robots_txt_additions: string
    }

    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`)
    }

    const { llms_txt, tools_json, robots_txt_additions } = parsed

    const { error } = await supabase.from('profiles').insert({
      client_id: clientId,
      status: 'pending_review',
      llms_txt,
      tools_json,
      robots_txt_additions,
      crawl_data: crawlData,
      questionnaire_answers: { raw: questionnaireAnswers },
      generated_at: new Date().toISOString(),
    })

    if (error) throw new Error(`Failed to store profile: ${error.message}`)

    return { llms_txt, tools_json, robots_txt_additions }
  })

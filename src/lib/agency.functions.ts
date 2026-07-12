import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const agencyLeadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  agency: z.string().trim().min(1).max(200),
  clients: z.string().trim().max(200).optional().default(''),
  website: z.string().trim().max(2048).optional().default(''),
})

export const submitAgencyLead = createServerFn({ method: 'POST' })
  .validator((input: unknown) => agencyLeadSchema.parse(input))
  .handler(async ({ data }) => {
    const { sendAgencyLeadEmail } = await import('@/lib/email.server')
    await sendAgencyLeadEmail(data)
    return { ok: true }
  })

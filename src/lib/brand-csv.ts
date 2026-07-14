export type BrandCsvRow = {
  model: string
  provider: string | null
  prompt: string
  mentioned: boolean
  excerpt: string | null
  response: string | null
}

/** Parse CSV from Cloudflare ai-brand-visibility-template (both export formats). */
export function parseBrandVisibilityCsv(content: string): BrandCsvRow[] {
  const lines = content.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim())
  const modelIdx = header.indexOf('model')
  const providerIdx = header.indexOf('provider')
  const promptIdx = header.indexOf('prompt')
  const mentionedIdx = header.indexOf('mentioned')
  const excerptIdx = header.indexOf('excerpt')
  const responseIdx = header.indexOf('response')

  if (modelIdx < 0 || promptIdx < 0 || mentionedIdx < 0) {
    throw new Error('CSV must include Model, Prompt, and Mentioned columns.')
  }

  const rows: BrandCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCsvLine(line)
    const model = (cols[modelIdx] ?? '').trim()
    const prompt = (cols[promptIdx] ?? '').trim()
    if (!model || !prompt) continue

    rows.push({
      model,
      provider: providerIdx >= 0 ? (cols[providerIdx] ?? '').trim() || null : null,
      prompt,
      mentioned: parseMentioned(cols[mentionedIdx] ?? ''),
      excerpt: excerptIdx >= 0 ? (cols[excerptIdx] ?? '').trim() || null : null,
      response: responseIdx >= 0 ? (cols[responseIdx] ?? '').trim() || null : null,
    })
  }
  return rows
}

function parseMentioned(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === 'yes' || v === 'true' || v === '1' || v === 'y'
}

/** Minimal RFC 4180 CSV line parser (handles quoted fields). */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function summarizeBrandCsvRows(rows: BrandCsvRow[]): {
  rowCount: number
  mentionCount: number
} {
  const models = new Map<string, boolean>()
  for (const r of rows) {
    models.set(r.model, (models.get(r.model) ?? false) || r.mentioned)
  }
  let mentionCount = 0
  for (const mentioned of models.values()) if (mentioned) mentionCount++
  return { rowCount: rows.length, mentionCount }
}

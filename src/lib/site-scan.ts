type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type SiteScanCategory = { score: number; finding: string }

export type SiteScan = {
  url: string
  arsScore: number
  categories: {
    booking: SiteScanCategory
    pricing: SiteScanCategory
    information: SiteScanCategory
    navigation: SiteScanCategory
  }
  topIssues: string[]
  quickWins: string[]
  pages?: { url: string; markdown: string }[]
}

type ScanRow = {
  url: string
  ars_score: number | null
  categories: SiteScan['categories'] | null
  top_failures: string[] | null
  quick_wins: string[] | null
  site_snapshot?: { pages?: { url: string; markdown: string }[] } | null
}

const EMPTY_CATEGORY: SiteScanCategory = { score: 0, finding: 'Not yet analyzed.' }

export function buildSiteScanFromRow(row: ScanRow | null | undefined): SiteScan | null {
  if (!row?.url || row.ars_score == null || !row.categories) return null

  return {
    url: row.url,
    arsScore: row.ars_score,
    categories: {
      booking: row.categories.booking ?? EMPTY_CATEGORY,
      pricing: row.categories.pricing ?? EMPTY_CATEGORY,
      information: row.categories.information ?? EMPTY_CATEGORY,
      navigation: row.categories.navigation ?? EMPTY_CATEGORY,
    },
    topIssues: row.top_failures ?? [],
    quickWins: row.quick_wins ?? [],
    pages: row.site_snapshot?.pages,
  }
}

/** Format site scan for Claude — never exposed to the user as "crawl data". */
export function formatSiteScanForPrompt(siteScan: SiteScan): string {
  const lines = [
    `Website: ${siteScan.url}`,
    `Agent Readiness Score: ${siteScan.arsScore}/100`,
    '',
    'Category findings (plain English):',
    ...Object.entries(siteScan.categories).map(
      ([key, cat]) => `- ${key}: ${cat.score}/25 — ${cat.finding}`,
    ),
    '',
    'Top issues:',
    ...siteScan.topIssues.map((issue) => `- ${issue}`),
    '',
    'Quick wins:',
    ...siteScan.quickWins.map((win) => `- ${win}`),
  ]

  if (siteScan.pages?.length) {
    lines.push('', 'Page content from the scan:')
    for (const page of siteScan.pages) {
      lines.push(
        '',
        `=== ${page.url} ===`,
        page.markdown.slice(0, 8000),
      )
    }
  }

  return lines.join('\n')
}

export function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-600'
  if (score >= 40) return 'text-yellow-600'
  return 'text-red-600'
}

export const CATEGORY_LABELS: Record<keyof SiteScan['categories'], string> = {
  booking: 'Booking & Contact',
  pricing: 'Pricing Clarity',
  information: 'Business Information',
  navigation: 'Agent Navigation',
}

/** Friendly question titles for category score cards. */
export const CATEGORY_QUESTIONS: Record<keyof SiteScan['categories'], string> = {
  booking: 'Can robots book you?',
  pricing: 'Can robots find your pricing?',
  information: 'Can robots learn about your business?',
  navigation: 'Can robots navigate your site?',
}

export function scoreHeadline(score: number): string {
  if (score >= 70) return 'Robots can mostly find your business'
  if (score >= 40) return 'Robots are struggling to find your business'
  return 'Robots are getting lost on your site'
}

export function categoryBarColor(score: number): string {
  if (score >= 20) return 'bg-green'
  if (score >= 12) return 'bg-orange'
  return 'bg-coral'
}

export function categoryDotColor(score: number): string {
  if (score >= 20) return 'bg-green'
  if (score >= 12) return 'bg-orange'
  return 'bg-coral'
}

/** Actionable follow-ups from a post-delivery scan for agency workspace + client report. */

export type ScanImprovementInput = {
  topFailures: string[]
  quickWins: string[]
  categories: Array<{ key: string; label: string; score: number | null; finding: string | null }>
  siteReadiness: number | null
  discoverabilityScore: number | null
}

export type ScanImprovement = { issue: string; howTo: string }

const CATEGORY_HOW_TO: Record<string, string> = {
  booking:
    'Add plain-text booking paths and contact forms on the homepage or a linked /join or /contact page. Use the accessibility pack for play-button CTAs that need on-page summaries.',
  pricing:
    'Put pricing in visible HTML on the homepage or a pricing/join page — not only in JS widgets or behind a click.',
  information:
    'Ensure business name, location, hours, and services appear in crawlable text; keep llms.txt aligned with the live site.',
  navigation:
    'Link key pages from the homepage with clear headings; avoid login walls on pages agents need to read.',
}

function defaultHowTo(failure: string, hostingAccess: boolean): string {
  const lower = failure.toLowerCase()
  if (lower.includes('llms') || lower.includes('tools.json') || lower.includes('discover')) {
    return hostingAccess
      ? 'Paste llms.txt, tools.json, robots Content-Signal, JSON-LD, and api-catalog on the root domain using the workspace copy-paste pack.'
      : 'Deploy discovery files on the main domain root (not only ai.*) when hosting access is available.'
  }
  if (lower.includes('price') || lower.includes('pricing')) {
    return CATEGORY_HOW_TO.pricing
  }
  if (lower.includes('book') || lower.includes('contact') || lower.includes('form')) {
    return CATEGORY_HOW_TO.booking
  }
  if (lower.includes('video') || lower.includes('alt') || lower.includes('image')) {
    return 'Run “Generate suggestions” in Images & video — copy suggested alt text and video summaries into the CMS.'
  }
  return 'Fix in crawlable HTML on the main site, then re-run the post-delivery scan to verify.'
}

/** Remaining gaps after delivery and concrete next steps for the agency. */
export function buildPostDeliveryImprovements(
  scan: ScanImprovementInput,
  opts?: { hostingAccess?: boolean },
): ScanImprovement[] {
  const hostingAccess = opts?.hostingAccess ?? false
  const out: ScanImprovement[] = []
  const seen = new Set<string>()

  const add = (issue: string, howTo: string) => {
    const key = `${issue}::${howTo}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ issue, howTo })
  }

  for (let i = 0; i < scan.topFailures.length; i++) {
    add(scan.topFailures[i], scan.quickWins[i] ?? defaultHowTo(scan.topFailures[i], hostingAccess))
  }

  for (const win of scan.quickWins) {
    if (!out.some((o) => o.howTo === win)) {
      add('Additional opportunity', win)
    }
  }

  for (const cat of scan.categories) {
    if (cat.score != null && cat.score < 20 && cat.finding) {
      add(
        `${cat.label} (${cat.score}/25): ${cat.finding}`,
        CATEGORY_HOW_TO[cat.key] ?? 'Address the finding in crawlable HTML, then re-run post-delivery scan.',
      )
    }
  }

  if (scan.discoverabilityScore != null && scan.discoverabilityScore < 100) {
    add(
      'AI discoverability not maxed on the main domain',
      hostingAccess
        ? 'Use the “Paste onto their site” checklist: root llms.txt, tools.json, robots Content-Signal, Link header, and /.well-known/api-catalog.'
        : 'Main-domain root files move ARS discoverability — add them when the client grants hosting access (ai.* alone does not max this score).',
    )
  }

  if (scan.siteReadiness != null && scan.siteReadiness < 70 && out.length === 0) {
    add(
      'Site readiness still below 70',
      'Review category scores above, apply copy-paste content fixes on the live site, and re-run post-delivery scan.',
    )
  }

  return out.slice(0, 12)
}

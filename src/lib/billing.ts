export function formatMonthlyPrice(cents: number | null | undefined): string {
  if (cents == null) return '$299/mo'
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}/mo`
}

export type BillingType = 'standard' | 'custom_checkout' | 'invoice' | 'comped'

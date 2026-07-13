import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Link a funnel scan as the client's baseline (before score) if one isn't set yet.
 * Also ensures scans.client_id points at this client.
 */
export async function ensureBaselineScan(
  supabase: SupabaseClient,
  clientId: string,
  scanId?: string | null,
): Promise<void> {
  const { data: client } = await supabase
    .from('clients')
    .select('baseline_scan_id')
    .eq('id', clientId)
    .maybeSingle()

  if (client?.baseline_scan_id) return

  let resolvedScanId = scanId?.trim() || null

  if (!resolvedScanId) {
    const { data: scan } = await supabase
      .from('scans')
      .select('id')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    resolvedScanId = (scan?.id as string | undefined) ?? null
  }

  if (!resolvedScanId) return

  await supabase.from('scans').update({ client_id: clientId }).eq('id', resolvedScanId)

  await supabase
    .from('clients')
    .update({ baseline_scan_id: resolvedScanId, scan_id: resolvedScanId })
    .eq('id', clientId)
}

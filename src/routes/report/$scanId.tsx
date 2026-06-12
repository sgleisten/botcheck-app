import { createFileRoute, notFound } from '@tanstack/react-router'
import { useState } from 'react'
import {
  getScanById,
  saveEmail,
  createCheckoutSession,
} from '@/lib/scan.functions'
import { ScanResultsView } from '@/components/scan/ScanResultsView'

export const Route = createFileRoute('/report/$scanId')({
  loader: ({ params }) => getScanById({ data: { scanId: params.scanId } }),
  component: ReportPage,
})

function ReportPage() {
  const scan = Route.useLoaderData()
  if (!scan) throw notFound()

  const [email, setEmail] = useState(scan.email ?? '')
  const [reportUnlocked, setReportUnlocked] = useState(Boolean(scan.email))
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  async function handleUnlockReport(e: React.FormEvent) {
    e.preventDefault()
    setUnlockLoading(true)
    setUnlockError(null)
    try {
      await saveEmail({ data: { scanId: scan.id, email } })
      setReportUnlocked(true)
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Could not save your email. Please try again.')
    } finally {
      setUnlockLoading(false)
    }
  }

  async function handleCheckout() {
    if (!reportUnlocked) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const { url: checkoutUrl } = await createCheckoutSession({
        data: { scanId: scan.id, email, domain: scan.url },
      })
      window.location.href = checkoutUrl
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout failed. Please try again.')
      setCheckoutLoading(false)
    }
  }

  return (
    <ScanResultsView
      result={scan}
      email={email}
      setEmail={setEmail}
      reportUnlocked={reportUnlocked}
      unlockLoading={unlockLoading}
      unlockError={unlockError}
      onUnlockReport={handleUnlockReport}
      checkoutLoading={checkoutLoading}
      checkoutError={checkoutError}
      onCheckout={handleCheckout}
    />
  )
}

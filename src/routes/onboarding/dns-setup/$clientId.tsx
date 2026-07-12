import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDnsSetupData,
  checkCustomHostnameStatus,
  type DnsSetupData,
  type HostnameStatus,
} from '@/lib/dns.functions'
import { SiteHeader } from '@/components/ui/SiteHeader'
import { SiteFooter } from '@/components/ui/SiteFooter'

export const Route = createFileRoute('/onboarding/dns-setup/$clientId')({
  loader: async ({ params }) => getDnsSetupData({ data: { clientId: params.clientId } }),
  component: DnsSetupPage,
})

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.15em] text-[#2D6E7E]/70 mb-1.5">
        {label}
      </div>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 break-all bg-[#FBF3DC] border-4 border-[#1F4E5A] rounded-lg px-3 py-2.5 text-sm font-mono text-[#1F4E5A]">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="shrink-0 px-4 rounded-lg font-extrabold text-sm border-4 bg-[#2D6E7E] text-[#FBF3DC] border-[#1F4E5A] hover:-translate-y-[1px] transition"
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
    </div>
  )
}

function DnsSetupPage() {
  const initial = Route.useLoaderData() as DnsSetupData
  const { clientId } = Route.useParams()

  const [status, setStatus] = useState<HostnameStatus>(initial.hostnameStatus)
  const [hostnameError, setHostnameError] = useState<string | null>(initial.hostnameError)
  const [checking, setChecking] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const statusRef = useRef(status)
  statusRef.current = status

  const runCheck = useCallback(async () => {
    if (statusRef.current === 'active' || statusRef.current === 'not_setup' || checking) return
    setChecking(true)
    setError(null)
    try {
      const result = await checkCustomHostnameStatus({ data: { clientId } })
      setLastCheckedAt(Date.now())
      setStatus(result.status)
      setHostnameError(result.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed. Please try again.')
    } finally {
      setChecking(false)
    }
  }, [checking, clientId])

  // Auto-check every 30s until active (only while there's a pending hostname).
  useEffect(() => {
    if (status !== 'pending' && status !== 'error') return
    const id = setInterval(() => {
      void runCheck()
    }, 30000)
    return () => clearInterval(id)
  }, [status, runCheck])

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF3DC]">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
          {status === 'active' ? (
            <div className="bg-[#FFFDF5] border-4 border-[#1F4E5A] p-8 sm:p-10 shadow-[8px_8px_0_0_#1F4E5A] text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#8FD89E] border-4 border-[#1F4E5A] text-3xl font-black mb-5">
                ✓
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1F4E5A]">
                You're live!
              </h1>
              <p className="mt-4 text-[#1F4E5A] leading-relaxed">
                AI agents can now read your business profile at{' '}
                <span className="font-mono break-all">{initial.customHostname}/llms.txt</span>. We'll
                keep it updated automatically as your site changes.
              </p>
              {initial.customHostname && (
                <a
                  href={`https://${initial.customHostname}/llms.txt`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-8 h-12 px-6 leading-[2.6rem] rounded-lg font-extrabold text-sm tracking-tight border-4 bg-[#E89B4A] text-[#1F4E5A] border-[#1F4E5A] hover:-translate-y-[1px] transition"
                >
                  VIEW MY PROFILE →
                </a>
              )}
            </div>
          ) : status === 'not_setup' ? (
            <div className="bg-[#FFFDF5] border-4 border-[#1F4E5A] p-8 sm:p-10 shadow-[8px_8px_0_0_#1F4E5A] text-center">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#1F4E5A]">
                We're setting up your custom domain
              </h1>
              <p className="mt-4 text-[#1F4E5A]/80 leading-relaxed">
                Your AI profile subdomain is being provisioned on our end. This page will show your
                setup steps as soon as it's ready — check back shortly, or we'll email you.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-[#2D6E7E]/70 mb-4">
                Last step
              </p>
              <h1 className="font-black tracking-tight text-[#1F4E5A] leading-[1.05] text-3xl sm:text-4xl">
                Point your subdomain at your AI profile
              </h1>
              <p className="mt-4 text-[#1F4E5A]/80 leading-relaxed">
                Add this CNAME record at your domain provider so your profile is served securely at{' '}
                <span className="font-mono font-bold">{initial.customHostname}</span>. We handle the
                SSL certificate automatically once the record is live — it usually takes a few
                minutes.
              </p>

              <div className="mt-8 bg-[#FFFDF5] border-4 border-[#1F4E5A] p-6 shadow-[6px_6px_0_0_#1F4E5A] space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-x-6 items-start">
                  <div className="text-xs font-bold uppercase tracking-[0.15em] text-[#2D6E7E]/70 sm:pt-2.5">
                    Type
                  </div>
                  <code className="bg-[#FBF3DC] border-4 border-[#1F4E5A] rounded-lg px-3 py-2.5 text-sm font-mono text-[#1F4E5A]">
                    CNAME
                  </code>
                </div>
                {initial.cname && (
                  <>
                    <CopyField label="Name / Host" value={initial.cname.name} />
                    <CopyField label="Value / Target" value={initial.cname.target} />
                    <p className="text-sm text-[#1F4E5A]/70 leading-relaxed">
                      Some providers ask for the full subdomain as the Name — in that case use{' '}
                      <span className="font-mono break-all">{initial.cname.fullHost}</span>.
                    </p>
                  </>
                )}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
                <button
                  type="button"
                  onClick={() => void runCheck()}
                  disabled={checking}
                  className="h-14 px-7 rounded-lg font-extrabold text-base tracking-tight border-4 bg-[#2D6E7E] text-[#FBF3DC] border-[#1F4E5A] hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_0_#1F4E5A] transition disabled:opacity-60"
                >
                  {checking ? 'CHECKING…' : 'CHECK STATUS'}
                </button>
                <p className="text-sm text-[#1F4E5A]/60">
                  We re-check automatically every 30 seconds.
                </p>
              </div>

              {status === 'error' && !checking && (
                <p className="mt-4 text-sm font-bold text-[#D85A4A]">
                  {hostnameError
                    ? `We hit a problem verifying your domain: ${hostnameError}`
                    : 'We couldn’t verify your domain yet. Double-check the CNAME record above — a typo or missing record is the usual cause.'}
                </p>
              )}
              {status === 'pending' && lastCheckedAt && !error && (
                <p className="mt-4 text-sm text-[#1F4E5A]/50">
                  Not live yet — DNS can take a few minutes to propagate. Leave this page open and
                  we'll keep checking.
                </p>
              )}
              {error && (
                <p className="mt-4 text-sm font-bold text-[#D85A4A]" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

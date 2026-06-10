import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { getAdminData, approveProfile, adminLogout } from '@/lib/admin.functions'

export const Route = createFileRoute('/admin/')({
  loader: () => getAdminData(),
  component: AdminDashboard,
})

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AdminDashboard() {
  const router = useRouter()
  const { pendingProfiles, clients, recentScans } = Route.useLoaderData()

  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [approving, setApproving] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)

  async function handleApprove(profileId: string) {
    setApproving(profileId)
    setApproveError(null)
    try {
      await approveProfile({ data: { profileId } })
      setApproved((prev) => new Set([...prev, profileId]))
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setApproving(null)
    }
  }

  async function handleLogout() {
    await adminLogout()
    await router.navigate({ to: '/admin/login' })
  }

  const pendingVisible = pendingProfiles.filter((p) => !approved.has(p.id))

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-800"
        >
          Sign out
        </button>
      </div>

      {/* Pending profiles */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Pending Review ({pendingVisible.length})
        </h2>

        {approveError && (
          <p className="text-sm text-red-600 mb-2">{approveError}</p>
        )}

        {pendingVisible.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing pending.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Domain</th>
                  <th className="px-4 py-2 text-left">Business</th>
                  <th className="px-4 py-2 text-left">Generated</th>
                  <th className="px-4 py-2 text-left">Profile ID</th>
                  <th className="px-4 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingVisible.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">
                      {p.clients?.domain ?? p.client_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {p.clients?.business_name ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{fmt(p.generated_at)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-400">
                      {p.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleApprove(p.id)}
                        disabled={approving === p.id}
                        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {approving === p.id ? 'Approving…' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Clients */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Clients ({clients.length})
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Domain</th>
                <th className="px-4 py-2 text-left">Business</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-gray-400">
                    No clients yet.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{c.domain}</td>
                    <td className="px-4 py-2 text-gray-600">{c.business_name ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : c.status === 'onboarding'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{fmt(c.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent scans */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Recent Scans ({recentScans.length})
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">URL</th>
                <th className="px-4 py-2 text-left">ARS</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Scanned</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentScans.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-gray-400">
                    No scans yet.
                  </td>
                </tr>
              ) : (
                recentScans.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 max-w-xs truncate text-gray-700">{s.url}</td>
                    <td className="px-4 py-2 font-semibold">
                      {s.ars_score != null ? (
                        <span
                          className={
                            s.ars_score >= 80
                              ? 'text-green-600'
                              : s.ars_score >= 50
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }
                        >
                          {s.ars_score}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{s.email ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{fmt(s.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

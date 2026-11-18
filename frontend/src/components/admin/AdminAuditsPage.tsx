'use client'
import { useCallback, useEffect, useState } from 'react'
import { Search, ClipboardList } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { adminApi } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

/* What GET /admin-panel/audits/ returns per row (AuditLogSerializer). */
type AuditRow = {
  id: string; user_email: string; user_name: string; action: string
  document_id: string; resource: string; ip_address: string | null; is_flagged: boolean; created_at: string
}
type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }

const PAGE_SIZE = 20
// AuditLog.Action choices
const ACTIONS: Array<[string, string]> = [
  ['login', 'Sign-in'], ['login_failed', 'Failed sign-in'], ['logout', 'Sign-out'], ['upload', 'Upload'], ['download', 'Download'],
  ['delete', 'Deletion'], ['view', 'View'], ['search', 'Search'], ['share', 'Sharing'], ['settings', 'Settings'],
]
const actionLabel = (a: string) => ACTIONS.find(x => x[0] === a)?.[1] ?? a

export default function AdminAuditsPage() {
  const [q, setQ]             = useState('')
  const [search, setSearch]   = useState('')
  const [action, setAction]   = useState('')
  const [flagged, setFlagged] = useState(false)
  const [page, setPage]       = useState(1)
  const [data, setData]       = useState<Page<AuditRow> | null>(null)
  const [failed, setFailed]   = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(() => {
    const params: Record<string, unknown> = { page }
    if (search) params.search = search
    if (action) params.action = action
    if (flagged) params.is_flagged = true
    setLoading(true)
    adminApi.audits(params)
      .then(r => { setData(r.data); setFailed(false) })
      .catch(e => {
        if (e?.response?.status === 404 && page > 1) { setPage(1); return }
        setFailed(true)
      })
      .finally(() => setLoading(false))
  }, [page, search, action, flagged])

  useEffect(() => { load() }, [load])

  const rows = data?.results ?? []
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1
  const filtered = !!(search || action || flagged)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every recorded sign-in, upload, download, view, share and settings change, newest first."
        actions={<Button variant="ghost" size="sm" onClick={load} loading={loading}>Refresh</Button>}
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ECEAE4] p-3">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search the audit log</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A877F]" strokeWidth={1.75} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by user, IP address or resource" className="field h-9 pl-9" />
          </label>
          <select value={action} onChange={e => { setAction(e.target.value); setPage(1) }} className="field h-9 w-auto pr-8" aria-label="Filter by action">
            <option value="">All actions</option>
            {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-[8px] border border-[#DDD9D0] bg-white px-3 text-[13.5px] text-[#2B2924] hover:border-[#BDB8AC]">
            <input type="checkbox" checked={flagged} onChange={e => { setFlagged(e.target.checked); setPage(1) }} className="accent-[#B91C1C]" />
            Flagged only
          </label>
        </div>

        {failed && !data ? (
          <EmptyState icon={<ClipboardList />} title="Couldn't load the audit log" action={<Button variant="ghost" size="sm" onClick={load}>Try again</Button>}>
            The admin API didn't respond. Check that the backend is running.
          </EmptyState>
        ) : !data ? (
          <div className="space-y-2 p-5">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div>
        ) : !rows.length ? (
          <EmptyState icon={<ClipboardList />} title={filtered ? 'No entries match' : 'The audit log is empty'}>
            {filtered ? 'Try a different search or clear the filters.' : 'Entries are recorded as people use Avora.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[14px]">
              <thead>
                <tr className="text-[12.5px] text-[#8A877F]">
                  <th className="px-5 py-2.5 font-normal">Action</th>
                  <th className="px-3 py-2.5 font-normal">Resource</th>
                  <th className="px-3 py-2.5 font-normal">User</th>
                  <th className="px-3 py-2.5 font-normal">IP address</th>
                  <th className="px-3 py-2.5 font-normal">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(e => {
                  const who = e.user_name && e.user_name !== '—' ? e.user_name : ''
                  const email = e.user_email && e.user_email !== '—' ? e.user_email : ''
                  return (
                    <tr key={e.id} className={cn('border-t border-[#F1EFEA] hover:bg-[#FBFAF7]', e.is_flagged && 'bg-[#FCEFEF]/40')}>
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', e.is_flagged ? 'bg-[#DC2626]' : 'bg-[#BDB8AC]')} />
                          <span className="text-[#0E0D0A]">{actionLabel(e.action)}</span>
                          {e.is_flagged && <Badge variant="red">Flagged</Badge>}
                        </span>
                      </td>
                      <td className="max-w-[300px] px-3 py-2.5">
                        <span className="block truncate text-[13px] text-[#5A5750]" title={e.resource || e.document_id}>
                          {e.resource || e.document_id || <span className="text-[#8A877F]">—</span>}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5">
                        {who || email ? (
                          <>
                            <div className="truncate text-[#2B2924]">{who || email}</div>
                            {who && email && <div className="truncate text-[12.5px] text-[#8A877F]">{email}</div>}
                          </>
                        ) : <span className="text-[#8A877F]">Anonymous</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12.5px] text-[#5A5750]">{e.ip_address || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#5A5750]" title={formatDateTime(e.created_at)}>
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.count > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ECEAE4] px-5 py-3 text-[13px] text-[#8A877F]">
            <span className="tabular-nums">Page {page} of {pages} · {data.count.toLocaleString('en-IN')} entries</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={!data.previous} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="ghost" size="sm" disabled={!data.next} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

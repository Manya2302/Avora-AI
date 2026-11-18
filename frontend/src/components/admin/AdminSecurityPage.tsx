'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Shield, Clock, Activity } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { adminApi } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { Card, CardHeader } from '@/components/shared/Card'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { describeSecurityEvent } from './AdminTopbar'

type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }
const PAGE_SIZE = 20
const ACTIONS: Array<[string, string]> = [
  ['login', 'Sign-in'], ['login_failed', 'Failed sign-in'], ['logout', 'Sign-out'], ['upload', 'Upload'], ['download', 'Download'],
  ['delete', 'Deletion'], ['view', 'View'], ['search', 'Search'], ['share', 'Sharing'], ['settings', 'Settings'],
]
const num = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en-IN') : '—')

export default function AdminSecurityPage() {
  const [summary, setSummary] = useState<any>(null)
  const [q, setQ]             = useState('')
  const [search, setSearch]   = useState('')
  const [action, setAction]   = useState('')
  const [page, setPage]       = useState(1)
  const [data, setData]       = useState<Page<any> | null>(null)
  const [failed, setFailed]   = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [q])

  const loadSummary = useCallback(() => {
    adminApi.dashboard().then(r => setSummary(r.data)).catch(() => setSummary(null))
  }, [])

  const load = useCallback(() => {
    const params: Record<string, unknown> = { page }
    if (search) params.search = search
    if (action) params.action = action
    setLoading(true)
    adminApi.securityEvents(params)
      .then(r => { setData(r.data); setFailed(false) })
      .catch(e => {
        if (e?.response?.status === 404 && page > 1) { setPage(1); return }
        setFailed(true)
      })
      .finally(() => setLoading(false))
  }, [page, search, action])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { load() }, [load])

  const rows = data?.results ?? []
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1
  const filtered = !!(search || action)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Events flagged in the audit log — repeated failed sign-ins, account deactivations, role changes and other activity worth a second look."
        actions={<Button variant="ghost" size="sm" loading={loading} onClick={() => { load(); loadSummary() }}>Refresh</Button>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Flagged events" value={num(summary?.security_alerts)} icon={<Shield />} accent="red" hint="All time" />
        <StatCard label="Last 24 hours" value={num(summary?.security_alerts_24h)} icon={<Clock />} accent="amber" />
        <StatCard label="Active sessions" value={num(summary?.active_sessions)} icon={<Activity />} accent="purple" hint="Signed-in devices right now" />
      </div>

      <Card>
        <CardHeader
          title="Flagged events"
          subtitle="Newest first"
          action={<Link href="/securevault-admin/audits" className="link text-[13px]">Full audit log</Link>}
        />
        <div className="flex flex-wrap gap-2 border-b border-[#ECEAE4] p-3">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search flagged events</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A877F]" strokeWidth={1.75} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by user, IP address or resource" className="field h-9 pl-9" />
          </label>
          <select value={action} onChange={e => { setAction(e.target.value); setPage(1) }} className="field h-9 w-auto pr-8" aria-label="Filter by action">
            <option value="">All actions</option>
            {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {failed && !data ? (
          <EmptyState icon={<Shield />} title="Couldn't load security events" action={<Button variant="ghost" size="sm" onClick={load}>Try again</Button>}>
            The admin API didn't respond. Check that the backend is running.
          </EmptyState>
        ) : !data ? (
          <div className="space-y-2 p-5">{[0, 1, 2].map(i => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div>
        ) : !rows.length ? (
          <EmptyState icon={<Shield />} title={filtered ? 'No flagged events match' : 'No flagged security events'}>
            {filtered ? 'Try a different search or action.' : 'Nothing has been flagged in the audit log.'}
          </EmptyState>
        ) : (
          <ul>
            {rows.map(e => {
              const d = describeSecurityEvent(e)
              return (
                <li key={e.id} className="flex items-start gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0 hover:bg-[#FBFAF7]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-[#0E0D0A]" title={d.title}>{d.title}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-[#8A877F]">
                      {[e.user_email && e.user_email !== '—' ? e.user_email : 'Anonymous', e.ip_address].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12.5px] tabular-nums text-[#8A877F]" title={formatDateTime(e.created_at)}>
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {data && data.count > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ECEAE4] px-5 py-3 text-[13px] text-[#8A877F]">
            <span className="tabular-nums">Page {page} of {pages} · {data.count.toLocaleString('en-IN')} events</span>
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

'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, FileText, Database, Shield, Activity, AlertTriangle, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { adminApi } from '@/lib/api'
import StatCard from '@/components/shared/StatCard'
import { Card, CardHeader } from '@/components/shared/Card'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { cn, formatBytes } from '@/lib/utils'
import { describeSecurityEvent } from './AdminTopbar'

type HealthRow = { key: string; label: string; ok: boolean | null; status: string; ms?: number }

const num = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en-IN') : '—')

export default function AdminDashboardPage() {
  const router = useRouter()
  const [stats, setStats]     = useState<any>(null)
  const [events, setEvents]   = useState<any[] | null>(null)
  const [health, setHealth]   = useState<HealthRow[] | null>(null)
  const [healthErr, setHealthErr] = useState(false)
  const [checking, setChecking]   = useState(false)

  const loadHealth = useCallback(() => {
    setChecking(true)
    adminApi.systemHealth()
      .then(r => { setHealth(r.data?.checks || []); setHealthErr(false) })
      .catch(() => setHealthErr(true))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    adminApi.dashboard().then(r => setStats(r.data)).catch(() => setStats(null))
    adminApi.security().then(r => setEvents((r.data?.results ?? r.data ?? []).slice(0, 5))).catch(() => setEvents([]))
    loadHealth()
  }, [loadHealth])

  const compression = stats && stats.original_bytes > 0
    ? `${Math.round((1 - stats.compressed_bytes / stats.original_bytes) * 100)}%`
    : '—'

  return (
    <div className="space-y-6">
      <PageHeader title="Admin overview" description="Accounts, documents, storage and security across the whole Avora workspace." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Users" value={num(stats?.total_users)} icon={<Users />} accent="blue"
          trend={stats?.users_new_7d ? `+${num(stats.users_new_7d)} this week` : undefined} trendUp
          onClick={() => router.push('/securevault-admin/users')} />
        <StatCard label="Documents" value={num(stats?.total_documents)} icon={<FileText />} accent="green"
          trend={stats?.documents_today ? `+${num(stats.documents_today)} today` : undefined} trendUp
          onClick={() => router.push('/securevault-admin/documents')} />
        <StatCard label="Storage used" value={typeof stats?.storage_bytes === 'number' ? formatBytes(stats.storage_bytes) : '—'}
          icon={<Database />} accent="amber" />
        <StatCard label="Security alerts" value={num(stats?.security_alerts)} icon={<Shield />} accent="red"
          hint={stats?.security_alerts_24h ? `${num(stats.security_alerts_24h)} in the last 24 hours` : undefined}
          onClick={() => router.push('/securevault-admin/security')} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Active sessions" value={num(stats?.active_sessions)} icon={<Activity />} accent="purple" />
        <StatCard label="Failed AI jobs" value={num(stats?.ai_failed)} icon={<AlertTriangle />} accent="red"
          hint={typeof stats?.ai_processing === 'number' ? `${num(stats.ai_processing)} processing now` : undefined}
          onClick={() => router.push('/securevault-admin/ai-monitor')} />
        <StatCard label="Average compression" value={compression} icon={<Database />} accent="green"
          hint={stats?.compression_level ? `ZSTD level ${stats.compression_level}` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent security events"
            action={<button onClick={() => router.push('/securevault-admin/security')} className="link text-[13px]">View all</button>}
          />
          {events === null ? (
            <p className="px-5 py-10 text-center text-[13px] text-[#8A877F]">Loading…</p>
          ) : events.length ? (
            <ul>
              {events.map(e => {
                const d = describeSecurityEvent(e)
                return (
                  <li key={e.id} className="flex items-start gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-[#0E0D0A]">{d.title}</p>
                      {d.meta && <p className="mt-0.5 truncate text-[12.5px] text-[#8A877F]">{d.meta}</p>}
                    </div>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-[#8A877F]">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState icon={<Shield />} title="No flagged security events">
              Events flagged in the audit log will appear here.
            </EmptyState>
          )}
        </Card>

        <Card>
          <CardHeader
            title="System health"
            action={
              <button onClick={loadHealth} disabled={checking} className="link inline-flex items-center gap-1 text-[13px] disabled:opacity-50">
                <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} /> {checking ? 'Checking…' : 'Check again'}
              </button>
            }
          />
          {healthErr && !health ? (
            <p className="px-5 py-10 text-center text-[13px] text-[#8A877F]">Couldn't run the health checks.</p>
          ) : !health ? (
            <p className="px-5 py-10 text-center text-[13px] text-[#8A877F]">Checking services…</p>
          ) : (
            <ul>
              {health.map(s => (
                <li key={s.key} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full',
                    s.ok === true ? 'bg-[#16A34A]' : s.ok === false ? 'bg-[#DC2626]' : 'bg-[#BDB8AC]')} />
                  <span className="flex-1 text-[13.5px] text-[#2B2924]">{s.label}</span>
                  <span className={cn('truncate text-right text-[13px]',
                    s.ok === true ? 'text-[#15803D]' : s.ok === false ? 'font-medium text-[#B91C1C]' : 'text-[#8A877F]')}>
                    {s.status}
                    {s.ok === true && typeof s.ms === 'number' && <span className="ml-1.5 tabular-nums text-[#8A877F]">{Math.round(s.ms)} ms</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

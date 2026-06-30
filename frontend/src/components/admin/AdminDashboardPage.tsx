'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, FileText, Database, Shield, Activity, AlertTriangle } from 'lucide-react'
import { adminApi } from '@/lib/api'
import StatCard from '@/components/shared/StatCard'
import { Card, CardHeader } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import { formatBytes, formatDateTime } from '@/lib/utils'

const EVENTS = [
  { dot: 'bg-red-500',  title: '3 failed logins — 103.24.88.14',      meta: 'Brute force detected · Auto-blocked', time: '14:32' },
  { dot: 'bg-amber-400',title: 'Unusual downloads — user #1844',       meta: '48 files in 6 min · Flagged', time: '12:11' },
  { dot: 'bg-amber-400',title: 'New device login — Priya Mehta',       meta: 'Mumbai · Chrome/macOS · New fingerprint', time: '10:45' },
  { dot: 'bg-green-500', title: 'Key rotation complete',                meta: 'All 148,294 keys refreshed · No downtime', time: '09:00' },
]

export default function AdminDashboardPage() {
  const router = useRouter()
  const [stats, setStats]   = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { adminApi.dashboard().then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false)) }, [])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">Admin Dashboard</h2>
        <p className="text-sm font-light text-[#9B9890]">Platform-wide overview — SecureVault AI</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard label="Total Users"      value={stats?.total_users     || '2,841'} icon={<Users />}    accent="blue"   trend="+48 week" trendUp onClick={() => router.push('/securevault-admin/users')} />
        <StatCard label="Total Documents"  value={stats?.total_documents || '148K'}  icon={<FileText />} accent="green"  trend="+1,284 today" trendUp onClick={() => router.push('/securevault-admin/documents')} />
        <StatCard label="Storage Used"     value={formatBytes(stats?.storage_bytes || 1.14e12)} icon={<Database />} accent="amber" />
        <StatCard label="Security Alerts"  value={stats?.security_alerts || 3}      icon={<Shield />}   accent="red"    onClick={() => router.push('/securevault-admin/security')} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
        <StatCard label="Active Sessions"  value={stats?.active_sessions || '1,842'} icon={<Activity />} accent="purple" />
        <StatCard label="Orivo AI Accuracy" value="98.4%"  icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1"/></svg>} accent="blue" />
        <StatCard label="Avg Compression"  value="68%"    icon={<Database />} accent="green" trend="ZSTD L9" trendUp />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Recent Security Events" action={<button onClick={() => router.push('/securevault-admin/security')} className="text-xs text-[#1A3DAF] hover:underline">View all →</button>} />
          <div className="divide-y divide-[#ECEAE4]">
            {EVENTS.map((e, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-[#F7F5F0] cursor-pointer">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${e.dot}`} />
                <div className="flex-1"><p className="text-[13px] font-medium text-[#0E0D0A]">{e.title}</p><p className="text-[11px] font-mono text-[#9B9890]">{e.meta}</p></div>
                <span className="font-mono text-[10px] text-[#9B9890] flex-shrink-0">{e.time}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="System Health" />
          <div className="p-5 space-y-3">
            {[
              { label: 'API Response',  val: '98ms avg',  pct: 92, ok: true },
              { label: 'MinIO Storage', val: 'Healthy',   pct: 100,ok: true },
              { label: 'Qdrant VectorDB',val:'Online',    pct: 100,ok: true },
              { label: 'Orivo (Ollama)',val: 'High load', pct: 74, ok: false },
              { label: 'PostgreSQL',    val: 'Healthy',   pct: 98, ok: true },
            ].map(s => (
              <div key={s.label}>
                <div className="flex justify-between mb-1"><span className="text-xs text-[#5A5750]">{s.label}</span><span className={`font-mono text-[10.5px] font-semibold ${s.ok ? 'text-green-600' : 'text-amber-600'}`}>{s.val}</span></div>
                <div className="h-1 bg-[#ECEAE4] rounded-full overflow-hidden"><div className={`h-full rounded-full ${s.ok ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${s.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

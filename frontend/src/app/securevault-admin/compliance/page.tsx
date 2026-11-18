'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { adminApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

/* GET /admin-panel/compliance/ */
type Overview = {
  profiles: { count: number; avg_score: number | null; avg_readiness: number | null; by_industry: { industry: string; count: number; avg_score: number | null }[] }
  lowest_scores: { owner_id: string; owner__email: string; owner__full_name: string; industry: string; compliance_score: number; audit_readiness_pct: number; last_scored_at: string | null }[]
  missing_documents: { open: number; users_affected: number; by_priority: { priority: string; count: number }[] }
  expiry: { expired: number; next_30_days: number; next_90_days: number }
  risks: { open: number; by_severity: { severity: string; count: number }[] }
  audit_packages: { status: string; count: number }[]
}

const INDUSTRY: Record<string, string> = {
  law_firm: 'Law firms', ca_firm: 'CA / accounting', healthcare: 'Healthcare', consulting: 'Consulting', startup: 'Startups', other: 'Other',
}
const SEVERITY = [
  ['critical', 'Critical', 'bg-[#DC2626]'],
  ['high', 'High', 'bg-[#D97706]'],
  ['medium', 'Medium', 'bg-[#6B8DE3]'],
  ['low', 'Low', 'bg-[#86C79A]'],
] as const

const scoreTone = (s: number) => (s >= 80 ? 'text-[#15803D]' : s >= 60 ? 'text-[#A35A04]' : 'text-[#B91C1C]')

export default function AdminCompliancePage() {
  const [data, setData] = useState<Overview | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    adminApi.compliance()
      .then(r => { setData(r.data); setFailed(false) })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const pkgs = Object.fromEntries((data?.audit_packages || []).map(p => [p.status, p.count]))
  const sev = Object.fromEntries((data?.risks.by_severity || []).map(s => [s.severity, s.count]))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Every workspace's compliance checklist, rolled up. Scores are calculated per account from the documents each one has uploaded."
        actions={<Button variant="ghost" size="sm" loading={loading} onClick={load}>Refresh</Button>}
      />

      {failed && !data ? (
        <Card>
          <EmptyState icon={<ShieldCheck />} title="Couldn't load compliance figures" action={<Button variant="ghost" size="sm" onClick={load}>Try again</Button>}>
            The admin API didn't respond. Check that the backend is running.
          </EmptyState>
        </Card>
      ) : !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-[104px] animate-pulse rounded-[12px] bg-[#F1EFEA]" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure label="Average score" value={data.profiles.avg_score ?? '—'} hint={`${data.profiles.count} scored account${data.profiles.count === 1 ? '' : 's'}`} />
            <Figure label="Average audit readiness" value={data.profiles.avg_readiness !== null ? `${data.profiles.avg_readiness}%` : '—'} />
            <Figure label="Missing documents" value={data.missing_documents.open} hint={`across ${data.missing_documents.users_affected} account${data.missing_documents.users_affected === 1 ? '' : 's'}`} tone={data.missing_documents.open ? 'red' : undefined} />
            <Figure label="Open compliance risks" value={data.risks.open} tone={sev.critical ? 'red' : undefined} hint={sev.critical ? `${sev.critical} critical` : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Lowest scores" subtitle="Accounts that most need attention" action={<Link href="/securevault-admin/users" className="link text-[13px]">All users</Link>} />
              {data.lowest_scores.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-[14px]">
                    <thead>
                      <tr className="text-[12.5px] text-[#8A877F]">
                        <th className="px-5 py-2.5 font-normal">Account</th>
                        <th className="px-3 py-2.5 font-normal">Industry</th>
                        <th className="px-3 py-2.5 text-right font-normal">Score</th>
                        <th className="px-3 py-2.5 text-right font-normal">Readiness</th>
                        <th className="px-5 py-2.5 font-normal">Scored</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lowest_scores.map(r => (
                        <tr key={r.owner_id} className="border-t border-[#F1EFEA]">
                          <td className="px-5 py-2.5">
                            <div className="truncate font-medium">{r.owner__full_name || r.owner__email}</div>
                            <div className="truncate text-[12.5px] text-[#8A877F]">{r.owner__email}</div>
                          </td>
                          <td className="px-3 py-2.5 text-[#5A5750]">{INDUSTRY[r.industry] || r.industry}</td>
                          <td className={cn('px-3 py-2.5 text-right tabular-nums font-medium', scoreTone(r.compliance_score))}>{Math.round(r.compliance_score)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(r.audit_readiness_pct)}%</td>
                          <td className="px-5 py-2.5 text-[13px] text-[#8A877F]">
                            {r.last_scored_at ? formatDistanceToNow(new Date(r.last_scored_at), { addSuffix: true }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No accounts have been scored yet">Scores appear after an account runs a compliance scan.</EmptyState>
              )}
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader title="Document expiry" />
                <CardBody className="space-y-2.5 text-[14px]">
                  <Row label="Already expired" value={data.expiry.expired} dot={data.expiry.expired ? 'bg-[#DC2626]' : 'bg-[#C9C4B9]'} />
                  <Row label="Expiring in 30 days" value={data.expiry.next_30_days} dot={data.expiry.next_30_days ? 'bg-[#D97706]' : 'bg-[#C9C4B9]'} />
                  <Row label="Expiring in 90 days" value={data.expiry.next_90_days} dot="bg-[#C9C4B9]" />
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Open risks by severity" />
                <CardBody>
                  {data.risks.open ? (
                    <ul className="space-y-2.5">
                      {SEVERITY.map(([key, label, color]) => (
                        <li key={key} className="flex items-center gap-3 text-[13.5px]">
                          <span className="w-16 text-[#5A5750]">{label}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ECEAE4]">
                            <span className={cn('block h-full rounded-full', color)} style={{ width: `${((sev[key] || 0) / data.risks.open) * 100}%` }} />
                          </span>
                          <span className="w-6 text-right tabular-nums">{sev[key] || 0}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-[13.5px] text-[#8A877F]">No open risks.</p>}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Audit packages" />
                <CardBody className="space-y-2.5 text-[14px]">
                  <Row label="Ready" value={pkgs.ready || 0} />
                  <Row label="Generating" value={pkgs.generating || 0} />
                  <Row label="Failed" value={pkgs.failed || 0} dot={pkgs.failed ? 'bg-[#DC2626]' : undefined} />
                </CardBody>
              </Card>
            </div>
          </div>

          {data.profiles.by_industry.length > 0 && (
            <Card>
              <CardHeader title="By industry" />
              <ul>
                {data.profiles.by_industry.map(b => (
                  <li key={b.industry} className="flex items-center gap-4 border-t border-[#F1EFEA] px-5 py-2.5 text-[14px] first:border-0">
                    <span className="flex-1">{INDUSTRY[b.industry] || b.industry}</span>
                    <span className="text-[13px] text-[#8A877F]">{b.count} account{b.count === 1 ? '' : 's'}</span>
                    <span className={cn('w-16 text-right tabular-nums font-medium', b.avg_score !== null ? scoreTone(b.avg_score) : 'text-[#8A877F]')}>
                      {b.avg_score !== null ? Math.round(b.avg_score) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Figure({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'red' }) {
  return (
    <div className="rounded-[12px] border border-[#DDD9D0] bg-white p-4">
      <div className="text-[13px] text-[#5A5750]">{label}</div>
      <div className={cn('mt-3 font-display text-[28px] font-semibold leading-none tabular-nums', tone === 'red' ? 'text-[#B91C1C]' : 'text-[#0E0D0A]')}>{value}</div>
      {hint && <div className="mt-2 text-[12.5px] text-[#8A877F]">{hint}</div>}
    </div>
  )
}

function Row({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
      <span className="flex-1 text-[#5A5750]">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Upload, Sparkles, ShieldCheck, Brain, AlertTriangle, ArrowRight, FileSignature, Folder } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import StatCard from '@/components/shared/StatCard'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import EmptyState from '@/components/shared/EmptyState'
import { cn, formatBytes } from '@/lib/utils'
import { documentsApi, auditApi, aiApi, complianceApi, contractsApi } from '@/lib/api'

const EXT_TONE: Record<string, string> = {
  pdf: 'text-[#B91C1C]', doc: 'text-[#1A3DAF]', docx: 'text-[#1A3DAF]',
  xls: 'text-[#15803D]', xlsx: 'text-[#15803D]', csv: 'text-[#15803D]',
  png: 'text-[#7E22CE]', jpg: 'text-[#7E22CE]', jpeg: 'text-[#7E22CE]',
}

const STATUS: Record<string, { label: string; variant: 'green' | 'blue' | 'amber' | 'red' | 'gray' }> = {
  ai_ready:   { label: 'Ready',       variant: 'green' },
  encrypted:  { label: 'Encrypted',   variant: 'blue' },
  processing: { label: 'Processing',  variant: 'amber' },
  uploading:  { label: 'Uploading',   variant: 'gray' },
  failed:     { label: 'Failed',      variant: 'red' },
}

const STORAGE_LIMIT = 500 * 1024 * 1024 * 1024

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [docs, setDocs]         = useState<any[]>([])
  const [docCount, setDocCount] = useState<number | null>(null)
  const [logs, setLogs]         = useState<any[]>([])
  const [aiData, setAiData]     = useState<any>(null)
  const [cols, setCols]         = useState<any[]>([])
  const [compliance, setComp]   = useState<any>(null)
  const [riskSum, setRisk]      = useState<any>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.allSettled([
      documentsApi.list({ page_size: 6 }).then(r => {
        const items = r.data.results || r.data || []
        setDocs(items)
        setDocCount(r.data.count ?? items.length)
      }),
      auditApi.getLogs({ page_size: 6 }).then(r => setLogs(r.data.results || [])),
      aiApi.aiDashboard().then(r => setAiData(r.data)),
      aiApi.collections().then(r => setCols((r.data.results || r.data || []).slice(0, 5))),
      complianceApi.dashboard().then(r => setComp(r.data)),
      contractsApi.riskSummary().then(r => setRisk(r.data)),
    ]).finally(() => setLoading(false))
  }, [])

  const firstName = user?.full_name?.split(' ')[0]
  const storageUsed = user?.profile?.storage_used || 0
  const storagePct = Math.min((storageUsed / STORAGE_LIMIT) * 100, 100)
  const score = compliance ? Math.round(compliance.score) : null
  const openRisks = riskSum ? (riskSum.critical || 0) + (riskSum.high || 0) : null

  const attention: { href: string; text: string; tone: 'red' | 'amber' }[] = []
  if (compliance?.critical_missing > 0) attention.push({
    href: '/compliance', tone: 'red',
    text: `${compliance.critical_missing} required document${compliance.critical_missing > 1 ? 's are' : ' is'} missing from your compliance checklist`,
  })
  if (riskSum?.expiring_30 > 0) attention.push({
    href: '/contracts', tone: 'amber',
    text: `${riskSum.expiring_30} contract${riskSum.expiring_30 > 1 ? 's expire' : ' expires'} in the next 30 days`,
  })
  const failed = docs.filter(d => d.status === 'failed').length
  if (failed) attention.push({ href: '/documents', tone: 'red', text: `${failed} recent upload${failed > 1 ? 's' : ''} couldn’t be processed` })

  return (
    <div className="space-y-6">
      {/* heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push('/copilot')}><Sparkles className="h-3.5 w-3.5" /> Ask Copilot</Button>
          <Button size="sm" onClick={() => router.push('/upload')}><Upload className="h-3.5 w-3.5" /> Upload</Button>
        </div>
      </div>

      {/* needs attention */}
      {attention.length > 0 && (
        <div className="overflow-hidden rounded-[12px] border border-[#EAD9B8] bg-[#FDF8EE]">
          <div className="px-4 pt-3 text-[12.5px] font-medium text-[#8A5A0B]">Needs your attention</div>
          <ul className="pb-1.5">
            {attention.map(a => (
              <li key={a.href + a.text}>
                <Link href={a.href} className="group flex items-center gap-3 px-4 py-2 text-[14px] text-[#2B2924] hover:bg-[#FBF1DC]">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', a.tone === 'red' ? 'bg-[#DC2626]' : 'bg-[#D97706]')} />
                  <span className="flex-1">{a.text}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#8A877F] transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Documents" value={docCount ?? '—'} icon={<FileText />} accent="blue"
          hint={formatBytes(storageUsed) + ' stored'} onClick={() => router.push('/documents')} />
        <StatCard label="Compliance score" value={score !== null ? `${score}` : '—'} icon={<ShieldCheck />}
          accent={score === null ? 'blue' : score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red'}
          hint={compliance ? `Grade ${compliance.grade} · out of 100` : 'Not set up yet'} onClick={() => router.push('/compliance')} />
        <StatCard label="Read by AI" value={aiData?.total_processed?.toLocaleString() ?? '—'} icon={<Brain />} accent="purple"
          hint="classified and indexed" onClick={() => router.push('/analytics')} />
        <StatCard label="High-risk contracts" value={openRisks ?? '—'} icon={<AlertTriangle />} accent={openRisks ? 'red' : 'green'}
          hint={riskSum ? `of ${riskSum.total ?? 0} reviewed` : 'No contracts yet'} onClick={() => router.push('/risk')} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* main column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Recently added" action={<Link href="/documents" className="link text-[13px]">All documents</Link>} />
            {loading ? (
              <div className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div>
            ) : docs.length === 0 ? (
              <EmptyState icon={<FileText />} title="Your vault is empty"
                action={<Button size="sm" onClick={() => router.push('/upload')}><Upload className="h-3.5 w-3.5" /> Upload documents</Button>}>
                Upload a few files to get started. They’re encrypted first, then made searchable.
              </EmptyState>
            ) : (
              <ul>
                {docs.map(doc => {
                  const ext = String(doc.file_extension || '').replace('.', '').toLowerCase()
                  const st = STATUS[doc.status] || STATUS.encrypted
                  return (
                    <li key={doc.id}>
                      <Link href={`/documents/${doc.id}`} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0 hover:bg-[#FBFAF7]">
                        <FileText className={cn('h-[18px] w-[18px] shrink-0', EXT_TONE[ext] || 'text-[#8A877F]')} strokeWidth={1.75} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-medium">{doc.original_name}</div>
                          <div className="text-[12.5px] text-[#8A877F]">
                            {[doc.category, formatBytes(doc.original_size), doc.created_at && formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })]
                              .filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Compliance" action={<Link href="/compliance" className="link text-[13px]">Open checklist</Link>} />
              <CardBody>
                {compliance ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-[34px] font-semibold leading-none tabular-nums">{score}</span>
                      <span className="text-[13px] text-[#8A877F]">/ 100 · grade {compliance.grade}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]">
                      <div className={cn('h-full rounded-full', score! >= 80 ? 'bg-[#16A34A]' : score! >= 60 ? 'bg-[#D97706]' : 'bg-[#DC2626]')} style={{ width: `${score}%` }} />
                    </div>
                    <p className="mt-3 text-[13.5px] text-[#5A5750]">
                      {compliance.compliant} of {compliance.total_checks} checks passed
                      {compliance.missing_count > 0 && <>, <span className="text-[#B91C1C]">{compliance.missing_count} missing</span></>}.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="ghost" size="sm" onClick={() => router.push('/compliance/audit-package')}>Build audit package</Button>
                      <Button variant="plain" size="sm" onClick={() => router.push('/compliance/copilot')}>Ask about it</Button>
                    </div>
                  </>
                ) : (
                  <p className="py-4 text-[13.5px] text-[#8A877F]">The checklist fills in as documents are classified.</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Contract risk" action={<Link href="/risk" className="link text-[13px]">See report</Link>} />
              <CardBody>
                {riskSum && riskSum.total > 0 ? (
                  <ul className="space-y-2.5">
                    {([
                      ['Critical', riskSum.critical, 'bg-[#DC2626]'],
                      ['High', riskSum.high, 'bg-[#D97706]'],
                      ['Medium', riskSum.medium, 'bg-[#6B8DE3]'],
                      ['Low', riskSum.low, 'bg-[#86C79A]'],
                    ] as [string, number, string][]).map(([label, v, c]) => (
                      <li key={label} className="flex items-center gap-3 text-[13.5px]">
                        <span className="w-16 text-[#5A5750]">{label}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ECEAE4]">
                          <span className={cn('block h-full rounded-full', c)} style={{ width: `${((v || 0) / riskSum.total) * 100}%` }} />
                        </span>
                        <span className="w-6 text-right tabular-nums">{v || 0}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-4 text-[13.5px] text-[#8A877F]">
                    No contracts reviewed yet. <Link href="/contracts" className="link">Add one</Link> to see its risk.
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        {/* side column */}
        <div className="space-y-6">
          <Link href="/copilot" className="group block rounded-[12px] bg-[#0E0D0A] p-5 text-[#F7F5F0]">
            <div className="flex items-center gap-2 text-[14px] font-medium">
              <Sparkles className="h-4 w-4 text-[#9FB4EE]" /> Ask Copilot
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#F7F5F0]/65">
              Ask questions across everything you’ve uploaded. For example:
            </p>
            <ul className="mt-3 space-y-1.5 text-[13.5px] text-[#F7F5F0]/90">
              <li>“Are we ready for the statutory audit?”</li>
              <li>“Which vendor contracts renew next quarter?”</li>
            </ul>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-[#9FB4EE]">
              Start a conversation <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Card>
            <CardBody>
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-semibold">Storage</span>
                <span className="text-[12.5px] text-[#8A877F]">{storagePct < 1 && storageUsed > 0 ? '<1' : Math.round(storagePct)}% used</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]">
                <div className="h-full rounded-full bg-[#1A3DAF]" style={{ width: `${Math.max(storagePct, storageUsed ? 1 : 0)}%` }} />
              </div>
              <p className="mt-2 text-[13px] text-[#5A5750]">{formatBytes(storageUsed)} of 500 GB</p>
            </CardBody>
          </Card>

          {cols.length > 0 && (
            <Card>
              <CardHeader title="Collections" action={<Link href="/collections" className="link text-[13px]">All</Link>} />
              <ul className="py-1">
                {cols.map(c => (
                  <li key={c.id}>
                    <Link href={`/collections/${c.id}`} className="flex items-center gap-3 px-5 py-2 text-[13.5px] hover:bg-[#FBFAF7]">
                      <Folder className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="tabular-nums text-[12.5px] text-[#8A877F]">{c.document_count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity" action={<Link href="/audit-logs" className="link text-[13px]">Audit log</Link>} />
            {logs.length ? (
              <ul className="py-1">
                {logs.slice(0, 5).map(log => (
                  <li key={log.id} className="px-5 py-2">
                    <div className="truncate text-[13.5px]">
                      <span className="capitalize">{String(log.action || '').replace(/_/g, ' ')}</span>
                      {log.resource && <span className="text-[#5A5750]"> · {log.resource}</span>}
                    </div>
                    <div className="text-[12px] text-[#8A877F]">
                      {log.created_at && formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-[13px] text-[#8A877F]">No activity yet.</p>
            )}
          </Card>

          <Link href="/contracts" className="flex items-center gap-3 rounded-[12px] border border-dashed border-[#C9C4B9] px-5 py-4 text-[13.5px] text-[#5A5750] hover:border-[#8A877F] hover:text-[#0E0D0A]">
            <FileSignature className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Upload a contract to get a clause-by-clause risk review
          </Link>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, CheckCircle2, Clock, FileX, Package, Sparkles, RefreshCw, Upload } from 'lucide-react'
import { complianceApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import type { ComplianceDashboard as CD } from '@/types'
import toast from 'react-hot-toast'

/** Severity shown as a small dot + word, so priority reads at a glance without shouting. */
const PRIORITY_DOT: Record<string, string> = { critical: 'bg-[#DC2626]', high: 'bg-[#D97706]', medium: 'bg-[#6B8DE3]', low: 'bg-[#A8A49A]' }
const SV: Record<string,any> = { compliant:'green', missing:'red', expiring_soon:'amber', expired:'red', needs_review:'amber' }

function Priority({ level }: { level: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] capitalize text-[#5A5750]">
      <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[level] || 'bg-[#A8A49A]')} />
      {level}
    </span>
  )
}

export default function ComplianceDashboard() {
  const router = useRouter()
  const [data, setData]       = useState<CD | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScan]   = useState(false)
  const [tab, setTab]         = useState<'overview'|'checks'|'timeline'|'ai_risks'>('overview')

  const load = () => { complianceApi.dashboard().then(r => setData(r.data)).catch(()=>{}).finally(()=>setLoading(false)) }
  useEffect(() => { load() }, [])

  const runScan = async () => {
    setScan(true)
    try { await complianceApi.scan(data?.industry||'other'); toast.success('Scan complete.'); load() }
    catch { toast.error('The scan didn’t finish. Try again.') } finally { setScan(false) }
  }

  const sc = (s:number) => s>=80?'#16A34A':s>=60?'#D97706':'#DC2626'
  const gc = (g:string) => ({A:'text-[#15803D]',B:'text-[#1A3DAF]',C:'text-[#A35A04]',D:'text-[#B91C1C]',F:'text-[#B91C1C]'}[g]||'text-[#0E0D0A]')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Which required documents you have, which are missing, and what’s due soon."
        actions={<>
          <Button variant="ghost" size="sm" onClick={()=>router.push('/compliance/audit-package')}><Package className="h-3.5 w-3.5"/> Audit package</Button>
          <Button variant="ghost" size="sm" onClick={()=>router.push('/compliance/copilot')}><Sparkles className="h-3.5 w-3.5"/> Ask Copilot</Button>
          <Button size="sm" loading={scanning} onClick={runScan}><RefreshCw className="h-3.5 w-3.5"/> Run scan</Button>
        </>}
      />

      {loading ? (
        <Card><div className="space-y-3 p-5">{[0,1,2].map(i=><div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]"/>)}</div></Card>
      ) : !data ? (
        <Card>
          <EmptyState icon={<Shield/>} title="Couldn’t load your compliance checklist">
            Try refreshing the page, or run a scan to build it from your documents.
          </EmptyState>
        </Card>
      ) : (<>
        {/* Score */}
        <Card>
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6 p-5">
            <div className="relative shrink-0">
              <svg width="104" height="104" viewBox="0 0 110 110" className="-rotate-90" aria-hidden>
                <circle cx="55" cy="55" r="45" fill="none" stroke="#ECEAE4" strokeWidth="7"/>
                <circle cx="55" cy="55" r="45" fill="none" stroke={sc(data.score)} strokeWidth="7"
                  strokeLinecap="round" strokeDasharray="283"
                  strokeDashoffset={283-(283*data.score/100)} className="transition-all duration-700"/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-[28px] font-semibold leading-none tabular-nums text-[#0E0D0A]">{Math.round(data.score)}</span>
                <span className="mt-1 text-[11.5px] text-[#8A877F]">of 100</span>
              </div>
            </div>

            <div className="min-w-0 flex-1 basis-64">
              <div className="flex items-baseline gap-2.5">
                <span className={cn('font-display text-[28px] font-semibold leading-none', gc(data.grade))}>{data.grade}</span>
                <span className="text-[14px] font-semibold text-[#0E0D0A]">Compliance grade</span>
              </div>
              <p className="mt-1 text-[12.5px] text-[#8A877F]">
                <span className="capitalize">{data.industry?.replace('_',' ')}</span> · {data.total_checks} checks
              </p>
              <div className="mt-4 max-w-sm">
                <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                  <span className="text-[#5A5750]">Audit readiness</span>
                  <span className="tabular-nums text-[#2B2924]">{Math.round(data.audit_readiness)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]">
                  <div className="h-full rounded-full transition-all duration-700" style={{width:`${data.audit_readiness}%`,background:sc(data.audit_readiness)}}/>
                </div>
              </div>
              {data.recommendation && <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-[#5A5750]">{data.recommendation}</p>}
            </div>

            <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
              {[{l:'Readiness',v:`${Math.round(data.audit_readiness)}%`,dot:''},
                {l:'Compliant',v:data.compliant,dot:'bg-[#16A34A]'},
                {l:'Missing',v:data.missing_count,dot:'bg-[#D97706]'},
                {l:'Critical missing',v:data.critical_missing,dot:'bg-[#DC2626]'}].map(s=>(
                <div key={s.l}>
                  <dt className="flex items-center gap-1.5 text-[12.5px] text-[#8A877F]">
                    {s.dot && <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)}/>}{s.l}
                  </dt>
                  <dd className="mt-1 font-display text-[24px] font-semibold leading-none tabular-nums text-[#0E0D0A]">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>

        {/* Needs attention */}
        {data.critical_missing > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[12px] border border-[#EAD9B8] bg-[#FDF8EE] px-4 py-3">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]"/>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-[#2B2924]">
                {data.critical_missing} required document{data.critical_missing>1?'s are':' is'} missing
              </p>
              <p className="text-[13px] text-[#5A5750]">These are mandatory for your industry. Uploading them will raise your score.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={()=>router.push('/upload')}><Upload className="h-3.5 w-3.5"/> Upload documents</Button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-6 border-b border-[#DDD9D0]" role="tablist">
          {[['overview','Overview'],['checks','All checks'],['timeline','Deadlines']].map(([k,l])=>(
            <button key={k} role="tab" aria-selected={tab===k} onClick={()=>setTab(k as any)}
              className={cn(
                '-mb-px border-b-2 pb-2.5 text-[14px] transition-colors',
                tab===k ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'
              )}>{l}</button>
          ))}
        </div>

        {tab==='overview' && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Missing documents" action={<span className="text-[12.5px] tabular-nums text-[#8A877F]">{data.missing_count} missing</span>}/>
              {data.missing?.length ? (
                <ul>
                  {data.missing.slice(0,6).map((m,i)=>(
                    <li key={i} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                      <FileX className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75}/>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-[#0E0D0A]">{m.name}</span>
                      <Priority level={m.priority}/>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-8 text-center text-[13.5px] text-[#8A877F]">Nothing missing. Every required document is in the vault.</p>
              )}
            </Card>
            <Card>
              <CardHeader title="By priority" subtitle="Checks passed at each priority level"/>
              <CardBody className="space-y-4">
                {['critical','high','medium','low'].map(p=>{
                  const pc=data.checks?.filter(c=>c.priority===p)||[]
                  const ok=pc.filter(c=>c.status==='compliant').length
                  const pct=pc.length?Math.round(ok/pc.length*100):100
                  return (<div key={p}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <Priority level={p}/>
                      <span className="text-[12.5px] tabular-nums text-[#5A5750]">{ok} of {pc.length} · {pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]">
                      <div className={cn('h-full rounded-full', pct===100?'bg-[#16A34A]':pct>=60?'bg-[#D97706]':'bg-[#DC2626]')} style={{width:`${pct}%`}}/>
                    </div>
                  </div>)
                })}
              </CardBody>
            </Card>
          </div>
        )}

        {tab==='checks' && (
          <Card>
            <CardHeader title="All checks" action={<span className="text-[12.5px] tabular-nums text-[#8A877F]">{data.checks?.length} checks</span>}/>
            <ul>
              {data.checks?.map((c: any, i: number)=>(
                <li key={i} className="border-t border-[#F1EFEA] px-5 py-3.5 first:border-0 hover:bg-[#FBFAF7]">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {c.status==='compliant'
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" strokeWidth={1.75}/>
                      : <FileX className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75}/>}
                    <span className="min-w-0 flex-1 text-[14px] font-medium text-[#0E0D0A]">{c.name}</span>
                    <Priority level={c.priority}/>
                    <Badge variant={SV[c.status]||'gray'}><span className="capitalize">{c.status.replace('_',' ')}</span></Badge>
                    {c.id && c.id !== "0" && (
                      <button onClick={async () => {
                        await complianceApi.dismissFact(c.id);
                        toast.success("Check ignored.");
                        load();
                      }} className="rounded-[6px] px-1.5 py-0.5 text-[12.5px] text-[#8A877F] transition-colors hover:bg-[#ECEAE4] hover:text-[#0E0D0A]">
                        Ignore
                      </button>
                    )}
                  </div>
                  {c.description && (
                    <p className="ml-7 mt-1.5 text-[13.5px] leading-relaxed text-[#5A5750]">{c.description}</p>
                  )}
                  {c.location && (
                    <div className="ml-7 mt-2 rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7] px-3 py-2">
                      <p className="mb-0.5 text-[12px] text-[#8A877F]">Where it was found</p>
                      <p className="text-[13px] leading-relaxed text-[#2B2924]">{c.location}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {tab==='timeline' && (
          <Card>
            <CardHeader title="Upcoming deadlines"/>
            {data.upcoming_events?.length ? (
              <ul>
                {data.upcoming_events.map((e:any)=>(
                  <li key={e.id} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                    <Clock className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75}/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[#0E0D0A]">{e.title}</p>
                      <p className="text-[12.5px] text-[#8A877F]"><span className="capitalize">{e.event_type?.replace('_',' ')}</span> · {e.due_date}</p>
                    </div>
                    <Badge variant="amber">Due</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Clock/>} title="No upcoming deadlines">
                Renewals and filing dates show up here once they’re found in your documents.
              </EmptyState>
            )}
          </Card>
        )}

      </>)}
    </div>
  )
}

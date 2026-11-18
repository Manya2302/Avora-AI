'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FileText, Clock } from 'lucide-react'
import { contractsApi, complianceApi } from '@/lib/api'
import StatCard from '@/components/shared/StatCard'
import { Card, CardHeader } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'

const RISK_DOT: Record<string,string> = { critical:'bg-[#DC2626]', high:'bg-[#D97706]', medium:'bg-[#6B8DE3]', low:'bg-[#86C79A]' }

function Dot({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-[#5A5750]">
      <span className={cn('h-1.5 w-1.5 rounded-full', className || 'bg-[#A8A49A]')}/>{children}
    </span>
  )
}

export default function RiskDashboard() {
  const router = useRouter()
  const [risk, setRisk]     = useState<any>(null)
  const [renewals, setRenew] = useState<any[]>([])
  const [expiry, setExpiry]  = useState<any[]>([])
  const [recentRisks, setRecentRisks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      contractsApi.riskSummary().then(r=>setRisk(r.data)),
      contractsApi.renewals(90).then(r=>setRenew(r.data.renewals||[])),
      complianceApi.expiryAlerts().then(r=>setExpiry(r.data.results||[])),
      complianceApi.dashboard().then(r=>setRecentRisks(r.data.recent_risks||[])),
    ]).finally(()=>setLoading(false))
  }, [])

  const skeleton = <div className="space-y-2 p-4">{[0,1,2].map(i=><div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]"/>)}</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk"
        description="Contract risk, certificates close to expiry, and renewals coming up in the next 90 days."
      />

      {risk && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Critical risk"       value={risk.critical}    icon={<AlertTriangle/>} accent="red"   onClick={()=>router.push('/contracts?risk=critical')}/>
          <StatCard label="High risk"           value={risk.high}        icon={<AlertTriangle/>} accent="amber" onClick={()=>router.push('/contracts?risk=high')}/>
          <StatCard label="Expiring in 30 days" value={risk.expiring_30} icon={<Clock/>}         accent="amber"/>
          <StatCard label="Contracts"           value={risk.total}       icon={<FileText/>}      accent="blue"/>
        </div>
      )}

      {risk?.predictions?.length > 0 && (
        <Card>
          <CardHeader title="What to expect" subtitle="Likely issues, based on your current contracts and deadlines"/>
          <ul>
            {risk.predictions.map((p:any, i:number) => (
              <li key={i} className="flex items-start gap-3 border-t border-[#F1EFEA] px-5 py-3.5 first:border-0">
                <span className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', p.type === 'critical' ? 'bg-[#DC2626]' : p.type === 'warning' ? 'bg-[#D97706]' : 'bg-[#16A34A]')}/>
                <div className="min-w-0">
                  <h4 className="text-[14px] font-medium text-[#0E0D0A]">{p.title}</h4>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-[#5A5750]">{p.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming renewals" subtitle="Next 90 days" action={<button onClick={()=>router.push('/contracts')} className="link text-[13px]">All contracts</button>}/>
          {loading ? skeleton
          : renewals.length===0 ? <p className="px-5 py-8 text-center text-[13.5px] text-[#8A877F]">No renewals in the next 90 days.</p>
          : <ul>
            {renewals.map(r=>(
              <li key={r.contract_id} className="border-t border-[#F1EFEA] first:border-0">
                <button className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-[#FBFAF7]" onClick={()=>router.push(`/contracts/${r.contract_id}`)}>
                  <span className="w-12 shrink-0 text-right">
                    <span className={cn('font-display text-[20px] font-semibold leading-none tabular-nums', r.days_until<=30?'text-[#B91C1C]':'text-[#0E0D0A]')}>{r.days_until}</span>
                    <span className="ml-0.5 text-[12px] text-[#8A877F]">d</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-[#0E0D0A]">{r.title}</p>
                    <p className="text-[12.5px] text-[#8A877F]">{r.party_b||'—'} · {r.renewal_due}</p>
                  </div>
                  <Dot className={r.days_until<=30?'bg-[#DC2626]':r.days_until<=60?'bg-[#D97706]':'bg-[#A8A49A]'}>
                    {r.days_until<=30?'Urgent':r.days_until<=60?'Soon':'Upcoming'}
                  </Dot>
                </button>
              </li>
            ))}
          </ul>}
        </Card>

        <Card>
          <CardHeader title="Certificates expiring" action={<button onClick={()=>router.push('/compliance')} className="link text-[13px]">Compliance</button>}/>
          {loading ? skeleton
          : expiry.length===0 ? <p className="px-5 py-8 text-center text-[13.5px] text-[#8A877F]">Nothing expiring. All certificates are up to date.</p>
          : <ul>
            {expiry.slice(0,6).map(a=>(
              <li key={a.id} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0 hover:bg-[#FBFAF7]">
                <Clock className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75}/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#0E0D0A]">{a.doc_name}</p>
                  <p className="text-[12.5px] text-[#8A877F]"><span className="capitalize">{a.doc_type?.replace(/_/g,' ')}</span> · {a.expiry_date}</p>
                </div>
                <Dot className={a.days_until<0?'bg-[#DC2626]':a.days_until<=30?'bg-[#DC2626]':a.days_until<=60?'bg-[#D97706]':'bg-[#A8A49A]'}>
                  <span className="tabular-nums">{a.days_until<0?`Expired ${Math.abs(a.days_until)}d ago`:`${a.days_until}d left`}</span>
                </Dot>
              </li>
            ))}
          </ul>}
        </Card>
      </div>

      {risk && (
        <Card>
          <CardHeader title="Risk breakdown" subtitle="Select a level to see those contracts"/>
          <ul className="py-1.5">
            {[['critical',risk.critical],['high',risk.high],['medium',risk.medium],['low',risk.low]].map(([l,v])=>{
              const pct = risk.total_risks>0?Math.round(Number(v)/risk.total_risks*100):0
              return (
                <li key={String(l)}>
                  <button onClick={()=>router.push(`/contracts?risk=${l}`)}
                    className="flex w-full items-center gap-4 px-5 py-2.5 text-left hover:bg-[#FBFAF7]">
                    <span className="flex w-20 shrink-0 items-center gap-2 text-[13.5px] capitalize text-[#2B2924]">
                      <span className={cn('h-1.5 w-1.5 rounded-full', RISK_DOT[String(l)])}/>{String(l)}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ECEAE4]">
                      <span className={cn('block h-full rounded-full', RISK_DOT[String(l)])} style={{width:`${Math.min(pct,100)}%`}}/>
                    </span>
                    <span className="w-10 shrink-0 text-right font-display text-[20px] font-semibold leading-none tabular-nums text-[#0E0D0A]">{v}</span>
                    <span className="w-10 shrink-0 text-right text-[12.5px] tabular-nums text-[#8A877F]">{pct}%</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {recentRisks.length > 0 && (
        <Card>
          <CardHeader title="Recently found in documents" action={<button onClick={()=>router.push('/compliance')} className="link text-[13px]">Compliance</button>}/>
          <ul>
            {recentRisks.slice(0, 10).map((risk:any) => (
              <li key={risk.id} className="border-t border-[#F1EFEA] px-5 py-4 first:border-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#0E0D0A]">{risk.doc_name || 'Document'}</span>
                  <Dot className={risk.severity === 'critical' || risk.severity === 'high' ? 'bg-[#DC2626]' : 'bg-[#D97706]'}>
                    <span className="capitalize">{risk.severity}</span>
                  </Dot>
                  {risk.compliance_standard && <Badge variant="gray">{risk.compliance_standard}</Badge>}
                  <button onClick={async () => {
                     await complianceApi.dismissRisk(risk.id);
                     setRecentRisks(recentRisks.filter(r => r.id !== risk.id));
                  }} className="rounded-[6px] px-1.5 py-0.5 text-[12.5px] text-[#8A877F] transition-colors hover:bg-[#ECEAE4] hover:text-[#0E0D0A]">
                    Ignore
                  </button>
                </div>
                {risk.risk_type && <p className="mt-1 text-[13px] font-medium text-[#5A5750]">{risk.risk_type}</p>}
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#2B2924]">{risk.description}</p>

                {risk.location && (
                  <div className="mt-2.5 rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7] px-3 py-2">
                    <p className="mb-0.5 text-[12px] text-[#8A877F]">Where it was found</p>
                    <p className="text-[13px] leading-relaxed text-[#2B2924]">{risk.location}</p>
                  </div>
                )}

                {risk.suggested_fix && (
                  <div className="mt-2 rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7] px-3 py-2">
                    <p className="mb-0.5 flex items-center gap-1.5 text-[12px] text-[#15803D]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]"/>How to fix it
                    </p>
                    <p className="text-[13px] leading-relaxed text-[#2B2924]">{risk.suggested_fix}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

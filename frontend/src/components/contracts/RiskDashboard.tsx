'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, FileText, Clock, BrainCircuit, Activity } from 'lucide-react'
import { contractsApi, complianceApi } from '@/lib/api'
import StatCard from '@/components/shared/StatCard'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'

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

  const rl = (l:string) => ({critical:'text-red-600',high:'text-amber-600',medium:'text-blue-600',low:'text-green-600'}[l]||'text-[#0E0D0A]')
  const rb = (l:string) => ({critical:'bg-red-50 border-red-100',high:'bg-amber-50 border-amber-100',medium:'bg-blue-50 border-blue-100',low:'bg-green-50 border-green-100'}[l]||'bg-white border-[#DDD9D0]')

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-50 border border-red-100 rounded-[11px] flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-600"/>
        </div>
        <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Risk Dashboard</h2>
          <p className="text-sm text-[#9B9890]">Contract risks · Expiry alerts · Renewal calendar</p></div>
      </div>

      {risk && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <StatCard label="Critical Risk"   value={risk.critical}    icon={<AlertTriangle/>} accent="red"   onClick={()=>router.push('/contracts?risk=critical')}/>
          <StatCard label="High Risk"       value={risk.high}        icon={<AlertTriangle/>} accent="amber" onClick={()=>router.push('/contracts?risk=high')}/>
          <StatCard label="Expiring 90d"    value={risk.expiring_30} icon={<Clock/>}         accent="amber"/>
          <StatCard label="Total Contracts" value={risk.total}        icon={<FileText/>}      accent="blue"/>
        </div>
      )}

      {risk?.predictions?.length > 0 && (
        <Card className="border-[#1A3DAF]/20 bg-[#F7F9FF]">
          <CardHeader title="AI Predictive Intelligence" action={<Badge variant="blue"><BrainCircuit className="w-3 h-3 mr-1 inline" /> Forecasting Active</Badge>} />
          <div className="divide-y divide-[#ECEAE4]">
            {risk.predictions.map((p:any, i:number) => (
              <div key={i} className="px-5 py-4 flex gap-4 items-start hover:bg-white transition-colors cursor-default">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${p.type === 'critical' ? 'bg-red-100 text-red-600' : p.type === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                  {p.type === 'critical' ? <AlertTriangle className="w-4 h-4"/> : p.type === 'warning' ? <Activity className="w-4 h-4"/> : <BrainCircuit className="w-4 h-4"/>}
                </div>
                <div>
                  <h4 className={`text-sm font-bold mb-1 ${p.type === 'critical' ? 'text-red-700' : p.type === 'warning' ? 'text-amber-700' : 'text-green-700'}`}>{p.title}</h4>
                  <p className="text-[13px] text-[#5A5750] leading-relaxed">{p.message}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Upcoming Renewals" action={<button onClick={()=>router.push('/contracts')} className="text-xs text-[#1A3DAF] hover:underline">View all →</button>}/>
          {loading ? <div className="p-8 text-center text-sm text-[#9B9890]">Loading…</div>
          : renewals.length===0 ? <div className="p-8 text-center text-sm text-[#9B9890]">No renewals in next 90 days.</div>
          : <div className="divide-y divide-[#ECEAE4]">
            {renewals.map(r=>(
              <div key={r.contract_id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F7F5F0] cursor-pointer" onClick={()=>router.push(`/contracts/${r.contract_id}`)}>
                <div className={`w-10 h-10 rounded-[9px] flex items-center justify-center font-display text-sm font-bold flex-shrink-0 ${r.days_until<=30?'bg-red-50 text-red-600 border border-red-100':'bg-amber-50 text-amber-700 border border-amber-100'}`}>{r.days_until}d</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#0E0D0A] truncate">{r.title}</p>
                  <p className="font-mono text-[11px] text-[#9B9890]">{r.party_b||'—'} · {r.renewal_due}</p>
                </div>
                <Badge variant={r.days_until<=30?'red':r.days_until<=60?'amber':'gray'}>
                  {r.days_until<=30?'Urgent':r.days_until<=60?'Soon':'Upcoming'}
                </Badge>
              </div>
            ))}
          </div>}
        </Card>

        <Card>
          <CardHeader title="Certificate Expiry Alerts" action={<button onClick={()=>router.push('/compliance')} className="text-xs text-[#1A3DAF] hover:underline">Compliance →</button>}/>
          {loading ? <div className="p-8 text-center text-sm text-[#9B9890]">Loading…</div>
          : expiry.length===0 ? <div className="p-8 text-center text-sm text-[#9B9890]">No expiry alerts. All certificates up to date.</div>
          : <div className="divide-y divide-[#ECEAE4]">
            {expiry.slice(0,6).map(a=>(
              <div key={a.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F7F5F0]">
                <Clock className={`w-4 h-4 flex-shrink-0 ${a.days_until<0?'text-red-500':a.days_until<=30?'text-amber-500':'text-[#9B9890]'}`}/>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#0E0D0A] truncate">{a.doc_name}</p>
                  <p className="font-mono text-[11px] text-[#9B9890]">{a.doc_type?.replace(/_/g,' ')} · {a.expiry_date}</p>
                </div>
                <Badge variant={a.days_until<0?'red':a.days_until<=30?'red':a.days_until<=60?'amber':'gray'}>
                  {a.days_until<0?`Expired ${Math.abs(a.days_until)}d ago`:`${a.days_until}d left`}
                </Badge>
              </div>
            ))}
          </div>}
        </Card>
      </div>

      {risk && (
        <Card><CardHeader title="Risk Breakdown"/>
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[['critical',risk.critical],['high',risk.high],['medium',risk.medium],['low',risk.low]].map(([l,v])=>(
                <button key={String(l)} onClick={()=>router.push(`/contracts?risk=${l}`)}
                  className={`p-4 border rounded-[12px] text-center hover:shadow-md transition-all hover:-translate-y-0.5 ${rb(String(l))}`}>
                  <div className={`font-display text-3xl font-bold mb-1 ${rl(String(l))}`}>{v}</div>
                  <div className={`text-xs font-semibold capitalize ${rl(String(l))}`}>{l} Risk</div>
                  <div className="text-[11px] text-[#9B9890] mt-0.5">{risk.total_risks>0?Math.round(Number(v)/risk.total_risks*100):0}%</div>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {recentRisks.length > 0 && (
        <Card>
          <CardHeader title="Recent Detected Risks" action={<button onClick={()=>router.push('/compliance')} className="text-xs text-[#1A3DAF] hover:underline">View Compliance →</button>}/>
          <div className="divide-y divide-[#ECEAE4]">
            {recentRisks.slice(0, 10).map((risk:any) => (
              <div key={risk.id} className="p-5 hover:bg-[#F7F5F0]">
                <div className="flex items-center gap-3 mb-2">
                   <AlertTriangle className={`w-4 h-4 ${risk.severity === 'critical' ? 'text-red-600' : 'text-amber-500'}`} />
                   <p className="font-medium text-[#0E0D0A] flex-1">{risk.doc_name || 'Document'}</p>
                   <Badge variant={risk.severity === 'critical' || risk.severity === 'high' ? 'red' : 'amber'}>{risk.severity}</Badge>
                   <Badge variant="gray">{risk.compliance_standard}</Badge>
                   <button onClick={async () => {
                      await complianceApi.dismissRisk(risk.id);
                      setRecentRisks(recentRisks.filter(r => r.id !== risk.id));
                   }} className="text-xs text-[#9B9890] hover:text-[#1A3DAF] ml-1 font-medium transition-colors">
                     Ignore
                   </button>
                </div>
                <p className="text-xs font-semibold text-[#5A5750] mb-1 ml-7">{risk.risk_type}</p>
                <p className="text-sm font-light text-[#252318] leading-relaxed mb-3 ml-7">{risk.description}</p>
                
                {risk.location && (
                  <p className="text-xs font-mono text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200 ml-7 mb-3">
                    <strong className="block text-amber-900 mb-1 uppercase tracking-wide text-[10px]">Location / Problem Snippet</strong>
                    {risk.location}
                  </p>
                )}

                {risk.suggested_fix && (
                  <p className="text-xs font-mono text-green-700 bg-green-50 p-3 rounded-lg border border-green-200 ml-7">
                    <strong className="block text-green-800 mb-1 uppercase tracking-wide">How to Solve</strong>
                    {risk.suggested_fix}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

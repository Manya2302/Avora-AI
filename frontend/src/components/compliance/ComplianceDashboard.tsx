'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, AlertTriangle, CheckCircle2, Clock, FileX, Package, Sparkles, RefreshCw } from 'lucide-react'
import { complianceApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import type { ComplianceDashboard as CD } from '@/types'
import toast from 'react-hot-toast'

const PV: Record<string,any> = { critical:'red', high:'amber', medium:'blue', low:'gray' }
const SV: Record<string,any> = { compliant:'green', missing:'red', expiring_soon:'amber', expired:'red', needs_review:'amber' }

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
    try { await complianceApi.scan(data?.industry||'other'); toast.success('Scan complete!'); load() }
    catch { toast.error('Scan failed.') } finally { setScan(false) }
  }

  const sc = (s:number) => s>=80?'#16A34A':s>=60?'#D97706':'#DC2626'
  const gc = (g:string) => ({A:'text-green-600',B:'text-blue-600',C:'text-amber-600',D:'text-red-500',F:'text-red-700'}[g]||'text-[#0E0D0A]')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><Shield className="w-5 h-5 text-[#1A3DAF]"/></div>
          <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Compliance Dashboard</h2>
            <p className="text-sm text-[#9B9890]">Avora AI compliance health monitor</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={()=>router.push('/compliance/audit-package')}><Package className="w-3.5 h-3.5"/> Audit Package</Button>
          <Button variant="ghost" size="sm" onClick={()=>router.push('/compliance/copilot')}><Sparkles className="w-3.5 h-3.5"/> Copilot</Button>
          <Button size="sm" loading={scanning} onClick={runScan}><RefreshCw className="w-3.5 h-3.5"/> Run Scan</Button>
        </div>
      </div>

      {loading ? <div className="h-40 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse"/> : data && (<>
        {/* Score hero */}
        <div className="bg-[#0C0B09] rounded-[16px] p-7 relative overflow-hidden">
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#1A3DAF]/10 rounded-full blur-3xl pointer-events-none"/>
          <div className="relative z-10 flex items-center gap-8 flex-wrap">
            <div className="relative flex-shrink-0">
              <svg width="110" height="110" viewBox="0 0 110 110" className="-rotate-90">
                <circle cx="55" cy="55" r="45" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9"/>
                <circle cx="55" cy="55" r="45" fill="none" stroke={sc(data.score)} strokeWidth="9"
                  strokeLinecap="round" strokeDasharray="283"
                  strokeDashoffset={283-(283*data.score/100)} className="transition-all duration-1000"/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-2xl font-bold text-white">{Math.round(data.score)}</span>
                <span className="font-mono text-[9px] text-white/40">/ 100</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <span className={`font-display text-4xl font-bold ${gc(data.grade)}`}>{data.grade}</span>
                <div><p className="text-white/85 font-semibold">Compliance Score</p>
                  <p className="text-white/40 text-xs capitalize">{data.industry?.replace('_',' ')} · {data.total_checks} checks</p></div>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full w-64 mb-2">
                <div className="h-full rounded-full transition-all duration-1000" style={{width:`${data.audit_readiness}%`,background:sc(data.audit_readiness)}}/>
              </div>
              <p className="text-white/45 text-sm">{data.recommendation}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[{l:'Readiness',v:`${Math.round(data.audit_readiness)}%`,c:data.audit_readiness>=80?'text-green-400':'text-amber-400'},
                {l:'Compliant',v:data.compliant,c:'text-green-400'},
                {l:'Missing',v:data.missing_count,c:'text-red-400'},
                {l:'Critical',v:data.critical_missing,c:'text-red-500'}].map(s=>(
                <div key={s.l} className="text-center">
                  <div className={`font-display text-2xl font-bold ${s.c}`}>{s.v}</div>
                  <div className="text-white/30 text-[10px] font-mono">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alerts */}
        {data.critical_missing > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-[12px]">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0"/>
            <div className="flex-1"><p className="font-semibold text-red-700 text-sm">{data.critical_missing} Critical Documents Missing</p>
              <p className="text-xs text-red-600/70">Mandatory for your industry — upload immediately.</p></div>
            <Button variant="red" size="sm" onClick={()=>router.push('/upload')}>Upload Now</Button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[11px] p-1">
          {[['overview','Overview'],['checks','All Checks'],['timeline','Timeline']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k as any)}
              className={`flex-1 py-2 rounded-[8px] text-xs font-medium transition-all ${tab===k?'bg-white text-[#0E0D0A] shadow-sm':'text-[#9B9890]'}`}>{l}</button>
          ))}
        </div>

        {tab==='overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Missing Documents" action={<span className="font-mono text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{data.missing_count} missing</span>}/>
              <div className="divide-y divide-[#ECEAE4]">
                {data.missing?.slice(0,6).map((m,i)=>(
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <FileX className="w-4 h-4 text-red-400 flex-shrink-0"/>
                    <span className="text-sm text-[#0E0D0A] flex-1">{m.name}</span>
                    <Badge variant={PV[m.priority]}>{m.priority}</Badge>
                  </div>
                ))}
                {!data.missing?.length && <div className="p-8 text-center text-sm text-[#9B9890]">✓ No missing documents</div>}
              </div>
            </Card>
            <Card>
              <CardHeader title="By Priority"/>
              <CardBody className="space-y-3">
                {['critical','high','medium','low'].map(p=>{
                  const pc=data.checks?.filter(c=>c.priority===p)||[]
                  const ok=pc.filter(c=>c.status==='compliant').length
                  const pct=pc.length?Math.round(ok/pc.length*100):100
                  return (<div key={p}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-semibold capitalize text-[#5A5750]">{p}</span>
                      <span className="font-mono text-xs">{ok}/{pc.length} · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#ECEAE4] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct===100?'bg-green-500':pct>=60?'bg-amber-400':'bg-red-500'}`} style={{width:`${pct}%`}}/>
                    </div>
                  </div>)
                })}
              </CardBody>
            </Card>
          </div>
        )}

        {tab==='checks' && (
          <Card>
            <CardHeader title="All Compliance Checks" action={<span className="font-mono text-[10px] text-[#9B9890]">{data.checks?.length} checks</span>}/>
            <div className="divide-y divide-[#ECEAE4]">
              {data.checks?.map((c,i)=>(
                <div key={i} className="px-5 py-4 hover:bg-[#F7F5F0]">
                  <div className="flex items-center gap-3 mb-2">
                    {c.status==='compliant'
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0"/>
                      : <FileX className="w-4 h-4 text-red-400 flex-shrink-0"/>}
                    <span className="text-sm text-[#0E0D0A] font-medium flex-1">{c.name}</span>
                    <Badge variant={PV[c.priority]}>{c.priority}</Badge>
                    <Badge variant={SV[c.status]||'gray'}>{c.status.replace('_',' ')}</Badge>
                    {c.id && c.id !== "0" && (
                      <button onClick={async () => {
                        await complianceApi.dismissFact(c.id);
                        toast.success("Check ignored.");
                        load();
                      }} className="text-xs text-[#9B9890] hover:text-[#1A3DAF] ml-2 font-medium transition-colors">
                        Ignore
                      </button>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-[13px] text-[#5A5750] ml-7 mb-2">{c.description}</p>
                  )}
                  {c.location && (
                    <p className="text-xs font-mono text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 ml-7">
                      <strong className="block text-amber-900 mb-1 uppercase tracking-wide text-[10px]">Location / Snippet</strong>
                      {c.location}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab==='timeline' && (
          <Card>
            <CardHeader title="Upcoming Events"/>
            {data.upcoming_events?.length ? (
              <div className="divide-y divide-[#ECEAE4]">
                {data.upcoming_events.map((e:any)=>(
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <Clock className="w-4 h-4 text-[#9B9890] flex-shrink-0"/>
                    <div className="flex-1"><p className="text-sm font-medium text-[#0E0D0A]">{e.title}</p>
                      <p className="font-mono text-[11px] text-[#9B9890]">{e.event_type?.replace('_',' ')} · {e.due_date}</p></div>
                    <Badge variant="amber">Due</Badge>
                  </div>
                ))}
              </div>
            ) : <CardBody className="text-center py-10 text-sm text-[#9B9890]">No upcoming compliance events.</CardBody>}
          </Card>
        )}
        
      </>)}
    </div>
  )
}

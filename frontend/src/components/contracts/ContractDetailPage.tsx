'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, FileText, Zap } from 'lucide-react'
import { contractsApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import { formatDate } from '@/lib/utils'

const RV: Record<string,any> = { critical:'red', high:'amber', medium:'blue', low:'green' }
const FC: Record<string,string> = { red:'bg-red-50 border-red-100', yellow:'bg-amber-50 border-amber-100', green:'bg-green-50 border-green-100' }
const SV: Record<string,any> = { critical:'red', high:'red', medium:'amber', low:'blue', info:'gray' }

export default function ContractDetailPage({ id }: { id: string }) {
  const router = useRouter()
  const [contract, setContract] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [ana, setAna]           = useState(false)
  const [tab, setTab]           = useState<'overview'|'clauses'|'risks'|'renewal'>('overview')

  useEffect(() => {
    if (!id) return
    contractsApi.detail(id).then(r=>setContract(r.data)).catch(()=>{}).finally(()=>setLoading(false))
  }, [id])

  const analyze = async () => {
    if (!contract?.document_id) return
    setAna(true)
    try {
      await contractsApi.analyze(contract.document_id)
      contractsApi.detail(id).then(r=>setContract(r.data))
    } catch {} finally { setAna(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-sm text-[#9B9890]">Loading contract…</div>
  if (!contract) return <div className="text-center py-20 text-sm text-[#9B9890]">Contract not found.</div>

  return (
    <div className="space-y-5 max-w-5xl">
      <button onClick={()=>router.back()} className="flex items-center gap-2 text-sm text-[#9B9890] hover:text-[#0E0D0A]"><ArrowLeft className="w-4 h-4"/> Back</button>

      <div className="bg-[#0C0B09] rounded-[16px] p-7 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#1A3DAF]/10 rounded-full blur-3xl pointer-events-none"/>
        <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <p className="font-mono text-[10px] text-[#7B9FE8] uppercase tracking-[1.5px] mb-2">{contract.contract_type||'Contract'}</p>
            <h2 className="font-display text-2xl font-bold text-white/92 mb-2">{contract.title}</h2>
            {(contract.party_a||contract.party_b) && <p className="text-white/45 text-sm mb-4">{contract.party_a} {contract.party_a&&contract.party_b?'↔':''} {contract.party_b}</p>}
            <div className="flex gap-2 flex-wrap">
              <Badge variant={RV[contract.risk_level]}>{contract.risk_level} risk</Badge>
              {contract.risks?.length>0 && <span className="font-mono text-[9.5px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/20">{contract.risks.length} risks</span>}
              <span className="font-mono text-[9.5px] px-2 py-0.5 rounded-full bg-white/8 text-white/40 border border-white/10">{contract.status}</span>
            </div>
          </div>
          <Button loading={ana} onClick={analyze} className="bg-white text-[#0E0D0A] border-white hover:bg-[#F7F5F0]" size="sm"><Zap className="w-3.5 h-3.5"/> Re-Analyze</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{l:'Effective',v:contract.effective_date?formatDate(contract.effective_date):'—'},
          {l:'Expiry',v:contract.expiry_date?formatDate(contract.expiry_date):'—',warn:contract.renewal?.days_until<=60},
          {l:'Value',v:contract.contract_value?`${contract.currency} ${Number(contract.contract_value).toLocaleString()}`:'—'},
          {l:'Notice Period',v:contract.notice_period_days?`${contract.notice_period_days}d`:'—'}].map(f=>(
          <div key={f.l} className={`p-3.5 border rounded-[11px] ${f.warn?'bg-amber-50 border-amber-100':'bg-white border-[#DDD9D0]'}`}>
            <p className="font-mono text-[10px] text-[#9B9890] mb-1">{f.l}</p>
            <p className={`text-sm font-semibold ${f.warn?'text-amber-700':'text-[#0E0D0A]'}`}>{f.v}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[11px] p-1">
        {[['overview','Overview'],['clauses','Clauses'],['risks','Risks'],['renewal','Renewal']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k as any)}
            className={`flex-1 py-2 rounded-[8px] text-xs font-medium transition-all ${tab===k?'bg-white text-[#0E0D0A] shadow-sm':'text-[#9B9890]'}`}>{l}</button>
        ))}
      </div>

      {tab==='overview' && contract.key_obligations?.length>0 && (
        <Card><CardHeader title="Key Obligations"/>
          <CardBody><ul className="space-y-2">{contract.key_obligations.map((o:string,i:number)=>(
            <li key={i} className="flex items-start gap-2.5 text-sm text-[#5A5750]">
              <div className="w-5 h-5 rounded-full bg-[#EBF0FF] flex items-center justify-center font-mono text-[9px] font-bold text-[#1A3DAF] flex-shrink-0 mt-0.5">{i+1}</div>{o}
            </li>
          ))}</ul></CardBody>
        </Card>
      )}

      {tab==='clauses' && (
        <div className="space-y-3">
          {!contract.clauses?.length ? <div className="text-center py-12 text-sm text-[#9B9890]">No clauses extracted. Click Re-Analyze.</div>
          : contract.clauses.map((c:any)=>(
            <div key={c.id} className={`p-4 border rounded-[12px] ${FC[c.risk_flag]}`}>
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <span className="font-semibold text-[#0E0D0A] text-sm">{c.title}</span>
                <Badge variant={c.risk_flag==='red'?'red':c.risk_flag==='yellow'?'amber':'green'}>{c.risk_flag} risk</Badge>
              </div>
              {c.ai_summary && <p className="text-xs text-[#5A5750] mb-2">{c.ai_summary}</p>}
              {c.risk_reason && <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-[6px]">⚠ {c.risk_reason}</p>}
            </div>
          ))}
        </div>
      )}

      {tab==='risks' && (
        <div className="space-y-3">
          {!contract.risks?.length ? <div className="text-center py-12 text-sm text-[#9B9890]">No risks detected. Click Re-Analyze.</div>
          : contract.risks.map((r:any)=>(
            <div key={r.id} className="p-4 bg-white border border-[#DDD9D0] rounded-[12px]">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${r.severity==='critical'||r.severity==='high'?'text-red-500':r.severity==='medium'?'text-amber-500':'text-blue-500'}`}/>
                  <span className="font-semibold text-[#0E0D0A] text-sm">{r.title}</span>
                </div>
                <div className="flex gap-1.5">
                  <Badge variant={SV[r.severity]}>{r.severity}</Badge>
                  <Badge variant="gray">{r.category}</Badge>
                </div>
              </div>
              <p className="text-xs text-[#5A5750] mb-2">{r.description}</p>
              {r.recommendation && <div className="flex items-start gap-2 p-2.5 bg-[#EBF0FF] rounded-[8px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1A3DAF] flex-shrink-0 mt-0.5"/>
                <p className="text-xs text-[#1A3DAF]">{r.recommendation}</p>
              </div>}
            </div>
          ))}
        </div>
      )}

      {tab==='renewal' && (
        <Card><CardHeader title="Renewal Tracking"/>
          <CardBody>
            {!contract.renewal ? <p className="text-sm text-[#9B9890] text-center py-8">No renewal data. Add an expiry date first.</p>
            : <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[{l:'Renewal Due',v:formatDate(contract.renewal.renewal_due)},
                  {l:'Notice Deadline',v:contract.renewal.notice_deadline?formatDate(contract.renewal.notice_deadline):'—'},
                  {l:'Days Until',v:`${contract.renewal.days_until}d`,warn:contract.renewal.days_until<=30}].map(f=>(
                  <div key={f.l} className={`p-3 rounded-[9px] border text-center ${f.warn?'bg-red-50 border-red-100':'bg-[#F7F5F0] border-[#ECEAE4]'}`}>
                    <p className="font-mono text-[10px] text-[#9B9890] mb-1">{f.l}</p>
                    <p className={`font-semibold text-sm ${f.warn?'text-red-600':'text-[#0E0D0A]'}`}>{f.v}</p>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-semibold text-[#0E0D0A] mb-2 block">Renewal Decision</label>
                <div className="flex gap-2">
                  {['renew','negotiate','terminate','pending'].map(a=>(
                    <button key={a} onClick={()=>contractsApi.updateRenewal(contract.renewal.id,{action:a})}
                      className={`px-3 py-2 rounded-[8px] text-xs font-medium border transition-all capitalize ${contract.renewal.action===a?'bg-[#0E0D0A] text-white border-[#0E0D0A]':'bg-white border-[#DDD9D0] text-[#5A5750] hover:border-[#0E0D0A]'}`}>{a}</button>
                  ))}
                </div>
              </div>
            </div>}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

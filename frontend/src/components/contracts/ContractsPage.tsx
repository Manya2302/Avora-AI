'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, AlertTriangle, Clock, Search, Zap } from 'lucide-react'
import { contractsApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import StatCard from '@/components/shared/StatCard'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import { formatDate } from '@/lib/utils'
import type { ContractItem, ContractRiskSummary } from '@/types'

const RV: Record<string,any> = { critical:'red', high:'amber', medium:'blue', low:'green' }
const SV: Record<string,any> = { active:'green', expiring:'amber', expired:'red', draft:'gray', terminated:'gray' }

export default function ContractsPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<ContractItem[]>([])
  const [summary, setSummary]     = useState<ContractRiskSummary | null>(null)
  const [renewals, setRenewals]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('')
  const [search, setSearch]       = useState('')

  useEffect(() => {
    Promise.all([
      contractsApi.list().then(r=>setContracts(r.data.results||[])),
      contractsApi.riskSummary().then(r=>setSummary(r.data)),
      contractsApi.renewals(60).then(r=>setRenewals(r.data.renewals||[])),
    ]).finally(()=>setLoading(false))
  }, [])

  const filtered = contracts.filter(c =>
    (!filter||c.risk_level===filter) &&
    (!search||c.title.toLowerCase().includes(search.toLowerCase())||c.party_b?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><FileText className="w-5 h-5 text-[#1A3DAF]"/></div>
          <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Contract Intelligence</h2>
            <p className="text-sm text-[#9B9890]">AI clause analysis · Risk detection · Renewal tracking</p></div>
        </div>
        <Button size="sm" onClick={()=>router.push('/documents')}><Zap className="w-3.5 h-3.5"/> Analyze Contract</Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <StatCard label="Total Contracts"  value={summary.total}                      icon={<FileText/>}     accent="blue"/>
          <StatCard label="High/Critical"    value={summary.critical+summary.high}      icon={<AlertTriangle/>} accent="red"/>
          <StatCard label="Expiring 30d"     value={summary.expiring_30}                icon={<Clock/>}        accent="amber"/>
          <StatCard label="Auto-Renewal"     value={summary.auto_renewal}               icon={<FileText/>}     accent="purple"/>
        </div>
      )}

      {renewals.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-[13px] p-4">
          <p className="font-semibold text-amber-700 text-sm mb-3"><Clock className="w-4 h-4 inline mr-1.5"/>{renewals.length} contract{renewals.length>1?'s':''} need renewal action in 60 days</p>
          <div className="space-y-2">
            {renewals.slice(0,3).map(r=>(
              <div key={r.contract_id} className="flex items-center justify-between gap-3 p-3 bg-white border border-amber-100 rounded-[9px]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0E0D0A] truncate">{r.title}</p>
                  <p className="font-mono text-[11px] text-[#9B9890]">{r.party_b} · Due: {r.renewal_due} · <strong className={r.days_until<=30?'text-red-600':'text-amber-600'}>{r.days_until}d</strong></p>
                </div>
                <Button variant="ghost" size="sm" onClick={()=>router.push(`/contracts/${r.contract_id}`)}>Review</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-[#DDD9D0] rounded-[7px] flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-[#9B9890]"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contracts…"
            className="flex-1 border-none outline-none text-sm bg-transparent text-[#0E0D0A] placeholder:text-[#9B9890]"/>
        </div>
        {['','critical','high','medium','low'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${filter===f?'bg-[#0E0D0A] text-white border-[#0E0D0A]':'bg-white border-[#DDD9D0] text-[#5A5750] hover:border-[#0E0D0A]'}`}>
            {f||'All Risks'}
          </button>
        ))}
        <span className="font-mono text-xs text-[#9B9890] ml-auto">{filtered.length} contracts</span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#DDD9D0] bg-[#F7F5F0]">
                {['Contract','Type','Party','Expiry','Value','Risk','Status',''].map(h=>(
                  <th key={h} className="px-4 py-2.5 text-left font-mono text-[10px] font-semibold text-[#9B9890] uppercase tracking-[0.6px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="p-10 text-center text-sm text-[#9B9890]">Loading…</td></tr>
              : filtered.length===0 ? (
                <tr><td colSpan={8} className="p-12 text-center">
                  <FileText className="w-10 h-10 text-[#DDD9D0] mx-auto mb-3"/>
                  <p className="text-sm text-[#9B9890]">No contracts yet. Upload a contract document and click Analyze.</p>
                </td></tr>
              ) : filtered.map(c=>(
                <tr key={c.id} className="border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0] cursor-pointer" onClick={()=>router.push(`/contracts/${c.id}`)}>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-[13px] font-medium text-[#0E0D0A] truncate">{c.title}</p>
                    {c.risk_count>0 && <p className="text-[11px] text-red-500 font-mono">{c.risk_count} risks</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#5A5750]">{c.contract_type||'—'}</td>
                  <td className="px-4 py-3 text-xs text-[#5A5750] max-w-[120px] truncate">{c.party_b||c.party_a||'—'}</td>
                  <td className="px-4 py-3 font-mono text-[11px] whitespace-nowrap">
                    {c.expiry_date ? (
                      <span className={c.days_to_expiry!==null&&c.days_to_expiry<=30?'text-red-600 font-semibold':c.days_to_expiry!==null&&c.days_to_expiry<=60?'text-amber-600':''}>
                        {formatDate(c.expiry_date)}{c.days_to_expiry!==null&&c.days_to_expiry<=60&&<span className="ml-1">({c.days_to_expiry}d)</span>}
                      </span>
                    ):'—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">{c.contract_value?`${c.currency} ${Number(c.contract_value).toLocaleString()}`:'—'}</td>
                  <td className="px-4 py-3"><Badge variant={RV[c.risk_level]}>{c.risk_level}</Badge></td>
                  <td className="px-4 py-3"><Badge variant={SV[c.status]}>{c.status}</Badge></td>
                  <td className="px-4 py-3"><Button variant="ghost" size="sm" onClick={e=>{e.stopPropagation();router.push(`/contracts/${c.id}`)}}>View →</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

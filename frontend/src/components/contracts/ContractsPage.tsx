'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FileText, AlertTriangle, Clock, Search, Zap, RefreshCw } from 'lucide-react'
import { contractsApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import StatCard from '@/components/shared/StatCard'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { cn, formatDate } from '@/lib/utils'
import type { ContractItem, ContractRiskSummary } from '@/types'
import toast from 'react-hot-toast'

/** Risk reads as a dot + word rather than a coloured pill. */
const RISK_DOT: Record<string,string> = { critical:'bg-[#DC2626]', high:'bg-[#D97706]', medium:'bg-[#6B8DE3]', low:'bg-[#86C79A]' }
const SV: Record<string,any> = { active:'green', expiring:'amber', expired:'red', draft:'gray', terminated:'gray' }

const RISK_LEVELS = ['critical','high','medium','low']

export default function ContractsPage() {
  // useSearchParams needs a Suspense boundary in Next 14
  return <Suspense fallback={null}><ContractsPageInner/></Suspense>
}

function ContractsPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const riskParam = params.get('risk') || ''
  const [contracts, setContracts] = useState<ContractItem[]>([])
  const [summary, setSummary]     = useState<ContractRiskSummary | null>(null)
  const [renewals, setRenewals]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState(RISK_LEVELS.includes(riskParam) ? riskParam : '')
  const [search, setSearch]       = useState('')

  // Follow ?risk= when it changes (e.g. links from the risk dashboard)
  useEffect(() => { setFilter(RISK_LEVELS.includes(riskParam) ? riskParam : '') }, [riskParam])

  useEffect(() => {
    contractsApi.riskSummary().then(r=>setSummary(r.data)).catch(()=>{})
    contractsApi.renewals(60).then(r=>setRenewals(r.data.renewals||[])).catch(()=>{})
  }, [])

  // Risk filter is applied server-side so it isn't limited to the first page of results
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    contractsApi.list(filter ? { risk: filter } : undefined)
      .then(r=>{ if (!cancelled) setContracts(r.data.results||[]) })
      .catch(()=>{ if (!cancelled) { setContracts([]); toast.error('Couldn’t load contracts. Try again.') } })
      .finally(()=>{ if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filter])

  const filtered = contracts.filter(c =>
    (!filter||c.risk_level===filter) &&
    (!search||c.title.toLowerCase().includes(search.toLowerCase())||c.party_b?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contracts"
        description="Clause-by-clause review, risk flags and renewal dates for the contracts in your vault."
        actions={<Button size="sm" onClick={()=>router.push('/documents')}><Zap className="h-3.5 w-3.5"/> Analyse a contract</Button>}
      />

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Contracts"             value={summary.total}                 icon={<FileText/>}      accent="blue"/>
          <StatCard label="High or critical risk" value={summary.critical+summary.high} icon={<AlertTriangle/>} accent="red"/>
          <StatCard label="Expiring in 30 days"   value={summary.expiring_30}           icon={<Clock/>}         accent="amber"/>
          <StatCard label="Auto-renewing"         value={summary.auto_renewal}          icon={<RefreshCw/>}     accent="purple"/>
        </div>
      )}

      {renewals.length > 0 && (
        <div className="overflow-hidden rounded-[12px] border border-[#EAD9B8] bg-[#FDF8EE]">
          <div className="px-4 pt-3 text-[12.5px] font-medium text-[#8A5A0B]">
            {renewals.length} contract{renewals.length>1?'s need':' needs'} a renewal decision in the next 60 days
          </div>
          <ul className="py-1.5">
            {renewals.slice(0,3).map(r=>(
              <li key={r.contract_id} className="flex items-center gap-3 px-4 py-2">
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', r.days_until<=30?'bg-[#DC2626]':'bg-[#D97706]')}/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-[#2B2924]">{r.title}</p>
                  <p className="text-[12.5px] text-[#8A877F]">
                    {r.party_b} · due {r.renewal_due} · <span className="tabular-nums text-[#5A5750]">{r.days_until} days left</span>
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={()=>router.push(`/contracts/${r.contract_id}`)}>Review</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ECEAE4] p-3">
          <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <span className="sr-only">Search contracts</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A877F]"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by title or party" className="field h-9 pl-9"/>
          </label>
          <div className="inline-flex rounded-[8px] border border-[#DDD9D0] bg-white p-0.5" role="group" aria-label="Filter by risk">
            {['','critical','high','medium','low'].map(f=>(
              <button key={f} onClick={()=>setFilter(f)} aria-pressed={filter===f}
                className={cn(
                  'h-7 rounded-[6px] px-2.5 text-[13px] capitalize transition-colors',
                  filter===f ? 'bg-[#F1EFEA] font-medium text-[#0E0D0A]' : 'text-[#5A5750] hover:text-[#0E0D0A]'
                )}>
                {f||'All'}
              </button>
            ))}
          </div>
          <span className="ml-auto text-[12.5px] tabular-nums text-[#8A877F]">{filtered.length} contract{filtered.length===1?'':'s'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[14px]">
            <thead>
              <tr className="text-[12.5px] text-[#8A877F]">
                {['Contract','Type','Party','Expiry','Value','Risk','Status',''].map(h=>(
                  <th key={h} className="whitespace-nowrap px-4 py-2.5 font-normal first:pl-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="border-t border-[#F1EFEA] p-5">
                  <div className="space-y-2">{[0,1,2].map(i=><div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]"/>)}</div>
                </td></tr>
              ) : filtered.length===0 ? (
                <tr><td colSpan={8} className="border-t border-[#F1EFEA]">
                  {contracts.length===0 && !filter && !search ? (
                    <EmptyState icon={<FileText/>} title="No contracts yet">
                      Upload a contract, then choose Analyse on it to get a clause-by-clause risk review.
                    </EmptyState>
                  ) : (
                    <p className="px-5 py-8 text-center text-[13.5px] text-[#8A877F]">No contracts match that search or filter.</p>
                  )}
                </td></tr>
              ) : filtered.map(c=>(
                <tr key={c.id} className="cursor-pointer border-t border-[#F1EFEA] hover:bg-[#FBFAF7]" onClick={()=>router.push(`/contracts/${c.id}`)}>
                  <td className="max-w-[240px] py-3 pl-5 pr-4">
                    <p className="truncate font-medium text-[#0E0D0A]">{c.title}</p>
                    {c.risk_count>0 && <p className="text-[12.5px] text-[#8A877F]">{c.risk_count} risk{c.risk_count>1?'s':''} found</p>}
                  </td>
                  <td className="px-4 py-3 text-[13.5px] capitalize text-[#5A5750]">{c.contract_type||'—'}</td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-[13.5px] text-[#5A5750]">{c.party_b||c.party_a||'—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-[13.5px] tabular-nums">
                    {c.expiry_date ? (
                      <span className={c.days_to_expiry!==null&&c.days_to_expiry<=30?'font-medium text-[#B91C1C]':c.days_to_expiry!==null&&c.days_to_expiry<=60?'text-[#A35A04]':'text-[#2B2924]'}>
                        {formatDate(c.expiry_date)}{c.days_to_expiry!==null&&c.days_to_expiry<=60&&<span className="ml-1 text-[12.5px]">({c.days_to_expiry}d)</span>}
                      </span>
                    ):<span className="text-[#8A877F]">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[13.5px] tabular-nums text-[#2B2924]">{c.contract_value?`${c.currency} ${Number(c.contract_value).toLocaleString()}`:<span className="text-[#8A877F]">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[13px] capitalize text-[#2B2924]">
                      <span className={cn('h-1.5 w-1.5 rounded-full', RISK_DOT[c.risk_level]||'bg-[#A8A49A]')}/>{c.risk_level}
                    </span>
                  </td>
                  <td className="px-4 py-3"><Badge variant={SV[c.status]}><span className="capitalize">{c.status}</span></Badge></td>
                  <td className="px-4 py-3 text-right"><Button variant="plain" size="sm" onClick={e=>{e.stopPropagation();router.push(`/contracts/${c.id}`)}}>View</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

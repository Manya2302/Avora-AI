'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Zap } from 'lucide-react'
import { contractsApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import EmptyState from '@/components/shared/EmptyState'
import { cn, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

/** Severity as a small dot + word. */
const SEV_DOT: Record<string,string> = { critical:'bg-[#DC2626]', high:'bg-[#DC2626]', medium:'bg-[#D97706]', low:'bg-[#6B8DE3]', info:'bg-[#A8A49A]' }
const RISK_DOT: Record<string,string> = { critical:'bg-[#DC2626]', high:'bg-[#D97706]', medium:'bg-[#6B8DE3]', low:'bg-[#86C79A]' }
const FLAG: Record<string,{ dot:string; label:string }> = {
  red:    { dot:'bg-[#DC2626]', label:'High risk' },
  yellow: { dot:'bg-[#D97706]', label:'Worth a look' },
  green:  { dot:'bg-[#16A34A]', label:'Standard' },
}

function Dot({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] capitalize text-[#5A5750]">
      <span className={cn('h-1.5 w-1.5 rounded-full', className || 'bg-[#A8A49A]')}/>{children}
    </span>
  )
}

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

  const [savingAction, setSavingAction] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  const refresh = () => contractsApi.detail(id).then(r => { setContract(r.data); return r.data })

  const analyze = async () => {
    if (!contract?.document_id) return
    setAna(true)
    try {
      await contractsApi.analyze(contract.document_id)
      toast.success('Re-analysis started. This page updates when it finishes.')
      // Analysis runs in the background — poll until it is no longer running (max ~3 minutes)
      let tries = 0
      const poll = () => {
        pollRef.current = setTimeout(async () => {
          tries += 1
          try {
            const c = await refresh()
            if (c?.analysis_status === 'running' && tries < 60) return poll()
            if (c?.analysis_status === 'failed') toast.error('Re-analysis failed. Try again later.')
            else if (c?.analysis_status === 'running') toast('Re-analysis is still running. Check back shortly.')
            else toast.success('Contract re-analysed.')
          } catch {
            toast.error('Couldn’t refresh the contract.')
          }
          setAna(false)
        }, 3000)
      }
      poll()
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Couldn’t start re-analysis. Try again.')
      setAna(false)
    }
  }

  const setRenewalAction = async (action: string) => {
    if (!contract?.renewal?.id || savingAction) return
    setSavingAction(action)
    try {
      await contractsApi.updateRenewal(contract.renewal.id, { action })
      await refresh()
      toast.success(`Renewal decision set to ${action}.`)
    } catch {
      toast.error('Couldn’t save the renewal decision. Try again.')
    } finally { setSavingAction(null) }
  }

  if (loading) return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded-[6px] bg-[#ECEAE4]"/>
      <Card><div className="space-y-3 p-5">{[0,1,2].map(i=><div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]"/>)}</div></Card>
    </div>
  )
  if (!contract) return (
    <Card>
      <EmptyState icon={<FileText/>} title="Contract not found"
        action={<Button variant="ghost" size="sm" onClick={()=>router.back()}><ArrowLeft className="h-3.5 w-3.5"/> Go back</Button>}>
        It may have been deleted, or you may not have access to it.
      </EmptyState>
    </Card>
  )

  const tabs: [string, string, number | undefined][] = [
    ['overview','Overview', undefined],
    ['clauses','Clauses', contract.clauses?.length],
    ['risks','Risks', contract.risks?.length],
    ['renewal','Renewal', undefined],
  ]

  return (
    <div className="space-y-6">
      <div>
        <button onClick={()=>router.back()} className="-ml-1 mb-3 inline-flex items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-[13px] text-[#8A877F] hover:text-[#0E0D0A]">
          <ArrowLeft className="h-3.5 w-3.5"/> Back
        </button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-[13px] capitalize text-[#8A877F]">{contract.contract_type||'Contract'}</p>
            <h1 className="page-title">{contract.title}</h1>
            {(contract.party_a||contract.party_b) && (
              <p className="page-subtitle">{contract.party_a} {contract.party_a&&contract.party_b?'·':''} {contract.party_b}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-1.5 text-[13px] capitalize text-[#2B2924]">
                <span className={cn('h-1.5 w-1.5 rounded-full', RISK_DOT[contract.risk_level]||'bg-[#A8A49A]')}/>{contract.risk_level} risk
              </span>
              {contract.risks?.length>0 && <span className="text-[13px] text-[#5A5750]">{contract.risks.length} risk{contract.risks.length>1?'s':''} found</span>}
              <Badge variant="gray"><span className="capitalize">{contract.status}</span></Badge>
            </div>
          </div>
          <Button variant="ghost" size="sm" loading={ana} onClick={analyze}><Zap className="h-3.5 w-3.5"/> Re-analyse</Button>
        </div>
      </div>

      <Card>
        <dl className="grid grid-cols-2 md:grid-cols-4">
          {[{l:'Effective',v:contract.effective_date?formatDate(contract.effective_date):'—'},
            {l:'Expiry',v:contract.expiry_date?formatDate(contract.expiry_date):'—',warn:contract.renewal?.days_until<=60},
            {l:'Value',v:contract.contract_value?`${contract.currency} ${Number(contract.contract_value).toLocaleString()}`:'—'},
            {l:'Notice period',v:contract.notice_period_days?`${contract.notice_period_days} days`:'—'}].map((f,i)=>(
            <div key={f.l} className={cn('px-5 py-4', i%2===1 && 'border-l border-[#F1EFEA]', i>=2 && 'border-t border-[#F1EFEA] md:border-t-0', i>=1 && 'md:border-l md:border-[#F1EFEA]')}>
              <dt className="flex items-center gap-1.5 text-[12.5px] text-[#8A877F]">
                {f.warn && <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]"/>}{f.l}
              </dt>
              <dd className={cn('mt-1 text-[14px] font-medium tabular-nums', f.warn?'text-[#A35A04]':'text-[#0E0D0A]')}>{f.v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="flex gap-6 overflow-x-auto border-b border-[#DDD9D0]" role="tablist">
        {tabs.map(([k,l,n])=>(
          <button key={k} role="tab" aria-selected={tab===k} onClick={()=>setTab(k as any)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2.5 text-[14px] transition-colors',
              tab===k ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'
            )}>
            {l}
            {!!n && <span className="text-[12.5px] tabular-nums text-[#8A877F]">{n}</span>}
          </button>
        ))}
      </div>

      {tab==='overview' && contract.key_obligations?.length>0 && (
        <Card><CardHeader title="Key obligations"/>
          <ol>{contract.key_obligations.map((o:string,i:number)=>(
            <li key={i} className="flex items-start gap-3 border-t border-[#F1EFEA] px-5 py-3 text-[14px] leading-relaxed text-[#2B2924] first:border-0">
              <span className="w-5 shrink-0 text-right text-[13px] tabular-nums text-[#8A877F]">{i+1}.</span>{o}
            </li>
          ))}</ol>
        </Card>
      )}
      {tab==='overview' && !(contract.key_obligations?.length>0) && (
        <Card>
          <EmptyState title="No obligations extracted">
            Re-analyse the contract to pull out who has to do what, and by when.
          </EmptyState>
        </Card>
      )}

      {tab==='clauses' && (
        !contract.clauses?.length ? (
          <Card>
            <EmptyState title="No clauses extracted yet">Choose Re-analyse to read the contract clause by clause.</EmptyState>
          </Card>
        ) : (
          <Card>
            <ul>
              {contract.clauses.map((c:any)=>(
                <li key={c.id} className="border-t border-[#F1EFEA] px-5 py-4 first:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-[14px] font-medium text-[#0E0D0A]">{c.title}</span>
                    <Dot className={FLAG[c.risk_flag]?.dot}>{FLAG[c.risk_flag]?.label || `${c.risk_flag} risk`}</Dot>
                  </div>
                  {c.ai_summary && <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5A5750]">{c.ai_summary}</p>}
                  {c.risk_reason && (
                    <p className="mt-2 border-l-2 border-[#D97706] pl-3 text-[13px] leading-relaxed text-[#2B2924]">{c.risk_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )
      )}

      {tab==='risks' && (
        !contract.risks?.length ? (
          <Card>
            <EmptyState title="No risks found">Nothing stood out in the last review. Re-analyse after the contract changes.</EmptyState>
          </Card>
        ) : (
          <Card>
            <ul>
              {contract.risks.map((r:any)=>(
                <li key={r.id} className="border-t border-[#F1EFEA] px-5 py-4 first:border-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="min-w-0 flex-1 text-[14px] font-medium text-[#0E0D0A]">{r.title}</span>
                    <Dot className={SEV_DOT[r.severity]}>{r.severity}</Dot>
                    {r.category && <Badge variant="gray"><span className="capitalize">{r.category}</span></Badge>}
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5A5750]">{r.description}</p>
                  {r.recommendation && (
                    <div className="mt-2.5 rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7] px-3 py-2">
                      <p className="mb-0.5 text-[12px] text-[#8A877F]">Suggested change</p>
                      <p className="text-[13px] leading-relaxed text-[#2B2924]">{r.recommendation}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )
      )}

      {tab==='renewal' && (
        <Card><CardHeader title="Renewal"/>
          {!contract.renewal ? (
            <EmptyState title="No renewal date yet">Add an expiry date to the contract to start tracking its renewal.</EmptyState>
          ) : (
            <CardBody className="space-y-5">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[{l:'Renewal due',v:formatDate(contract.renewal.renewal_due)},
                  {l:'Notice deadline',v:contract.renewal.notice_deadline?formatDate(contract.renewal.notice_deadline):'—'},
                  {l:'Days left',v:`${contract.renewal.days_until}`,warn:contract.renewal.days_until<=30}].map(f=>(
                  <div key={f.l}>
                    <dt className="flex items-center gap-1.5 text-[12.5px] text-[#8A877F]">
                      {f.warn && <span className="h-1.5 w-1.5 rounded-full bg-[#DC2626]"/>}{f.l}
                    </dt>
                    <dd className={cn('mt-1 font-display text-[22px] font-semibold leading-tight tabular-nums', f.warn?'text-[#B91C1C]':'text-[#0E0D0A]')}>{f.v}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-[#ECEAE4] pt-4">
                <p className="mb-2 text-[13px] font-medium text-[#0E0D0A]">Renewal decision</p>
                <div className="inline-flex flex-wrap rounded-[8px] border border-[#DDD9D0] bg-white p-0.5" role="group" aria-label="Renewal decision">
                  {['renew','negotiate','terminate','pending'].map(a=>(
                    <button key={a} onClick={()=>setRenewalAction(a)} aria-pressed={contract.renewal.action===a} disabled={!!savingAction}
                      className={cn(
                        'h-8 rounded-[6px] px-3 text-[13px] capitalize transition-colors disabled:cursor-not-allowed',
                        savingAction===a && 'opacity-60',
                        contract.renewal.action===a ? 'bg-[#0E0D0A] font-medium text-[#F7F5F0]' : 'text-[#5A5750] hover:bg-[#F1EFEA] hover:text-[#0E0D0A]'
                      )}>{a}</button>
                  ))}
                </div>
              </div>
            </CardBody>
          )}
        </Card>
      )}
    </div>
  )
}

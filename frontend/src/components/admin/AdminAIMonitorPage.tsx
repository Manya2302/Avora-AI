'use client'
import { useEffect, useState } from 'react'
import { Brain, RefreshCw, AlertTriangle, CheckCircle2, Clock, BarChart3, Zap, RotateCcw } from 'lucide-react'
import { adminAiApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import StatCard from '@/components/shared/StatCard'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import toast from 'react-hot-toast'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

export default function AdminAIMonitorPage() {
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]       = useState<'pipeline'|'ocr'|'classify'|'search'>('pipeline')
  const [ocrData, setOcrData]   = useState<any>(null)
  const [clsData, setClsData]   = useState<any>(null)
  const [srchData, setSrchData] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [mon, cls, srch] = await Promise.all([
        adminAiApi.monitor(),
        adminAiApi.classificationMetrics(),
        adminAiApi.searchAnalytics(),
      ])
      setData(mon.data)
      setClsData(cls.data)
      setSrchData(srch.data)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const retriggerFailed = async () => {
    try {
      const { data: r } = await adminAiApi.retriggerFailed()
      toast.success(r.message)
      load()
    } catch { toast.error('Couldn’t restart the failed jobs.') }
  }

  const tabs = [
    { key:'pipeline', label:'Pipeline',       icon: Zap },
    { key:'ocr',      label:'Text extraction', icon: Brain },
    { key:'classify', label:'Classification', icon: BarChart3 },
    { key:'search',   label:'Search',          icon: BarChart3 },
  ]

  const CATEGORY_LABELS: Record<string, string> = {
    invoice:'Invoice', contract:'Contract', tax_filing:'Tax filing',
    medical_record:'Medical record', bank_statement:'Bank statement',
    legal_agreement:'Legal agreement', audit_report:'Audit report',
    certificate:'Certificate', purchase_order:'Purchase order',
    employee_record:'Employee record', vendor_agreement:'Vendor agreement',
    compliance_report:'Compliance report', other:'Other',
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI health"
        description="Document processing, text extraction, classification and search, as they run right now."
        actions={<>
          {data?.pipeline?.failed > 0 && (
            <Button variant="red" size="sm" onClick={retriggerFailed}>
              <RotateCcw className="h-3.5 w-3.5" /> Retry {data.pipeline.failed} failed
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
        </>}
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({length:4}).map((_,i) => <div key={i} className="h-[104px] animate-pulse rounded-[12px] bg-[#F1EFEA]" />)}
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Processed"        value={data.pipeline?.completed?.toLocaleString() || 0}   icon={<CheckCircle2 />} accent="green" />
            <StatCard label="Processing now"   value={data.pipeline?.processing?.toLocaleString() || 0}  icon={<Clock />}        accent="blue"  />
            <StatCard label="Failed"           value={data.pipeline?.failed?.toLocaleString() || 0}      icon={<AlertTriangle />} accent="red"  />
            <StatCard label="Searches"         value={data.search?.total_searches?.toLocaleString() || 0} icon={<BarChart3 />}   accent="purple"/>
          </div>

          {/* Tabs */}
          <div className="-mx-1 overflow-x-auto border-b border-[#DDD9D0]">
            <div className="flex min-w-max gap-5 px-1" role="tablist">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key as any)} role="tab" aria-selected={tab === t.key}
                  className={`-mb-px flex items-center gap-2 border-b-2 pb-2.5 pt-1 text-[14px] transition-colors ${tab === t.key ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'}`}>
                  <t.icon className="h-4 w-4" strokeWidth={1.75} />{t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline tab */}
          {tab === 'pipeline' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Processing pipeline" />
                <ul>
                  {[
                    { label:'Processed', value: data.pipeline?.completed, color:'text-[#15803D]' },
                    { label:'Waiting in queue', value: data.pipeline?.processing, color:'text-[#1A3DAF]' },
                    { label:'Failed (can be retried)', value: data.pipeline?.failed, color:'text-[#B91C1C]' },
                    { label:'Average time per document', value: `${Math.round(data.pipeline?.avg_duration_ms || 0).toLocaleString()} ms`, color:'text-[#0E0D0A]' },
                  ].map(s => (
                    <li key={s.label} className="flex items-center justify-between gap-4 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                      <span className="text-[14px] text-[#2B2924]">{s.label}</span>
                      <span className={`text-[14px] font-medium tabular-nums ${s.color}`}>{s.value}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Embeddings and text extraction" />
                <ul>
                  {[
                    { label:'Vectors stored in Qdrant', value: data.embeddings?.total },
                    { label:'Text extracted (OCR)',     value: data.ocr?.completed },
                    { label:'Extraction failed',        value: data.ocr?.failed },
                    { label:'Average OCR confidence',   value: `${Math.round((data.ocr?.avg_confidence || 0) * 100)}%` },
                  ].map(s => (
                    <li key={s.label} className="flex items-center justify-between gap-4 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                      <span className="text-[14px] text-[#2B2924]">{s.label}</span>
                      <span className="text-[14px] font-medium tabular-nums text-[#0E0D0A]">{s.value ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {/* Classification tab */}
          {tab === 'classify' && clsData && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Documents by category" />
                <div className="space-y-4 p-5">
                  {clsData.by_category?.map((c: any) => (
                    <div key={c.category}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                        <span className="truncate text-[#2B2924]">{CATEGORY_LABELS[c.category] || c.category}</span>
                        <span className="flex shrink-0 items-center gap-3 tabular-nums">
                          <span className="text-[12.5px] text-[#8A877F]">{Math.round((c.avg_conf||0)*100)}% confidence</span>
                          <span className="font-medium text-[#0E0D0A]">{c.count}</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#F1EFEA]">
                        <div className="h-full rounded-full bg-[#1A3DAF]" style={{ width:`${Math.min((c.count / (clsData.by_category[0]?.count || 1)) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="Confidentiality" />
                <ul>
                  {clsData.by_confidentiality?.map((c: any) => (
                    <li key={c.confidentiality} className="flex items-center justify-between gap-4 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                      <Badge className="capitalize" variant={c.confidentiality === 'restricted' ? 'red' : c.confidentiality === 'confidential' ? 'amber' : c.confidentiality === 'internal' ? 'blue' : 'green'}>
                        {c.confidentiality}
                      </Badge>
                      <span className="text-[14px] font-medium tabular-nums text-[#0E0D0A]">{c.count}</span>
                    </li>
                  ))}
                </ul>
                {clsData.high_risk > 0 && (
                  <div className="flex items-start gap-2.5 border-t border-[#ECEAE4] bg-[#FCEFEF] px-5 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]" strokeWidth={1.75} />
                    <span className="text-[13px] text-[#B91C1C]"><strong className="font-semibold">{clsData.high_risk}</strong> documents have a risk score above 70%.</span>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Search analytics tab */}
          {tab === 'search' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Search volume" />
                <ul>
                  {[
                    { label:'Searches',        value: data.search?.total_searches },
                    { label:'Unique queries',  value: data.search?.unique_queries },
                  ].map(s => (
                    <li key={s.label} className="flex items-center justify-between gap-4 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                      <span className="text-[14px] text-[#2B2924]">{s.label}</span>
                      <span className="text-[14px] font-medium tabular-nums text-[#0E0D0A]">{s.value ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Most searched" />
                <ol>
                  {(srchData || data.search?.popular || []).slice(0,8).map((p: any, i: number) => (
                    <li key={i} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-2.5 first:border-0">
                      <span className="w-5 text-[12.5px] tabular-nums text-[#8A877F]">{i+1}</span>
                      <span className="flex-1 truncate text-[14px] text-[#0E0D0A]">{p.query}</span>
                      <span className="text-[12.5px] tabular-nums text-[#8A877F]">{p.search_count}×</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          )}

          {/* OCR tab */}
          {tab === 'ocr' && (
            <Card>
              <CardHeader title="Text extraction (OCR)" subtitle="Scanned pages and images turned into searchable text." />
              <CardBody>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
                  {[
                    { label:'Total',     value: data.ocr?.total,     color:'text-[#0E0D0A]' },
                    { label:'Completed', value: data.ocr?.completed, color:'text-[#15803D]' },
                    { label:'Failed',    value: data.ocr?.failed,    color:'text-[#B91C1C]' },
                    { label:'Average confidence',  value: `${Math.round((data.ocr?.avg_confidence||0)*100)}%`, color:'text-[#1A3DAF]' },
                  ].map(s => (
                    <div key={s.label}>
                      <dt className="text-[13px] text-[#5A5750]">{s.label}</dt>
                      <dd className={`mt-1.5 font-display text-[28px] font-semibold leading-none tabular-nums ${s.color}`}>{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {!loading && !data && (
        <Card>
          <EmptyState icon={<Brain />} title="No AI metrics yet">
            We couldn’t reach the AI services. Check that the backend and its workers are running, then refresh.
          </EmptyState>
        </Card>
      )}
    </div>
  )
}

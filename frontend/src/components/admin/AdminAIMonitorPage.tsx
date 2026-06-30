'use client'
import { useEffect, useState } from 'react'
import { Brain, RefreshCw, AlertTriangle, CheckCircle2, Clock, BarChart3, Zap, RotateCcw } from 'lucide-react'
import { adminAiApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import StatCard from '@/components/shared/StatCard'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import toast from 'react-hot-toast'

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
    } catch { toast.error('Failed to retrigger.') }
  }

  const tabs = [
    { key:'pipeline', label:'Pipeline',       icon: Zap },
    { key:'ocr',      label:'OCR Engine',     icon: Brain },
    { key:'classify', label:'Classification', icon: BarChart3 },
    { key:'search',   label:'Search Analytics',icon: BarChart3 },
  ]

  const CATEGORY_LABELS: Record<string, string> = {
    invoice:'Invoice', contract:'Contract', tax_filing:'Tax Filing',
    medical_record:'Medical Record', bank_statement:'Bank Statement',
    legal_agreement:'Legal Agreement', audit_report:'Audit Report',
    certificate:'Certificate', purchase_order:'Purchase Order',
    employee_record:'Employee Record', vendor_agreement:'Vendor Agreement',
    compliance_report:'Compliance Report', other:'Other',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[11px] bg-[#EBF0FF] flex items-center justify-center"><Brain className="w-5 h-5 text-[#1A3DAF]" /></div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">AI Health Dashboard</h2>
            <p className="text-sm font-light text-[#9B9890]">Avora AI pipeline monitoring — Phase 2</p>
          </div>
        </div>
        <div className="flex gap-2">
          {data?.pipeline?.failed > 0 && (
            <Button variant="red" size="sm" onClick={retriggerFailed}>
              <RotateCcw className="w-3.5 h-3.5" /> Retrigger {data.pipeline.failed} Failed
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {Array.from({length:4}).map((_,i) => <div key={i} className="h-28 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse" />)}
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <StatCard label="AI Processed"    value={data.pipeline?.completed?.toLocaleString() || 0}   icon={<CheckCircle2 />} accent="green" />
            <StatCard label="Processing Now"  value={data.pipeline?.processing?.toLocaleString() || 0}  icon={<Clock />}        accent="blue"  />
            <StatCard label="Failed Jobs"     value={data.pipeline?.failed?.toLocaleString() || 0}      icon={<AlertTriangle />} accent="red"  />
            <StatCard label="Total Searches"  value={data.search?.total_searches?.toLocaleString() || 0} icon={<BarChart3 />}   accent="purple"/>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[11px] p-1">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-[8px] text-xs font-medium flex-1 justify-center transition-all ${tab === t.key ? 'bg-white text-[#0E0D0A] shadow-sm' : 'text-[#9B9890] hover:text-[#5A5750]'}`}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </div>

          {/* Pipeline tab */}
          {tab === 'pipeline' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Pipeline Summary" />
                <CardBody className="space-y-3">
                  {[
                    { label:'Total processed', value: data.pipeline?.completed, color:'text-green-600' },
                    { label:'Currently queued', value: data.pipeline?.processing, color:'text-[#1A3DAF]' },
                    { label:'Failed (retry available)', value: data.pipeline?.failed, color:'text-red-600' },
                    { label:'Avg duration', value: `${Math.round(data.pipeline?.avg_duration_ms || 0).toLocaleString()} ms`, color:'text-[#0E0D0A]' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center justify-between p-3 bg-[#F7F5F0] rounded-[9px]">
                      <span className="text-xs font-light text-[#5A5750]">{s.label}</span>
                      <span className={`font-mono text-sm font-semibold ${s.color}`}>{s.value}</span>
                    </div>
                  ))}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Embedding Stats" />
                <CardBody className="space-y-3">
                  {[
                    { label:'Total vectors in Qdrant', value: data.embeddings?.total },
                    { label:'OCR completed',           value: data.ocr?.completed },
                    { label:'OCR failed',              value: data.ocr?.failed },
                    { label:'Avg OCR confidence',      value: `${Math.round((data.ocr?.avg_confidence || 0) * 100)}%` },
                  ].map(s => (
                    <div key={s.label} className="flex items-center justify-between p-3 bg-[#F7F5F0] rounded-[9px]">
                      <span className="text-xs font-light text-[#5A5750]">{s.label}</span>
                      <span className="font-mono text-sm font-semibold text-[#0E0D0A]">{s.value ?? '—'}</span>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          )}

          {/* Classification tab */}
          {tab === 'classify' && clsData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Documents by Category" />
                <div className="p-4 space-y-2.5">
                  {clsData.by_category?.map((c: any) => (
                    <div key={c.category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#5A5750]">{CATEGORY_LABELS[c.category] || c.category}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-[#9B9890]">{Math.round((c.avg_conf||0)*100)}% conf</span>
                          <span className="font-mono text-xs font-semibold text-[#0E0D0A]">{c.count}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-[#ECEAE4] rounded-full overflow-hidden">
                        <div className="h-full bg-[#1A3DAF] rounded-full" style={{ width:`${Math.min((c.count / (clsData.by_category[0]?.count || 1)) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="Confidentiality Distribution" />
                <CardBody className="space-y-3">
                  {clsData.by_confidentiality?.map((c: any) => (
                    <div key={c.confidentiality} className="flex items-center justify-between p-3 bg-[#F7F5F0] rounded-[9px]">
                      <div className="flex items-center gap-2">
                        <Badge variant={c.confidentiality === 'restricted' ? 'red' : c.confidentiality === 'confidential' ? 'amber' : c.confidentiality === 'internal' ? 'blue' : 'green'}>
                          {c.confidentiality}
                        </Badge>
                      </div>
                      <span className="font-mono text-sm font-semibold text-[#0E0D0A]">{c.count}</span>
                    </div>
                  ))}
                  {clsData.high_risk > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-[9px]">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="text-xs text-red-700"><strong>{clsData.high_risk}</strong> documents with high risk score (&gt;70%)</span>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {/* Search analytics tab */}
          {tab === 'search' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Search Overview" />
                <CardBody className="space-y-3">
                  {[
                    { label:'Total searches',  value: data.search?.total_searches },
                    { label:'Unique queries',  value: data.search?.unique_queries },
                  ].map(s => (
                    <div key={s.label} className="flex justify-between p-3 bg-[#F7F5F0] rounded-[9px]">
                      <span className="text-xs text-[#5A5750]">{s.label}</span>
                      <span className="font-mono text-sm font-semibold text-[#0E0D0A]">{s.value ?? '—'}</span>
                    </div>
                  ))}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Top Search Queries" />
                <div className="divide-y divide-[#ECEAE4]">
                  {(srchData || data.search?.popular || []).slice(0,8).map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="font-mono text-[10px] text-[#9B9890] w-5">{i+1}</span>
                      <span className="text-sm text-[#0E0D0A] flex-1 truncate">{p.query}</span>
                      <span className="font-mono text-[10px] text-[#9B9890]">{p.search_count}×</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* OCR tab */}
          {tab === 'ocr' && (
            <Card>
              <CardHeader title="OCR Queue" action={
                <div className="flex gap-2">
                  {['pending','processing','completed','failed'].map(s => (
                    <Badge key={s} variant={s === 'completed' ? 'green' : s === 'failed' ? 'red' : s === 'processing' ? 'blue' : 'gray'}>{s}</Badge>
                  ))}
                </div>
              } />
              <CardBody>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label:'Total',     value: data.ocr?.total,     color:'text-[#0E0D0A]' },
                    { label:'Completed', value: data.ocr?.completed, color:'text-green-600' },
                    { label:'Failed',    value: data.ocr?.failed,    color:'text-red-600' },
                    { label:'Avg Conf',  value: `${Math.round((data.ocr?.avg_confidence||0)*100)}%`, color:'text-[#1A3DAF]' },
                  ].map(s => (
                    <div key={s.label} className="p-4 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[11px] text-center">
                      <div className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-xs text-[#9B9890] mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {!loading && !data && (
        <div className="text-center py-20 bg-white border border-[#DDD9D0] rounded-[16px]">
          <Brain className="w-12 h-12 text-[#DDD9D0] mx-auto mb-4" />
          <p className="font-medium text-[#5A5750]">Connect to backend to see AI metrics</p>
          <p className="text-sm text-[#9B9890] mt-1">Start the Docker stack and visit this page.</p>
        </div>
      )}
    </div>
  )
}

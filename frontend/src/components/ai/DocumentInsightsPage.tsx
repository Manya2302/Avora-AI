'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Sparkles, FileText, Tag, Link2, Lightbulb, Shield, Brain, AlertTriangle } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import type { DocumentInsight } from '@/types'

const CONF_VARIANT: Record<string, any> = { public:'green', internal:'blue', confidential:'amber', restricted:'red' }
const CATEGORY_LABEL: Record<string, string> = {
  invoice:'Invoice', contract:'Contract', tax_filing:'Tax Filing', medical_record:'Medical Record',
  bank_statement:'Bank Statement', legal_agreement:'Legal Agreement', insurance_policy:'Insurance Policy',
  audit_report:'Audit Report', certificate:'Certificate', purchase_order:'Purchase Order',
  employee_record:'Employee Record', vendor_agreement:'Vendor Agreement', compliance_report:'Compliance Report', other:'Other',
}

const STAGES = ['queued','ocr','text_extraction','text_cleaning','classification','metadata','summary','embedding','storing','completed']

export default function DocumentInsightsPage({ documentId }: { documentId: string }) {
  const router = useRouter()
  const [insight, setInsight]   = useState<DocumentInsight | null>(null)
  const [loading, setLoading]   = useState(true)
  const [retrigger, setRetrigger] = useState(false)
  const [tab, setTab]           = useState<'overview'|'summary'|'metadata'|'relations'>('overview')

  useEffect(() => {
    if (!documentId) return
    aiApi.insights(documentId).then(r => setInsight(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [documentId])

  const handleRetrigger = async () => {
    setRetrigger(true)
    try { await aiApi.retrigger(documentId); setLoading(true); setTimeout(() => { aiApi.insights(documentId).then(r => setInsight(r.data)).finally(() => setLoading(false)) }, 2000) }
    catch {}
    finally { setRetrigger(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-72">
      <div className="text-center"><div className="w-8 h-8 border-2 border-[#EBF0FF] border-t-[#1A3DAF] rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-[#9B9890]">Loading Avora insights…</p></div>
    </div>
  )

  const pipeline = insight?.queue
  const stageIdx = pipeline ? STAGES.indexOf(pipeline.stage) : -1
  const pct      = pipeline ? pipeline.progress : 0
  const tabs = [
    { key: 'overview',  label: 'Overview',  icon: Brain },
    { key: 'summary',   label: 'AI Summary',icon: Sparkles },
    { key: 'metadata',  label: 'Metadata',  icon: FileText },
    { key: 'relations', label: 'Relations', icon: Link2 },
  ]

  return (
    <div className="space-y-5 max-w-5xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[#9B9890] hover:text-[#0E0D0A] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Document
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><Sparkles className="w-5 h-5 text-[#1A3DAF]" /></div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">Avora Insights</h2>
            <p className="text-sm font-light text-[#9B9890] font-mono">{documentId.slice(0,8)}…</p>
          </div>
        </div>
        {pipeline?.stage === 'failed' && <Button variant="red" size="sm" loading={retrigger} onClick={handleRetrigger}><AlertTriangle className="w-3.5 h-3.5" /> Retrigger Pipeline</Button>}
      </div>

      {/* Pipeline progress */}
      {pipeline && pipeline.stage !== 'completed' && (
        <div className="bg-white border border-[#DDD9D0] rounded-[14px] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-[#0E0D0A]">Processing Pipeline</span>
            <span className={`font-mono text-[10px] font-semibold px-2.5 py-1 rounded-full border ${pipeline.stage === 'failed' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-[#EBF0FF] text-[#1A3DAF] border-[#1A3DAF]/15'}`}>
              {pipeline.stage.replace('_',' ')} · {pct}%
            </span>
          </div>
          <div className="h-2 bg-[#ECEAE4] rounded-full overflow-hidden mb-3">
            <div className={`h-full rounded-full transition-all duration-500 ${pipeline.stage === 'failed' ? 'bg-red-500' : 'bg-[#1A3DAF]'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {STAGES.slice(0,-1).map((s, i) => (
              <div key={s} className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${i < stageIdx ? 'bg-green-50 text-green-600 border-green-100' : i === stageIdx ? 'bg-[#EBF0FF] text-[#1A3DAF] border-[#1A3DAF]/15' : 'bg-[#F7F5F0] text-[#9B9890] border-[#ECEAE4]'}`}>
                {s.replace('_',' ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[11px] p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium flex-1 justify-center transition-all ${tab === t.key ? 'bg-white text-[#0E0D0A] shadow-sm' : 'text-[#9B9890] hover:text-[#5A5750]'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader title="Classification" action={insight?.classification && <Badge variant="green">{Math.round(insight.classification.confidence * 100)}%</Badge>} />
            <CardBody className="space-y-3">
              {insight?.classification ? (<>
                <div className="text-center py-3">
                  <div className="font-display text-2xl font-bold text-[#0E0D0A] mb-1">{CATEGORY_LABEL[insight.classification.category] || insight.classification.category}</div>
                  <Badge variant={CONF_VARIANT[insight.classification.confidentiality]}>{insight.classification.confidentiality}</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-[#F7F5F0] rounded-[8px]">
                  <span className="text-xs text-[#5A5750]">Risk Score</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-[#ECEAE4] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${insight.classification.risk_score > 0.7 ? 'bg-red-500' : insight.classification.risk_score > 0.4 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${insight.classification.risk_score * 100}%` }} />
                    </div>
                    <span className="font-mono text-[11px] text-[#0E0D0A] font-semibold">{Math.round(insight.classification.risk_score * 100)}%</span>
                  </div>
                </div>
              </>) : <p className="text-sm text-[#9B9890] text-center py-4">Not yet classified</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="OCR Extraction" />
            <CardBody className="space-y-2.5">
              {insight?.ocr ? (<>
                <div className="flex items-center justify-between"><span className="text-xs text-[#5A5750]">Status</span><Badge variant={insight.ocr.status === 'completed' ? 'green' : 'amber'}>{insight.ocr.status}</Badge></div>
                <div className="flex items-center justify-between"><span className="text-xs text-[#5A5750]">Confidence</span><span className="font-mono text-xs font-semibold text-[#0E0D0A]">{Math.round(insight.ocr.confidence * 100)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-[#5A5750]">Pages</span><span className="font-mono text-xs text-[#0E0D0A]">{insight.ocr.page_count}</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-[#5A5750]">Words</span><span className="font-mono text-xs text-[#0E0D0A]">{insight.ocr.word_count?.toLocaleString()}</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-[#5A5750]">Engine</span><span className="font-mono text-[10px] text-[#1A3DAF] bg-[#EBF0FF] px-1.5 py-0.5 rounded">{insight.ocr.engine}</span></div>
              </>) : <p className="text-sm text-[#9B9890] text-center py-4">Not yet processed</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tags" action={<span className="font-mono text-[10px] text-[#9B9890]">{insight?.tags?.length || 0} tags</span>} />
            <CardBody>
              {insight?.tags && insight.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {insight.tags.map(t => (
                    <span key={t.tag} className="font-mono text-[10.5px] font-medium px-2.5 py-1 rounded-full bg-[#F7F5F0] border border-[#ECEAE4] text-[#5A5750]">{t.tag}</span>
                  ))}
                </div>
              ) : <p className="text-sm text-[#9B9890] text-center py-4">No tags generated yet</p>}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Summary */}
      {tab === 'summary' && (
        <div className="space-y-4">
          {insight?.summary ? (<>
            <Card>
              <CardHeader title="Short Summary" action={<Sparkles className="w-4 h-4 text-[#1A3DAF]" />} />
              <CardBody>
                <div className="p-4 bg-[#EBF0FF] border border-[#1A3DAF]/12 rounded-[11px]">
                  <p className="text-[14.5px] font-medium text-[#0E0D0A] leading-relaxed">{insight.summary.short || 'Not generated yet.'}</p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Detailed Analysis" />
              <CardBody><p className="text-[13.5px] font-light text-[#5A5750] leading-[1.75] whitespace-pre-wrap">{insight.summary.medium || insight.summary.long || 'Not generated yet.'}</p></CardBody>
            </Card>
            {insight.summary.key_points?.length > 0 && (
              <Card>
                <CardHeader title="Key Points" action={<Lightbulb className="w-4 h-4 text-amber-500" />} />
                <CardBody>
                  <ul className="space-y-2.5">
                    {insight.summary.key_points.map((p, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-[#5A5750]">
                        <div className="w-5 h-5 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center font-mono text-[9px] font-bold text-amber-700 flex-shrink-0 mt-0.5">{i+1}</div>
                        {p}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </>) : (
            <div className="text-center py-16 bg-white border border-[#DDD9D0] rounded-[16px]">
              <Sparkles className="w-10 h-10 text-[#DDD9D0] mx-auto mb-3" />
              <p className="font-medium text-[#5A5750]">Summary not yet generated</p>
              <p className="text-xs text-[#9B9890] mt-1">Avora will generate a summary once document processing is complete.</p>
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      {tab === 'metadata' && (
        <Card>
          <CardHeader title="Extracted Metadata" action={<span className="font-mono text-[9.5px] text-[#1A3DAF] bg-[#EBF0FF] px-2 py-0.5 rounded-full">AI Extracted</span>} />
          <CardBody>
            {insight?.metadata ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label:'Vendor',     value: insight.metadata.vendor },
                  { label:'Client',     value: insight.metadata.client },
                  { label:'Department', value: insight.metadata.department },
                  { label:'Year',       value: insight.metadata.year },
                  { label:'Amount',     value: insight.metadata.amount ? `${insight.metadata.currency} ${insight.metadata.amount}` : '' },
                  { label:'Country',    value: insight.metadata.country },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="flex items-center justify-between p-3 bg-[#F7F5F0] rounded-[9px] border border-[#ECEAE4]">
                    <span className="text-xs font-semibold text-[#9B9890] uppercase tracking-[0.5px]">{f.label}</span>
                    <span className="text-sm font-medium text-[#0E0D0A]">{f.value}</span>
                  </div>
                ))}
                {insight.metadata.keywords?.length > 0 && (
                  <div className="md:col-span-2 p-3 bg-[#F7F5F0] rounded-[9px] border border-[#ECEAE4]">
                    <span className="text-xs font-semibold text-[#9B9890] uppercase tracking-[0.5px] block mb-2">Keywords</span>
                    <div className="flex flex-wrap gap-1.5">
                      {insight.metadata.keywords.map(k => <span key={k} className="font-mono text-[10px] px-2 py-0.5 bg-white border border-[#DDD9D0] rounded-full text-[#5A5750]">{k}</span>)}
                    </div>
                  </div>
                )}
              </div>
            ) : <p className="text-sm text-[#9B9890] text-center py-8">No metadata extracted yet.</p>}
          </CardBody>
        </Card>
      )}

      {/* Relations */}
      {tab === 'relations' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Document Relationships" action={<span className="font-mono text-[10px] text-[#9B9890]">{insight?.relationships?.length || 0} found</span>} />
            <div>
              {insight?.relationships && insight.relationships.length > 0 ? insight.relationships.map(r => (
                <div key={r.target_document_id} onClick={() => router.push(`/documents/${r.target_document_id}`)}
                  className="flex items-center gap-3 px-5 py-3.5 border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0] cursor-pointer">
                  <Link2 className="w-4 h-4 text-[#9B9890] flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-[#0E0D0A]">{r.target_document_id.toString().slice(0,8)}…</div>
                    <div className="text-xs text-[#9B9890]">{r.relationship_type.replace('_',' ')} · {Math.round(r.similarity_score * 100)}% similar</div>
                  </div>
                  <Badge variant={r.similarity_score > 0.95 ? 'red' : r.similarity_score > 0.88 ? 'amber' : 'blue'}>
                    {r.similarity_score > 0.95 ? 'Duplicate' : r.similarity_score > 0.88 ? 'Revision' : 'Related'}
                  </Badge>
                </div>
              )) : (
                <div className="p-10 text-center text-sm text-[#9B9890]">No related documents found yet.</div>
              )}
            </div>
          </Card>
          {insight?.recommendations && insight.recommendations.length > 0 && (
            <Card>
              <CardHeader title="Recommendations" action={<Lightbulb className="w-4 h-4 text-amber-500" />} />
              <div>
                {insight.recommendations.map(r => (
                  <div key={r.recommended_document_id} onClick={() => router.push(`/documents/${r.recommended_document_id}`)}
                    className="flex items-center gap-3 px-5 py-3.5 border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0] cursor-pointer">
                    <FileText className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[#0E0D0A]">{r.recommended_document_id.toString().slice(0,8)}…</div>
                      <div className="text-xs text-[#9B9890]">{r.reason}</div>
                    </div>
                    <span className="font-mono text-[10px] text-[#5A5750]">{r.score}%</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Sparkles, FileText, Tag, Link2, Lightbulb, Shield, Brain, AlertTriangle } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import type { DocumentInsight } from '@/types'

const CONF_VARIANT: Record<string, any> = { public:'green', internal:'blue', confidential:'amber', restricted:'red' }
const CATEGORY_LABEL: Record<string, string> = {
  invoice:'Invoice', contract:'Contract', tax_filing:'Tax filing', medical_record:'Medical record',
  bank_statement:'Bank statement', legal_agreement:'Legal agreement', insurance_policy:'Insurance policy',
  audit_report:'Audit report', certificate:'Certificate', purchase_order:'Purchase order',
  employee_record:'Employee record', vendor_agreement:'Vendor agreement', compliance_report:'Compliance report', other:'Other',
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
    <div className="space-y-6">
      <div className="h-8 w-56 animate-pulse rounded-[6px] bg-[#F1EFEA]" />
      <Card><div className="space-y-3 p-5">{[0, 1, 2].map(i => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div></Card>
      <p className="text-[13px] text-[#8A877F]">Loading insights…</p>
    </div>
  )

  const pipeline = insight?.queue
  const stageIdx = pipeline ? STAGES.indexOf(pipeline.stage) : -1
  const pct      = pipeline ? pipeline.progress : 0
  const tabs = [
    { key: 'overview',  label: 'Overview',  icon: Brain },
    { key: 'summary',   label: 'Summary',   icon: Sparkles },
    { key: 'metadata',  label: 'Metadata',  icon: FileText },
    { key: 'relations', label: 'Relations', icon: Link2 },
  ]

  return (
    <div className="max-w-5xl space-y-6">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-[13px] text-[#8A877F] transition-colors hover:text-[#0E0D0A]">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} /> Back to document
      </button>

      <PageHeader
        className="!mt-3"
        title="Document insights"
        description={<>What Avora extracted from this document · <span className="font-mono text-[13px]">{documentId.slice(0,8)}…</span></>}
        actions={pipeline?.stage === 'failed' && <Button variant="red" size="sm" loading={retrigger} onClick={handleRetrigger}><AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} /> Run processing again</Button>}
      />

      {/* Pipeline progress */}
      {pipeline && pipeline.stage !== 'completed' && (
        <Card>
          <CardHeader
            title="Processing"
            subtitle={pipeline.stage === 'failed' ? 'Processing stopped before it finished.' : 'Insights fill in as each step completes.'}
            action={<Badge variant={pipeline.stage === 'failed' ? 'red' : 'blue'}>{pipeline.stage.replace('_',' ')} · {pct}%</Badge>}
          />
          <CardBody className="space-y-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#F1EFEA]">
              <div className={`h-full rounded-full transition-all duration-500 ${pipeline.stage === 'failed' ? 'bg-[#DC2626]' : 'bg-[#1A3DAF]'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {STAGES.slice(0,-1).map((s, i) => (
                <span key={s} className={`inline-flex items-center gap-1.5 text-[12.5px] ${i < stageIdx ? 'text-[#5A5750]' : i === stageIdx ? 'font-medium text-[#0E0D0A]' : 'text-[#8A877F]'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${i < stageIdx ? 'bg-[#16A34A]' : i === stageIdx ? 'bg-[#1A3DAF]' : 'bg-[#DDD9D0]'}`} />
                  {s.replace('_',' ')}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-6 overflow-x-auto border-b border-[#DDD9D0]" role="tablist">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key as any)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2.5 text-[14px] transition-colors ${tab === t.key ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader title="Classification" action={insight?.classification && <span className="text-[12.5px] tabular-nums text-[#8A877F]">{Math.round(insight.classification.confidence * 100)}% confident</span>} />
            <CardBody className="space-y-4">
              {insight?.classification ? (<>
                <div>
                  <div className="font-display text-[24px] font-semibold leading-tight text-[#0E0D0A]">{CATEGORY_LABEL[insight.classification.category] || insight.classification.category}</div>
                  <div className="mt-2"><Badge variant={CONF_VARIANT[insight.classification.confidentiality]}>{insight.classification.confidentiality}</Badge></div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[#F1EFEA] pt-3">
                  <span className="text-[13px] text-[#5A5750]">Risk score</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#F1EFEA]">
                      <div className={`h-full rounded-full ${insight.classification.risk_score > 0.7 ? 'bg-[#DC2626]' : insight.classification.risk_score > 0.4 ? 'bg-[#D97706]' : 'bg-[#16A34A]'}`} style={{ width: `${insight.classification.risk_score * 100}%` }} />
                    </div>
                    <span className="text-[13px] font-medium tabular-nums text-[#0E0D0A]">{Math.round(insight.classification.risk_score * 100)}%</span>
                  </div>
                </div>
              </>) : <p className="py-4 text-center text-[13px] text-[#8A877F]">Not classified yet.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Text extraction" />
            <CardBody className="space-y-2.5">
              {insight?.ocr ? (<>
                <div className="flex items-center justify-between gap-3"><span className="text-[13px] text-[#5A5750]">Status</span><Badge variant={insight.ocr.status === 'completed' ? 'green' : 'amber'}>{insight.ocr.status}</Badge></div>
                <div className="flex items-center justify-between gap-3"><span className="text-[13px] text-[#5A5750]">Confidence</span><span className="text-[13px] font-medium tabular-nums text-[#0E0D0A]">{Math.round(insight.ocr.confidence * 100)}%</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-[13px] text-[#5A5750]">Pages</span><span className="text-[13px] tabular-nums text-[#0E0D0A]">{insight.ocr.page_count}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-[13px] text-[#5A5750]">Words</span><span className="text-[13px] tabular-nums text-[#0E0D0A]">{insight.ocr.word_count?.toLocaleString()}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-[13px] text-[#5A5750]">Engine</span><span className="font-mono text-[12px] text-[#5A5750]">{insight.ocr.engine}</span></div>
              </>) : <p className="py-4 text-center text-[13px] text-[#8A877F]">Not processed yet.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tags" action={<span className="text-[12.5px] tabular-nums text-[#8A877F]">{insight?.tags?.length || 0}</span>} />
            <CardBody>
              {insight?.tags && insight.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {insight.tags.map(t => (
                    <Badge key={t.tag} variant="gray" className="px-2 py-1 text-[12px] font-normal">{t.tag}</Badge>
                  ))}
                </div>
              ) : <p className="py-4 text-center text-[13px] text-[#8A877F]">No tags yet.</p>}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Summary */}
      {tab === 'summary' && (
        <div className="space-y-4">
          {insight?.summary ? (<>
            <Card>
              <CardHeader title="In brief" />
              <CardBody>
                <p className="text-[15px] leading-relaxed text-[#0E0D0A]">{insight.summary.short || 'Not generated yet.'}</p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Detailed summary" />
              <CardBody><p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-[#2B2924]">{insight.summary.medium || insight.summary.long || 'Not generated yet.'}</p></CardBody>
            </Card>
            {insight.summary.key_points?.length > 0 && (
              <Card>
                <CardHeader title="Key points" />
                <CardBody>
                  <ol className="space-y-2.5">
                    {insight.summary.key_points.map((p, i) => (
                      <li key={i} className="flex items-start gap-3 text-[14px] text-[#2B2924]">
                        <span className="mt-px w-5 shrink-0 text-right text-[13px] tabular-nums text-[#8A877F]">{i+1}.</span>
                        <span className="min-w-0">{p}</span>
                      </li>
                    ))}
                  </ol>
                </CardBody>
              </Card>
            )}
          </>) : (
            <Card>
              <EmptyState icon={<Sparkles />} title="No summary yet">
                Avora writes a summary once it has finished processing the document.
              </EmptyState>
            </Card>
          )}
        </div>
      )}

      {/* Metadata */}
      {tab === 'metadata' && (
        <Card>
          <CardHeader title="Extracted details" subtitle="Pulled from the document text by Avora. Check them before relying on them." />
          {insight?.metadata ? (
            <div>
              <dl>
                {[
                  { label:'Vendor',     value: insight.metadata.vendor },
                  { label:'Client',     value: insight.metadata.client },
                  { label:'Department', value: insight.metadata.department },
                  { label:'Year',       value: insight.metadata.year },
                  { label:'Amount',     value: insight.metadata.amount ? `${insight.metadata.currency} ${insight.metadata.amount}` : '' },
                  { label:'Country',    value: insight.metadata.country },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="flex items-center justify-between gap-4 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                    <dt className="text-[13px] text-[#8A877F]">{f.label}</dt>
                    <dd className="min-w-0 truncate text-[14px] font-medium text-[#0E0D0A]">{f.value}</dd>
                  </div>
                ))}
              </dl>
              {insight.metadata.keywords?.length > 0 && (
                <div className="border-t border-[#F1EFEA] px-5 py-3">
                  <span className="mb-2 block text-[13px] text-[#8A877F]">Keywords</span>
                  <div className="flex flex-wrap gap-1.5">
                    {insight.metadata.keywords.map(k => <Badge key={k} variant="gray" className="px-2 py-1 text-[12px] font-normal">{k}</Badge>)}
                  </div>
                </div>
              )}
            </div>
          ) : <p className="py-8 text-center text-[13px] text-[#8A877F]">No details extracted yet.</p>}
        </Card>
      )}

      {/* Relations */}
      {tab === 'relations' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Related documents" action={<span className="text-[12.5px] tabular-nums text-[#8A877F]">{insight?.relationships?.length || 0} found</span>} />
            <div>
              {insight?.relationships && insight.relationships.length > 0 ? insight.relationships.map(r => (
                <button key={r.target_document_id} onClick={() => router.push(`/documents/${r.target_document_id}`)}
                  className="flex w-full items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 text-left first:border-0 hover:bg-[#FBFAF7]">
                  <Link2 className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[13px] text-[#0E0D0A]">{r.target_document_id.toString().slice(0,8)}…</div>
                    <div className="text-[12.5px] text-[#8A877F]">{r.relationship_type.replace('_',' ')} · {Math.round(r.similarity_score * 100)}% similar</div>
                  </div>
                  <Badge variant={r.similarity_score > 0.95 ? 'red' : r.similarity_score > 0.88 ? 'amber' : 'gray'}>
                    {r.similarity_score > 0.95 ? 'Duplicate' : r.similarity_score > 0.88 ? 'Revision' : 'Related'}
                  </Badge>
                </button>
              )) : (
                <EmptyState icon={<Link2 />} title="No related documents yet">
                  Avora links documents that look like duplicates, revisions or close matches.
                </EmptyState>
              )}
            </div>
          </Card>
          {insight?.recommendations && insight.recommendations.length > 0 && (
            <Card>
              <CardHeader title="Worth a look" subtitle="Other documents Avora thinks are relevant to this one." />
              <div>
                {insight.recommendations.map(r => (
                  <button key={r.recommended_document_id} onClick={() => router.push(`/documents/${r.recommended_document_id}`)}
                    className="flex w-full items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 text-left first:border-0 hover:bg-[#FBFAF7]">
                    <FileText className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[13px] text-[#0E0D0A]">{r.recommended_document_id.toString().slice(0,8)}…</div>
                      <div className="text-[12.5px] text-[#8A877F]">{r.reason}</div>
                    </div>
                    <span className="text-[12.5px] tabular-nums text-[#5A5750]">{r.score}%</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

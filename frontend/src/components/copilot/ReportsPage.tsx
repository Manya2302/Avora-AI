'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileBarChart, Plus, Download, CheckCircle2, AlertTriangle, Clock, X, ArrowLeft } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import type { AIReport } from '@/types'
import { formatDateTime, pollUntil } from '@/lib/utils'
import toast from 'react-hot-toast'

const REPORT_TYPES = [
  { key:'vendor_compliance', label:'Vendor compliance',  desc:'Compliance status across all vendors' },
  { key:'audit_evidence',    label:'Audit evidence pack',    desc:'Evidence-based audit readiness summary' },
  { key:'contract_summary',  label:'Contract summary',   desc:'Active contracts, expiry, and key terms' },
  { key:'risk_assessment',   label:'Risk assessment',    desc:'Financial, legal, and compliance risks' },
  { key:'compliance_gap',    label:'Compliance gaps',   desc:'Missing documents and action plan' },
]

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] as string))

// Opens the report alone in a print window; the browser's print dialog offers "Save as PDF".
function exportReportPdf(r: AIReport) {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) { toast.error('Allow pop-ups for this site to export the report.'); return }
  const list = (items: string[] | undefined, tag: 'ol' | 'ul') =>
    items && items.length ? `<${tag}>${items.map(i => `<li>${esc(i)}</li>`).join('')}</${tag}>` : ''
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title>
<style>
  body{font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#2B2924;max-width:760px;margin:32px auto;padding:0 24px}
  h1{font-size:22px;margin:0 0 4px;color:#0E0D0A} h2{font-size:15px;margin:24px 0 8px;color:#0E0D0A}
  .meta{color:#8A877F;font-size:12.5px;margin-bottom:16px} .summary{background:#FBFAF7;border:1px solid #ECEAE4;border-radius:8px;padding:12px 16px}
  .full{white-space:pre-wrap} li{margin-bottom:6px} @page{margin:18mm}
</style></head><body>
<h1>${esc(r.title)}</h1>
<div class="meta">${esc(r.doc_count)} documents analysed · Confidence ${Math.round((r.confidence_score || 0) * 100)}% · ${esc(formatDateTime(r.created_at))}</div>
${r.executive_summary ? `<h2>Summary</h2><div class="summary">${esc(r.executive_summary)}</div>` : ''}
${r.key_findings?.length ? `<h2>Key findings</h2>${list(r.key_findings, 'ol')}` : ''}
${r.recommendations?.length ? `<h2>Recommendations</h2>${list(r.recommendations, 'ul')}` : ''}
${r.full_content ? `<h2>Full report</h2><div class="full">${esc(r.full_content)}</div>` : ''}
</body></html>`)
  w.document.close()
  w.focus()
  // Give the new document a tick to lay out before opening the print dialog
  setTimeout(() => { w.print() }, 250)
}

export default function ReportsPage() {
  const router = useRouter()
  const [reports, setReports] = useState<AIReport[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [generating, setGen]  = useState(false)
  const [selected, setSelected] = useState<AIReport | null>(null)

  const load = () => { copilotApi.reports().then(r => setReports(r.data.results||[])).catch(()=>{}).finally(()=>setLoading(false)) }
  useEffect(() => { load() }, [])

  const generate = async (type: string) => {
    setGen(true)
    try {
      // The API answers 202 immediately; the report is written in the background.
      const { data } = await copilotApi.generateReport({ report_type: type })
      toast.success('Report started. It will show as ready here when it finishes.')
      setShowNew(false); load()          // list shows the new report as "generating"
      const done = await pollUntil(
        () => copilotApi.reportDetail(data.report_id).then(r => r.data as AIReport),
        r => r.status === 'ready' || r.status === 'failed',
      )
      if (done.status === 'ready') toast.success('Report ready.')
      else toast.error('Generation failed.')
      load()
    } catch { toast.error('Generation failed.') } finally { setGen(false) }
  }

  const statusIcon = (s: string) => s==='ready' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" strokeWidth={1.75}/> : s==='failed' ? <AlertTriangle className="h-4 w-4 shrink-0 text-[#B91C1C]" strokeWidth={1.75}/> : <Clock className="h-4 w-4 shrink-0 text-[#A35A04]" strokeWidth={1.75}/>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Reports that pull findings from many documents at once, with the evidence they're based on."
        actions={<Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5"/> New report</Button>}
      />

      {showNew && (
        <Card>
          <CardHeader title="Choose a report" subtitle="Copilot reads the relevant documents and writes the report for you."
            action={<button onClick={() => setShowNew(false)} aria-label="Close" className="rounded-[6px] p-1 text-[#8A877F] hover:bg-[#F1EFEA] hover:text-[#0E0D0A]"><X className="h-4 w-4"/></button>}/>
          <CardBody>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {REPORT_TYPES.map(rt => (
                <button key={rt.key} onClick={() => generate(rt.key)} disabled={generating}
                  className="rounded-[8px] border border-[#DDD9D0] p-4 text-left transition-colors hover:border-[#BDB8AC] hover:bg-[#FBFAF7] disabled:cursor-not-allowed disabled:opacity-55">
                  <p className="mb-0.5 text-[14px] font-medium text-[#0E0D0A]">{rt.label}</p>
                  <p className="text-[13px] text-[#8A877F]">{rt.desc}</p>
                </button>
              ))}
            </div>
            {generating && <p className="mt-4 text-[13px] text-[#5A5750]">Generating the report — this reads through your documents and can take a minute…</p>}
          </CardBody>
        </Card>
      )}

      {selected ? (
        <Card>
          <CardHeader title={selected.title} action={<Button variant="ghost" size="sm" onClick={() => setSelected(null)}><ArrowLeft className="h-3.5 w-3.5"/> All reports</Button>}/>
          <CardBody className="space-y-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#5A5750]">
              <Badge variant={selected.status==='ready'?'green':'amber'} className="capitalize">{selected.status}</Badge>
              <span><span className="tabular-nums">{selected.doc_count}</span> documents analysed</span>
              <span>Confidence <span className="tabular-nums">{Math.round(selected.confidence_score*100)}%</span></span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => exportReportPdf(selected)}
                disabled={selected.status !== 'ready'} title={selected.status !== 'ready' ? 'The report is not finished yet.' : 'Opens a print view — choose "Save as PDF"'}>
                <Download className="h-3.5 w-3.5"/> Export PDF
              </Button>
            </div>
            {selected.executive_summary && (
              <div className="rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7] p-4">
                <p className="mb-1.5 text-[12.5px] font-medium text-[#8A877F]">Summary</p>
                <p className="text-[14px] leading-relaxed text-[#2B2924]">{selected.executive_summary}</p>
              </div>
            )}
            {selected.key_findings?.length > 0 && (
              <div>
                <h4 className="mb-2 text-[14px] font-semibold text-[#0E0D0A]">Key findings</h4>
                <ol className="space-y-2">
                  {selected.key_findings.map((f,i) => (
                    <li key={i} className="flex items-start gap-3 text-[14px] text-[#2B2924]">
                      <span className="w-5 shrink-0 text-right text-[13px] tabular-nums text-[#8A877F]">{i+1}.</span>{f}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {selected.recommendations?.length > 0 && (
              <div>
                <h4 className="mb-2 text-[14px] font-semibold text-[#0E0D0A]">Recommendations</h4>
                <ul className="space-y-2">
                  {selected.recommendations.map((r,i) => (
                    <li key={i} className="flex items-start gap-3 text-[14px] text-[#2B2924]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#15803D]" strokeWidth={1.75}/>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h4 className="mb-2 text-[14px] font-semibold text-[#0E0D0A]">Full report</h4>
              <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7] p-4 text-[14px] leading-relaxed text-[#2B2924]">
                {selected.full_content}
              </div>
            </div>
          </CardBody>
        </Card>
      ) : loading ? (
        <Card>
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]"/>)}
          </div>
        </Card>
      ) : reports.length === 0 ? (
        <Card>
          <EmptyState icon={<FileBarChart/>} title="No reports yet"
            action={<Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5"/> New report</Button>}>
            Pick a report type — for example a contract summary — and Copilot will write it from your documents.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          {reports.map(r => (
            <div key={r.id} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0 hover:bg-[#FBFAF7]">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setSelected(r)}>
                {statusIcon(r.status)}
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[#0E0D0A]">{r.title}</p>
                  <p className="text-[12.5px] text-[#8A877F]">{r.doc_count} documents · {formatDateTime(r.created_at)}</p>
                </div>
              </button>
              <Badge variant={r.status==='ready'?'green':r.status==='failed'?'red':'amber'} className="capitalize">{r.status}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

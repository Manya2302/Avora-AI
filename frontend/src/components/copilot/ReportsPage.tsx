'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileBarChart, Plus, Download, CheckCircle2, AlertTriangle, Clock, X } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import type { AIReport } from '@/types'
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'

const REPORT_TYPES = [
  { key:'vendor_compliance', label:'Vendor Compliance Report',  desc:'Compliance status across all vendors' },
  { key:'audit_evidence',    label:'Audit Evidence Package',    desc:'Evidence-based audit readiness summary' },
  { key:'contract_summary',  label:'Contract Summary Report',   desc:'Active contracts, expiry, and key terms' },
  { key:'risk_assessment',   label:'Risk Assessment Report',    desc:'Financial, legal, and compliance risks' },
  { key:'compliance_gap',    label:'Compliance Gap Analysis',   desc:'Missing documents and action plan' },
]

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
      await copilotApi.generateReport({ report_type: type })
      toast.success('Report generated!')
      setShowNew(false); load()
    } catch { toast.error('Generation failed.') } finally { setGen(false) }
  }

  const statusIcon = (s: string) => s==='ready' ? <CheckCircle2 className="w-5 h-5 text-green-600"/> : s==='failed' ? <AlertTriangle className="w-5 h-5 text-red-500"/> : <Clock className="w-5 h-5 text-amber-500 animate-pulse"/>

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><FileBarChart className="w-5 h-5 text-[#1A3DAF]"/></div>
          <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">AI Generated Reports</h2>
            <p className="text-sm text-[#9B9890]">Multi-document analysis reports with evidence</p></div>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="w-3.5 h-3.5"/> Generate Report</Button>
      </div>

      {showNew && (
        <Card>
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-[#0E0D0A]">Choose Report Type</span>
              <button onClick={() => setShowNew(false)}><X className="w-4 h-4 text-[#9B9890]"/></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {REPORT_TYPES.map(rt => (
                <button key={rt.key} onClick={() => generate(rt.key)} disabled={generating}
                  className="text-left p-4 border border-[#DDD9D0] rounded-[12px] hover:border-[#1A3DAF]/40 hover:bg-[#EBF0FF] transition-all disabled:opacity-50">
                  <p className="font-semibold text-[#0E0D0A] text-sm mb-1">{rt.label}</p>
                  <p className="text-xs text-[#9B9890]">{rt.desc}</p>
                </button>
              ))}
            </div>
            {generating && <p className="text-center text-sm text-[#1A3DAF] mt-4">Generating report — analyzing documents…</p>}
          </div>
        </Card>
      )}

      {selected ? (
        <Card>
          <CardHeader title={selected.title} action={<Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back to list</Button>}/>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={selected.status==='ready'?'green':'amber'}>{selected.status}</Badge>
              <span className="font-mono text-xs text-[#9B9890]">{selected.doc_count} documents analyzed</span>
              <span className="font-mono text-xs text-[#9B9890]">Confidence: {Math.round(selected.confidence_score*100)}%</span>
              <Button variant="dark" size="sm" className="ml-auto"><Download className="w-3.5 h-3.5"/> Export PDF</Button>
            </div>
            {selected.executive_summary && (
              <div className="p-4 bg-[#EBF0FF] border border-[#1A3DAF]/12 rounded-[11px]">
                <p className="text-xs font-semibold text-[#1A3DAF] mb-1.5">Executive Summary</p>
                <p className="text-sm text-[#1A3DAF]/85 leading-relaxed">{selected.executive_summary}</p>
              </div>
            )}
            {selected.key_findings?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#0E0D0A] mb-2">Key Findings</p>
                <ul className="space-y-2">
                  {selected.key_findings.map((f,i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#5A5750]">
                      <div className="w-5 h-5 rounded-full bg-[#F7F5F0] flex items-center justify-center font-mono text-[9px] font-bold text-[#5A5750] flex-shrink-0 mt-0.5">{i+1}</div>{f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selected.recommendations?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[#0E0D0A] mb-2">Recommendations</p>
                <ul className="space-y-2">
                  {selected.recommendations.map((r,i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#5A5750] p-2.5 bg-green-50 border border-green-100 rounded-[8px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5"/>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-[#0E0D0A] mb-2">Full Report</p>
              <div className="p-4 bg-[#F7F5F0] rounded-[11px] text-sm text-[#5A5750] whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {selected.full_content}
              </div>
            </div>
          </CardBody>
        </Card>
      ) : loading ? (
        <div className="h-32 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse"/>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#DDD9D0] rounded-[16px]">
          <FileBarChart className="w-10 h-10 text-[#DDD9D0] mx-auto mb-3"/>
          <p className="text-sm text-[#9B9890] mb-4">No reports yet. Generate your first AI report.</p>
          <Button size="sm" onClick={() => setShowNew(true)}><Plus className="w-3.5 h-3.5"/> Generate Report</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <Card key={r.id}>
              <CardBody>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => setSelected(r)}>
                    {statusIcon(r.status)}
                    <div>
                      <p className="font-semibold text-[#0E0D0A] text-sm">{r.title}</p>
                      <p className="font-mono text-[11px] text-[#9B9890]">{r.doc_count} docs · {formatDateTime(r.created_at)}</p>
                    </div>
                  </div>
                  <Badge variant={r.status==='ready'?'green':r.status==='failed'?'red':'amber'}>{r.status}</Badge>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

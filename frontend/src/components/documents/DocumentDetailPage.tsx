'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Share2, Trash2, ArrowLeft, Sparkles, Lock, Edit3, History, Save, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { useDocument } from '@/hooks/useDocuments'
import { documentsApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import { formatBytes, formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function DocumentDetailPage({ id }: { id: string }) {
  const router = useRouter()
  const { doc, loading, refetch } = useDocument(id)
  const [activeTab, setActiveTab] = useState<'preview' | 'ocr' | 'editor' | 'timeline'>('preview')
  
  const [changeLogs, setChangeLogs] = useState<any[]>([])
  const [documentRisks, setDocumentRisks] = useState<any[]>([])
  const [risksExpanded, setRisksExpanded] = useState(false)
  const [editorContent, setEditorContent] = useState<string>('')
  const [saving, setSaving] = useState(false)
  
  useEffect(() => {
    if (doc?.ocr_text && !editorContent) {
      setEditorContent(doc.ocr_text)
    }
  }, [doc])

  const fetchDocumentRisks = async () => {
    try {
      const res = await documentsApi.risks(id)
      setDocumentRisks(res.data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchDocumentRisks()
  }, [id, doc?.version])

  const fetchChangeLogs = async () => {
    try {
      const res = await documentsApi.changeLogs(id)
      setChangeLogs(res.data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (activeTab === 'timeline') {
      fetchChangeLogs()
    }
  }, [activeTab, id])

  const handleSaveVersion = async () => {
    try {
      setSaving(true)
      await documentsApi.saveVersion(id, editorContent)
      toast.success('New version saved. Temporal analysis started.')
      refetch()
      setActiveTab('timeline')
    } catch (e) {
      toast.error('Failed to save version')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to permanently delete this document?')) return;
    try {
      await documentsApi.delete(id);
      router.push('/documents');
    } catch (e) {
      alert('Failed to delete document');
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-sm text-[#9B9890]">Loading document…</div>
  if (!doc)    return <div className="flex items-center justify-center h-64 text-sm text-[#9B9890]">Document not found.</div>

  const ext = doc.file_extension?.replace('.','').toLowerCase()

  return (
    <div className="space-y-5 max-w-5xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[#9B9890] hover:text-[#0E0D0A] transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Documents
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Preview and Text Viewer */}
        <div className="lg:col-span-3">
          <Card>
            <div className="px-5 py-4 border-b border-[#ECEAE4] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-t-[16px]">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`text-sm font-semibold pb-1 border-b-2 transition-all ${activeTab === 'preview' ? 'border-[#1A3DAF] text-[#1A3DAF]' : 'border-transparent text-[#9B9890] hover:text-[#0E0D0A]'}`}
                >
                  Preview
                </button>
                <button
                  onClick={() => setActiveTab('editor')}
                  className={`text-sm font-semibold pb-1 border-b-2 transition-all flex items-center gap-1 ${activeTab === 'editor' ? 'border-[#1A3DAF] text-[#1A3DAF]' : 'border-transparent text-[#9B9890] hover:text-[#0E0D0A]'}`}
                >
                  <Edit3 className="w-3.5 h-3.5" /> High-Fidelity Editor
                </button>
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`text-sm font-semibold pb-1 border-b-2 transition-all flex items-center gap-1 ${activeTab === 'timeline' ? 'border-[#1A3DAF] text-[#1A3DAF]' : 'border-transparent text-[#9B9890] hover:text-[#0E0D0A]'}`}
                >
                  <History className="w-3.5 h-3.5" /> Temporal Intelligence
                </button>
                <button
                  onClick={() => setActiveTab('ocr')}
                  className={`text-sm font-semibold pb-1 border-b-2 transition-all flex items-center gap-1 ${activeTab === 'ocr' ? 'border-[#1A3DAF] text-[#1A3DAF]' : 'border-transparent text-[#9B9890] hover:text-[#0E0D0A]'}`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Raw OCR
                </button>
              </div>
              <div className="flex gap-2">
                {activeTab === 'editor' && (
                  <Button variant="dark" size="sm" className="gap-1.5" onClick={handleSaveVersion} disabled={saving}>
                    {saving ? <Clock className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Version
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="gap-1.5"><Download className="w-3 h-3" /> Download</Button>
                <Button variant="ghost" size="sm" className="gap-1.5"><Share2 className="w-3 h-3" /> Share</Button>
                <Button variant="red" size="sm" onClick={handleDelete}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
            {activeTab === 'preview' && (
              <CardBody className="p-0">
                <div className="min-h-[500px] bg-[#F7F5F0] flex items-center justify-center rounded-b-[16px]">
                  <div className="text-center">
                    <div className="w-20 h-24 bg-white border border-[#DDD9D0] rounded-[11px] shadow-md mx-auto mb-4 flex items-center justify-center">
                      <span className="font-mono text-lg font-bold text-[#9B9890]">{ext?.toUpperCase().slice(0,4)}</span>
                    </div>
                    <p className="text-sm font-medium text-[#0E0D0A]">{doc.original_name}</p>
                    <p className="text-xs text-[#9B9890] mt-1 font-mono">{formatBytes(doc.original_size)}</p>
                    <Button variant="dark" size="sm" className="mt-4"><Download className="w-3 h-3" /> Download to view</Button>
                  </div>
                </div>
              </CardBody>
            )}

            {activeTab === 'editor' && (
              <div className="bg-[#F0F2F5] p-8 min-h-[600px] flex justify-center rounded-b-[16px] overflow-y-auto">
                <div className="bg-white w-[21cm] min-h-[29.7cm] shadow-lg border border-[#DDD9D0] p-12 focus-within:ring-2 focus-within:ring-[#1A3DAF] transition-all">
                  <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-200">
                     <span className="font-semibold text-gray-500 text-sm">Avora Editor — Preserve Original Format</span>
                     <span className="ml-auto text-xs text-gray-400 font-mono">Editing v{doc.version}</span>
                  </div>
                  <textarea 
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    className="w-full h-full min-h-[800px] resize-none outline-none font-serif text-[15px] leading-relaxed text-[#252318] bg-transparent"
                    placeholder="Document content goes here..."
                  />
                </div>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="p-6 bg-white min-h-[500px] max-h-[800px] overflow-y-auto rounded-b-[16px]">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-lg text-[#0E0D0A]">Version History & Temporal Analysis</h3>
                  <Badge variant="blue"><Sparkles className="w-3 h-3 mr-1 inline" /> AI Intelligence Active</Badge>
                </div>
                
                {changeLogs.length === 0 ? (
                  <div className="text-center py-20 text-[#9B9890]">
                    <History className="w-8 h-8 mx-auto mb-2 text-[#DDD9D0]" />
                    <p className="text-sm">No version changes recorded yet.</p>
                  </div>
                ) : (
                  <div className="relative border-l border-[#ECEAE4] ml-3 space-y-8 pb-8">
                    {changeLogs.map((log) => (
                      <div key={log.id} className="relative pl-6">
                        <div className="absolute w-3 h-3 bg-white border-2 border-[#1A3DAF] rounded-full -left-[6.5px] top-1.5" />
                        
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-sm font-bold text-[#0E0D0A]">v{log.from_version?.version_number} → v{log.to_version?.version_number}</span>
                          <span className="text-xs text-[#9B9890] font-mono">{formatDateTime(log.created_at)}</span>
                        </div>

                        <div className="bg-[#F7F5F0] border border-[#DDD9D0] rounded-xl p-4 mt-3 space-y-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-[#5A5750] mb-1 flex items-center gap-1.5"><Edit3 className="w-3.5 h-3.5" /> What Changed</p>
                            <p className="text-sm text-[#252318] leading-relaxed">{log.ai_summary || 'Analysis pending...'}</p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#ECEAE4]">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-[#D93025] mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Risk Introduced</p>
                              <p className="text-sm text-[#252318] leading-relaxed">{log.ai_risk || 'Analysis pending...'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-[#1A3DAF] mb-1 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Compliance Impact</p>
                              <p className="text-sm text-[#252318] leading-relaxed">{log.ai_compliance || 'Analysis pending...'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'ocr' && (
              <div className="p-6 bg-white min-h-[400px] max-h-[600px] overflow-y-auto border-t border-[#DDD9D0] rounded-b-[16px] select-text">
                {doc.ocr_text ? (
                  <pre className="whitespace-pre-wrap font-sans text-[14.5px] text-[#252318] leading-relaxed font-light">
                    {doc.ocr_text}
                  </pre>
                ) : (
                  <div className="text-center py-20 text-[#9B9890]">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-[#DDD9D0] animate-pulse" />
                    <p className="text-sm">No OCR text available for this document.</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Info panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Metadata */}
          <Card>
            <CardHeader title="Document Details" />
            <CardBody className="space-y-3">
              {[
                { label: 'Category',   value: doc.category || '—' },
                { label: 'File Type',  value: ext?.toUpperCase() || '—' },
                { label: 'Size',       value: formatBytes(doc.original_size) },
                { label: 'Status',     value: <Badge variant={doc.status === 'ai_ready' ? 'green' : 'amber'}>{doc.status.replace('_',' ')}</Badge> },
                { label: 'Uploaded',   value: formatDateTime(doc.created_at) },
                { label: 'Version',    value: `v${doc.version}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs font-mono text-[#9B9890] uppercase tracking-[0.5px]">{label}</span>
                  <span className="text-sm font-medium text-[#0E0D0A]">{value}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Collapsible AI Compliance Findings (Side Panel) */}
          {documentRisks.length > 0 && (
            <div className="relative">
              <button 
                onClick={() => setRisksExpanded(!risksExpanded)}
                className={`w-full flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 bg-white border ${risksExpanded ? 'border-[#1A3DAF] rounded-t-[14px]' : 'border-[#DDD9D0] rounded-[14px]'} shadow-sm hover:border-[#1A3DAF] transition-all gap-2`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  </div>
                  <span className="font-semibold text-[13px] text-[#0E0D0A] text-left leading-tight">
                    {documentRisks.length} AI Compliance {documentRisks.length === 1 ? 'Risk' : 'Risks'} Found
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#1A3DAF] whitespace-nowrap bg-blue-50 px-2 py-1 rounded-md">
                  {risksExpanded ? 'Close' : 'View'}
                </span>
              </button>
              
              {risksExpanded && (
                <div className="bg-white border border-t-0 border-[#1A3DAF] rounded-b-[14px] p-3 shadow-sm space-y-3">
                  {documentRisks.map((risk) => (
                    <div key={risk.id} className="p-3 bg-[#F7F5F0] border border-[#DDD9D0] rounded-xl text-left">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                         <Badge variant={risk.severity === 'critical' || risk.severity === 'high' ? 'red' : 'amber'}>{risk.severity}</Badge>
                         <span className="font-semibold text-xs text-[#0E0D0A] truncate">{risk.compliance_standard}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-[#5A5750] mb-1">{risk.risk_type}</p>
                      <p className="text-xs font-light text-[#252318] leading-relaxed mb-2">{risk.description}</p>
                      <p className="text-[11px] font-mono text-green-700 bg-green-50 p-2 rounded-lg border border-green-200">
                        <strong className="block text-green-800 mb-0.5 uppercase tracking-wide">Suggested Fix</strong>
                        {risk.suggested_fix}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {doc.tags?.length > 0 && (
            <Card>
              <CardHeader title="Tags" />
              <CardBody>
                <div className="flex flex-wrap gap-2">
                  {doc.tags.map(tag => (
                    <span key={tag} className="font-mono text-[10px] font-medium px-2.5 py-1 rounded-full bg-[#F7F5F0] border border-[#DDD9D0] text-[#5A5750]">{tag}</span>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* AI Summary */}
          {doc.ai_summary && (
            <Card>
              <CardHeader title="Orivo AI Summary" action={<Sparkles className="w-4 h-4 text-[#1A3DAF]" />} />
              <CardBody>
                <p className="text-sm font-light text-[#5A5750] leading-relaxed">{doc.ai_summary}</p>
              </CardBody>
            </Card>
          )}



          {/* Encryption */}
          <Card>
            <CardHeader title="Encryption Details" action={<Lock className="w-4 h-4 text-green-600" />} />
            <CardBody className="space-y-2.5">
              {[
                { label: 'Algorithm',   value: 'AES-256-GCM', ok: true },
                { label: 'Key Wrap',    value: 'RSA-4096',    ok: true },
                { label: 'Chunks',      value: `${doc.total_chunks} × 10 MB` },
                { label: 'Integrity',   value: 'SHA-256 ✓',   ok: true },
                { label: 'Compressed',  value: formatBytes(doc.compressed_size) },
              ].map(({ label, value, ok }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-[#ECEAE4] last:border-0">
                  <span className="text-xs font-light text-[#5A5750]">{label}</span>
                  <span className={`font-mono text-xs font-semibold ${ok ? 'text-green-600' : 'text-[#0E0D0A]'}`}>{value}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

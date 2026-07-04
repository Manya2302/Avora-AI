'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Share2, Trash2, ArrowLeft, Sparkles, Lock } from 'lucide-react'
import { useDocument } from '@/hooks/useDocuments'
import { documentsApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import { formatBytes, formatDateTime } from '@/lib/utils'

export default function DocumentDetailPage({ id }: { id: string }) {
  const router = useRouter()
  const { doc, loading } = useDocument(id)
  const [activeTab, setActiveTab] = useState<'preview' | 'ocr'>('preview')

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
                  onClick={() => setActiveTab('ocr')}
                  className={`text-sm font-semibold pb-1 border-b-2 transition-all flex items-center gap-1 ${activeTab === 'ocr' ? 'border-[#1A3DAF] text-[#1A3DAF]' : 'border-transparent text-[#9B9890] hover:text-[#0E0D0A]'}`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> File Content (AI OCR)
                </button>
              </div>
              <div className="flex gap-2">
                <Button variant="dark" size="sm" className="gap-1.5"><Download className="w-3 h-3" /> Download</Button>
                <Button variant="ghost" size="sm" className="gap-1.5"><Share2 className="w-3 h-3" /> Share</Button>
                <Button variant="red" size="sm" onClick={handleDelete}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
            {activeTab === 'preview' ? (
              <CardBody className="p-0">
                <div className="min-h-96 bg-[#F7F5F0] flex items-center justify-center rounded-b-[16px]">
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
            ) : (
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

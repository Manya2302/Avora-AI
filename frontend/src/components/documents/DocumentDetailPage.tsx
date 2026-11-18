'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Share2, Trash2, ArrowLeft, ArrowRight, Sparkles, Lock, Edit3, History, Save, AlertTriangle, CheckCircle, Clock, FileText, ChevronDown, ScanText } from 'lucide-react'
import { useDocument } from '@/hooks/useDocuments'
import { documentsApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { cn, formatBytes, formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import { downloadDocument } from './downloadDocument'
import ShareDocumentModal from './ShareDocumentModal'

/** Encryption facts recorded for this document (see DocumentDetailSerializer.get_encryption). */
interface EncryptionInfo { algorithm: string | null; chunks_stored: number; chunks_hashed: number; stored_bytes: number }

const STATUS: Record<string, { label: string; variant: 'green' | 'blue' | 'amber' | 'red' | 'gray' }> = {
  ai_ready:   { label: 'Ready',      variant: 'green' },
  encrypted:  { label: 'Encrypted',  variant: 'blue' },
  processing: { label: 'Processing', variant: 'amber' },
  uploading:  { label: 'Uploading',  variant: 'gray' },
  failed:     { label: 'Failed',     variant: 'red' },
}

export default function DocumentDetailPage({ id }: { id: string }) {
  const router = useRouter()
  const { doc, loading, refetch } = useDocument(id)
  const [activeTab, setActiveTab] = useState<'preview' | 'ocr' | 'editor' | 'timeline'>('preview')

  const [changeLogs, setChangeLogs] = useState<any[]>([])
  const [documentRisks, setDocumentRisks] = useState<any[]>([])
  const [risksExpanded, setRisksExpanded] = useState(false)
  const [editorContent, setEditorContent] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

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
      toast.success('New version saved. The text is being re-indexed and compared with the previous version.')
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
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'The document could not be deleted.');
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <div className="h-8 w-64 max-w-full animate-pulse rounded-[6px] bg-[#ECEAE4]" />
      <div className="h-[420px] animate-pulse rounded-[12px] bg-[#ECEAE4]/60" />
    </div>
  )
  if (!doc) return (
    <Card>
      <EmptyState icon={<FileText />} title="Document not found"
        action={<Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-3.5 w-3.5" /> Go back</Button>}>
        It may have been deleted, or you may not have access to it.
      </EmptyState>
    </Card>
  )

  const ext = doc.file_extension?.replace('.','').toLowerCase()
  const enc = (doc as typeof doc & { encryption?: EncryptionInfo }).encryption
  const canDownload = doc.status !== 'uploading'
  const download = () => downloadDocument(doc.id, doc.original_name)
  const st = STATUS[doc.status] || { label: doc.status.replace('_', ' '), variant: 'gray' as const }

  const tabs: { key: 'preview' | 'ocr' | 'editor' | 'timeline'; label: string }[] = [
    { key: 'preview',  label: 'Preview' },
    { key: 'editor',   label: 'Edit text' },
    { key: 'timeline', label: 'Version history' },
    { key: 'ocr',      label: 'Extracted text' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[#8A877F] transition-colors hover:text-[#0E0D0A]">
          <ArrowLeft className="h-3.5 w-3.5" /> Documents
        </button>
        <PageHeader
          title={<span className="break-words">{doc.original_name}</span>}
          description={[ext?.toUpperCase(), formatBytes(doc.original_size), `Version ${doc.version}`, `Uploaded ${formatDateTime(doc.created_at)}`].filter(Boolean).join(' · ')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Preview and text viewer */}
        <div className="min-w-0 lg:col-span-3">
          <Card>
            <div className="flex flex-col justify-between gap-3 border-b border-[#ECEAE4] px-5 pt-3 sm:flex-row sm:items-end">
              <div className="-mb-px flex gap-5 overflow-x-auto" role="tablist">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={activeTab === t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      'shrink-0 border-b-2 pb-2.5 text-[14px] transition-colors',
                      activeTab === t.key ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pb-2.5">
                {activeTab === 'editor' && (
                  <Button variant="dark" size="sm" onClick={handleSaveVersion} disabled={saving}>
                    {saving ? <Clock className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save version
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={download} disabled={!canDownload}
                  title={canDownload ? undefined : 'Available once the upload finishes'}><Download className="h-3.5 w-3.5" /> Download</Button>
                <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)}><Share2 className="h-3.5 w-3.5" /> Share</Button>
                <Button variant="red" size="sm" onClick={handleDelete} aria-label="Delete document"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            {activeTab === 'preview' && (
              <CardBody className="p-0">
                <div className="flex min-h-[460px] items-center justify-center bg-[#FBFAF7] px-6">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-24 w-20 items-center justify-center rounded-[8px] border border-[#DDD9D0] bg-white">
                      <span className="text-[15px] font-semibold text-[#8A877F]">{ext?.toUpperCase().slice(0,4)}</span>
                    </div>
                    <p className="break-words text-[14px] font-medium text-[#0E0D0A]">{doc.original_name}</p>
                    <p className="mt-1 text-[12.5px] text-[#8A877F]">{formatBytes(doc.original_size)}</p>
                    <Button variant="dark" size="sm" className="mt-4" onClick={download} disabled={!canDownload}
                      title={canDownload ? undefined : 'Available once the upload finishes'}><Download className="h-3.5 w-3.5" /> Download to view</Button>
                  </div>
                </div>
              </CardBody>
            )}

            {activeTab === 'editor' && (
              <div className="flex min-h-[600px] justify-center overflow-y-auto bg-[#F1EFEA] p-3 sm:p-8">
                <div className="min-h-[29.7cm] w-full max-w-[21cm] rounded-[4px] border border-[#DDD9D0] bg-white p-6 transition-colors focus-within:border-[#1A3DAF] sm:p-12">
                  <div className="mb-6 flex items-center gap-2 border-b border-[#ECEAE4] pb-2">
                     <span className="text-[13px] text-[#5A5750]">Saving creates a new version; the original file is kept.</span>
                     <span className="ml-auto shrink-0 text-[12.5px] text-[#8A877F]">Editing v{doc.version}</span>
                  </div>
                  <textarea
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    className="h-full min-h-[800px] w-full resize-none bg-transparent font-serif text-[15px] leading-relaxed text-[#2B2924] outline-none placeholder:text-[#9B9890]"
                    placeholder="Document content goes here..."
                  />
                </div>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="max-h-[800px] min-h-[460px] overflow-y-auto p-5">
                <p className="mb-5 text-[13px] text-[#8A877F]">Each saved version is compared with the one before it.</p>

                {changeLogs.length === 0 ? (
                  <EmptyState icon={<History />} title="No changes yet">
                    Edit the text and save a version to start a history.
                  </EmptyState>
                ) : (
                  <div className="relative ml-1.5 space-y-7 border-l border-[#DDD9D0] pb-4">
                    {changeLogs.map((log) => (
                      <div key={log.id} className="relative pl-5">
                        <div className="absolute -left-[4.5px] top-[7px] h-2 w-2 rounded-full bg-[#1A3DAF]" />

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#0E0D0A]">
                            v{log.from_version?.version_number}
                            <ArrowRight className="h-3.5 w-3.5 text-[#8A877F]" aria-label="to" />
                            v{log.to_version?.version_number}
                          </span>
                          <span className="text-[12.5px] text-[#8A877F]">{formatDateTime(log.created_at)}</span>
                        </div>

                        <div className="mt-3 space-y-4 rounded-[10px] border border-[#ECEAE4] bg-[#FBFAF7] p-4">
                          <div>
                            <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-[#5A5750]"><Edit3 className="h-3.5 w-3.5" strokeWidth={1.75} /> What changed</p>
                            <p className="text-[13.5px] leading-relaxed text-[#2B2924]">{log.ai_summary || 'Analysis pending...'}</p>
                          </div>

                          <div className="grid grid-cols-1 gap-4 border-t border-[#ECEAE4] pt-3 sm:grid-cols-2">
                            <div>
                              <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-[#B91C1C]"><AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} /> Risk introduced</p>
                              <p className="text-[13.5px] leading-relaxed text-[#2B2924]">{log.ai_risk || 'Analysis pending...'}</p>
                            </div>
                            <div>
                              <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-[#1A3DAF]"><CheckCircle className="h-3.5 w-3.5" strokeWidth={1.75} /> Compliance impact</p>
                              <p className="text-[13.5px] leading-relaxed text-[#2B2924]">{log.ai_compliance || 'Analysis pending...'}</p>
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
              <div className="max-h-[600px] min-h-[400px] select-text overflow-y-auto p-5">
                {doc.ocr_text ? (
                  <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-[#2B2924]">
                    {doc.ocr_text}
                  </pre>
                ) : (
                  <EmptyState icon={<ScanText />} title="No extracted text">
                    Text appears here once the document has been read. Scanned images can take a few minutes.
                  </EmptyState>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Info panel */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {/* Metadata */}
          <Card>
            <CardHeader title="Details" />
            <dl className="px-5 py-2">
              {[
                { label: 'Category',   value: doc.category || '—' },
                { label: 'File type',  value: ext?.toUpperCase() || '—' },
                { label: 'Size',       value: formatBytes(doc.original_size) },
                { label: 'Status',     value: <Badge variant={st.variant}>{st.label}</Badge> },
                { label: 'Uploaded',   value: formatDateTime(doc.created_at) },
                { label: 'Version',    value: `v${doc.version}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-4 border-t border-[#F1EFEA] py-2.5 first:border-0">
                  <dt className="text-[13px] text-[#8A877F]">{label}</dt>
                  <dd className="text-right text-[13.5px] text-[#0E0D0A]">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Collapsible compliance findings */}
          {documentRisks.length > 0 && (
            <div className={cn('overflow-hidden rounded-[12px] border bg-white transition-colors', risksExpanded ? 'border-[#DDD9D0]' : 'border-[#DDD9D0] hover:border-[#BDB8AC]')}>
              <button
                onClick={() => setRisksExpanded(!risksExpanded)}
                aria-expanded={risksExpanded}
                className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]" />
                  <span className="text-[14px] font-semibold text-[#0E0D0A]">
                    {documentRisks.length} compliance {documentRisks.length === 1 ? 'risk' : 'risks'} found
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[13px] text-[#1A3DAF]">
                  {risksExpanded ? 'Close' : 'View'}
                  <ChevronDown className={cn('h-4 w-4 transition-transform', risksExpanded && 'rotate-180')} strokeWidth={1.75} />
                </span>
              </button>

              {risksExpanded && (
                <ul className="border-t border-[#ECEAE4]">
                  {documentRisks.map((risk) => (
                    <li key={risk.id} className="border-t border-[#F1EFEA] px-5 py-4 first:border-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                         <Badge variant={risk.severity === 'critical' || risk.severity === 'high' ? 'red' : 'amber'}>{risk.severity}</Badge>
                         <span className="truncate text-[13px] font-medium text-[#0E0D0A]">{risk.compliance_standard}</span>
                      </div>
                      <p className="mb-1 text-[13px] font-medium text-[#2B2924]">{risk.risk_type}</p>
                      <p className="mb-2.5 text-[13px] leading-relaxed text-[#5A5750]">{risk.description}</p>
                      <div className="rounded-[8px] bg-[#EDF7F0] px-3 py-2 text-[13px] leading-relaxed text-[#2B2924]">
                        <span className="mb-0.5 block text-[12.5px] font-medium text-[#15803D]">Suggested fix</span>
                        {risk.suggested_fix}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Tags */}
          {doc.tags?.length > 0 && (
            <Card>
              <CardHeader title="Tags" />
              <CardBody>
                <div className="flex flex-wrap gap-1.5">
                  {doc.tags.map(tag => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {/* AI Summary */}
          {doc.ai_summary && (
            <Card>
              <CardHeader title="Summary" action={<Sparkles className="h-4 w-4 text-[#8A877F]" strokeWidth={1.75} />} />
              <CardBody>
                <p className="text-[13.5px] leading-relaxed text-[#2B2924]">{doc.ai_summary}</p>
              </CardBody>
            </Card>
          )}



          {/* Encryption */}
          <Card>
            <CardHeader title="Encryption" action={<Lock className="h-4 w-4 text-[#15803D]" strokeWidth={1.75} />} />
            <dl className="px-5 py-2">
              {([
                enc?.algorithm ? { label: 'Algorithm', value: enc.algorithm } : null,
                { label: 'Chunks stored', value: `${enc ? enc.chunks_stored : '—'} of ${doc.total_chunks}`,
                  ok: !!enc && doc.total_chunks > 0 && enc.chunks_stored >= doc.total_chunks },
                enc && enc.chunks_hashed > 0 ? { label: 'SHA-256 checksums', value: `${enc.chunks_hashed} recorded` } : null,
                enc && enc.stored_bytes > 0 ? { label: 'Stored size', value: formatBytes(enc.stored_bytes) } : null,
                enc && enc.stored_bytes > 0 && doc.original_size > 0
                  ? { label: 'Original size', value: formatBytes(doc.original_size) } : null,
              ].filter(Boolean) as { label: string; value: string; ok?: boolean }[]).map(({ label, value, ok }) => (
                <div key={label} className="flex items-center justify-between gap-4 border-t border-[#F1EFEA] py-2.5 first:border-0">
                  <dt className="text-[13px] text-[#8A877F]">{label}</dt>
                  <dd className={cn('text-right text-[13.5px]', ok ? 'text-[#15803D]' : 'text-[#0E0D0A]')}>{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
      <ShareDocumentModal docId={doc.id} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  )
}

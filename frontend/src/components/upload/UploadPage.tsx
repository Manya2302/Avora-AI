'use client'
import { useCallback, useState, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { CloudUpload, CheckCircle2, AlertCircle, Loader2, FileText, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { documentsApi, orgApi } from '@/lib/api'
import { cn, formatBytes } from '@/lib/utils'
import { useUploadStore } from '@/store/uploadStore'
import GraphRecommendationCard from '@/components/knowledge/GraphRecommendationCard'

const ALLOWED = ['.pdf','.docx','.doc','.xlsx','.xls','.png','.jpg','.jpeg','.txt']
const MAX_SIZE = 5 * 1024 * 1024 * 1024

/** Hex SHA-256 of a chunk (the backend recomputes and compares it on receipt). */
async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

let tempSeq = 0

const ACCEPT_MIMES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'text/plain': ['.txt'],
}

export default function UploadPage() {
  const { queue, addToQueue, updateProgress, clearQueue } = useUploadStore()
  const [category, setCategory] = useState('Auto-detect (Orivo AI)')
  const [department, setDepartment] = useState('')
  const [visibility, setVisibility] = useState('private')
  const [graphProcessing, setGraphProcessing] = useState('ai')
  const [industry, setIndustry] = useState('generic')
  const [departments, setDepartments] = useState<any[]>([])
  const [uploadedDocs, setUploadedDocs] = useState<Array<{id: string, name: string}>>([])

  useEffect(() => {
    orgApi.departments().then(r => setDepartments(r.data.results || r.data || [])).catch(() => {})
  }, [])

  // Latest settings, read at upload time so a drop never uses stale values.
  const settingsRef = useRef({ category, department, visibility, graphProcessing, industry })
  settingsRef.current = { category, department, visibility, graphProcessing, industry }

  const uploadFile = useCallback(async (file: File) => {
    const { category, department, visibility, graphProcessing, industry } = settingsRef.current
    // Row id: a unique temp id until the server assigns the document id. Tracked in one variable
    // so a failure is always reported on the row as it is currently keyed.
    let rowId = `temp-${Date.now()}-${tempSeq++}`
    addToQueue({ documentId: rowId, fileName: file.name, totalChunks: 0, uploadedChunks: 0, status: 'uploading' })
    try {
      updateProgress(rowId, { status: 'encrypting' })
      const { data: init } = await documentsApi.initiateUpload({
        file_name: file.name, file_size: file.size,
        mime_type: file.type || 'application/octet-stream', category, department,
        visibility, graph_processing: graphProcessing,
        industry_edition: industry,
      })
      updateProgress(rowId, { documentId: init.document_id, totalChunks: init.total_chunks })
      rowId = init.document_id

      const CHUNK = init.chunk_size || 10 * 1024 * 1024
      let uploaded = 0

      for (let i = 0; i < init.total_chunks; i++) {
        // Read one chunk at a time instead of loading the whole (up to 5 GB) file into memory.
        const chunk = await file.slice(i * CHUNK, (i + 1) * CHUNK).arrayBuffer()
        const fd    = new FormData()
        fd.append('document_id', init.document_id)
        fd.append('chunk_index', String(i))
        fd.append('chunk_data',  new Blob([chunk]))
        fd.append('sha256_hash', await sha256Hex(chunk))
        await documentsApi.uploadChunk(fd)
        uploaded++
        updateProgress(rowId, { uploadedChunks: uploaded })
      }
      updateProgress(rowId, { status: 'done' })
      toast.success(`${file.name} uploaded and encrypted`)
      setUploadedDocs(p => [...p, { id: init.document_id, name: file.name }])
    } catch (e: any) {
      updateProgress(rowId, { status: 'error', error: e?.response?.data?.error || 'Upload failed' })
      toast.error(`Failed: ${file.name}`)
    }
  }, [addToQueue, updateProgress])

  const onDrop = useCallback((files: File[]) => { files.forEach(uploadFile) }, [uploadFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT_MIMES,
    maxSize: MAX_SIZE, multiple: true,
  })

  const statusIcon = (s: string) => {
    if (s === 'done')  return <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" strokeWidth={1.75} aria-label="Done" />
    if (s === 'error') return <AlertCircle  className="h-4 w-4 shrink-0 text-[#DC2626]" strokeWidth={1.75} aria-label="Failed" />
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#1A3DAF]" strokeWidth={1.75} aria-label="In progress" />
  }

  const getPercent = (q: any): number => {
    if (q.status === 'done')  return 100
    if (q.status === 'error') return 100
    if (!q.totalChunks)       return 5
    return Math.max(5, Math.round((q.uploadedChunks / q.totalChunks) * 100))
  }

  const statusText = (q: any) => {
    if (q.status === 'done')       return 'Encrypted and stored'
    if (q.status === 'error')      return q.error || 'Failed'
    if (q.status === 'encrypting') return 'Encrypting…'
    const pct = getPercent(q)
    return `Uploading… ${q.uploadedChunks || 0} / ${q.totalChunks || '?'} chunks · ${pct}%`
  }

  const totalFiles  = queue.length
  const doneCount   = queue.filter(q => q.status === 'done').length
  const failedCount = queue.filter(q => q.status === 'error').length
  const activeCount = queue.filter(q => q.status !== 'done' && q.status !== 'error').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload documents"
        description="Files are compressed and encrypted before they’re stored, then read so they can be searched."
      />

      {/* Drop zone */}
      <div {...getRootProps()} className={cn(
        'cursor-pointer rounded-[12px] border border-dashed px-6 py-12 text-center transition-colors sm:py-14',
        isDragActive ? 'border-[#1A3DAF] bg-[#EEF2FC]' : 'border-[#C9C4B9] bg-white hover:border-[#8A877F] hover:bg-[#FBFAF7]'
      )}>
        <input {...getInputProps()} />
        <CloudUpload className={cn('mx-auto mb-3 h-6 w-6', isDragActive ? 'text-[#1A3DAF]' : 'text-[#8A877F]')} strokeWidth={1.75} />
        <p className="text-[15px] font-medium text-[#0E0D0A]">{isDragActive ? 'Drop to upload and encrypt' : 'Drop files here, or click to choose'}</p>
        <p className="mt-1 text-[13px] text-[#8A877F]">Up to 5 GB per file</p>
        <p className="mt-3 text-[12.5px] text-[#8A877F]">
          {ALLOWED.map(ext => ext.toUpperCase().replace('.','')).join(' · ')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Upload queue */}
        <div className="min-w-0 lg:col-span-3">
          <Card>
            <CardHeader
              title="Upload queue"
              action={queue.length > 0 && <button onClick={clearQueue} className="link text-[13px]">Clear all</button>}
            />

            {/* Summary counters and overall progress */}
            {queue.length > 0 && (() => {
              const overallPct = Math.round(queue.reduce((acc, q) => acc + getPercent(q), 0) / queue.length)
              const allDone = overallPct === 100 && failedCount === 0
              return (
                <div className="border-b border-[#ECEAE4]">
                  <div className="flex flex-col gap-2 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-[#5A5750]">Overall progress</span>
                      <span className={cn('text-[13px] font-medium tabular-nums', allDone ? 'text-[#15803D]' : 'text-[#0E0D0A]')}>{overallPct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', allDone ? 'bg-[#16A34A]' : 'bg-[#1A3DAF]')}
                        style={{ width: `${overallPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 border-t border-[#F1EFEA] sm:grid-cols-4">
                    {[
                      { label: 'Total',     val: totalFiles,  color: 'text-[#0E0D0A]' },
                      { label: 'Uploading', val: activeCount, color: 'text-[#1A3DAF]' },
                      { label: 'Done',      val: doneCount,   color: 'text-[#15803D]' },
                      { label: 'Failed',    val: failedCount, color: failedCount ? 'text-[#B91C1C]' : 'text-[#0E0D0A]' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="border-[#F1EFEA] px-5 py-3 [&:not(:last-child)]:border-r">
                        <div className={cn('font-display text-[22px] font-semibold leading-none tabular-nums', color)}>{val}</div>
                        <div className="mt-1 text-[12.5px] text-[#8A877F]">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {queue.length === 0 ? (
              <EmptyState icon={<FileText />} title="Nothing queued">
                Drop files above to begin. Each one shows its progress here.
              </EmptyState>
            ) : (
              <ul>
                {queue.map(q => {
                  const pct = getPercent(q)
                  return (
                    <li key={q.documentId} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                      <FileText className="h-[18px] w-[18px] shrink-0 text-[#8A877F]" strokeWidth={1.75} />

                      <div className="min-w-0 flex-1">
                        {/* Filename + percentage */}
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#0E0D0A]">{q.fileName}</span>
                          <span className={cn('shrink-0 text-[12.5px] tabular-nums',
                            q.status === 'done'  ? 'text-[#15803D]' :
                            q.status === 'error' ? 'text-[#B91C1C]' : 'text-[#5A5750]'
                          )}>{pct}%</span>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]">
                          <div
                            className={cn('h-full rounded-full transition-all duration-500',
                              q.status === 'done'  ? 'bg-[#16A34A]' :
                              q.status === 'error' ? 'bg-[#DC2626]' :
                              'bg-[#1A3DAF]'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {/* Status text + chunk counter */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('min-w-0 truncate text-[12.5px]',
                            q.status === 'done'  ? 'text-[#15803D]' :
                            q.status === 'error' ? 'text-[#B91C1C]' : 'text-[#8A877F]'
                          )}>{statusText(q)}</span>
                          {q.totalChunks > 1 && q.status !== 'done' && q.status !== 'error' && (
                            <span className="shrink-0 text-[12px] tabular-nums text-[#8A877F]">
                              {q.uploadedChunks}/{q.totalChunks} chunks
                            </span>
                          )}
                        </div>
                      </div>

                      {statusIcon(q.status)}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* Graph Recommendations for uploaded docs */}
          {uploadedDocs.length > 0 && (
            <div className="mt-6 space-y-4">
              {uploadedDocs.map(doc => (
                <GraphRecommendationCard
                  key={doc.id}
                  documentId={doc.id}
                  docName={doc.name}
                  onDone={() => setUploadedDocs(p => p.filter(d => d.id !== doc.id))}
                />
              ))}
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="min-w-0 lg:col-span-2">
          <Card>
            <CardHeader title="Upload settings" subtitle="Applied to the next files you add." />
            <CardBody className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="field">
                  {['Auto-detect (Orivo AI)','Contract','Tax Filing','Invoice','Medical Record','Audit Report','Compliance','Other'].map(c => (
                    <option key={c} value={c}>{c === 'Auto-detect (Orivo AI)' ? 'Detect automatically' : c.charAt(0) + c.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">Industry</label>
                <select value={industry} onChange={e => setIndustry(e.target.value)} className="field">
                  <option value="generic">General</option>
                  <option value="healthcare">Healthcare (HIPAA, medical records)</option>
                  <option value="legal">Legal (contracts, clauses, risk)</option>
                  <option value="finance">Finance (AML, KYC, regulatory)</option>
                  <option value="manufacturing">Manufacturing (SOPs, ISO)</option>
                  <option value="government">Government (records, audits)</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">Department</label>
                <select value={department} onChange={e => setDepartment(e.target.value)} className="field">
                  <option value="">No department</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">Who can see it</label>
                <select value={visibility} onChange={e => setVisibility(e.target.value)} className="field">
                  <option value="private">Private (only me)</option>
                  <option value="department">Department</option>
                  <option value="organization">Organisation (everyone)</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">Knowledge graph</label>
                <select value={graphProcessing} onChange={e => setGraphProcessing(e.target.value)} className="field">
                  <option value="ai">Decide per document (recommended)</option>
                  <option value="always">Always add</option>
                  <option value="never">Never add</option>
                </select>
              </div>
              <div className="border-t border-[#ECEAE4] pt-4">
                <p className="mb-2 text-[12.5px] text-[#8A877F]">Applied to every upload</p>
                <ul className="space-y-2">
                  {['ZSTD compression', 'AES-256-GCM encryption', 'SHA-256 checksum per chunk', 'Text extraction and summary'].map(label => (
                    <li key={label} className="flex items-center gap-2 text-[13px] text-[#5A5750]">
                      <Check className="h-3.5 w-3.5 shrink-0 text-[#15803D]" strokeWidth={2} />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}

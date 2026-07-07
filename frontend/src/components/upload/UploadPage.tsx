'use client'
import { useCallback, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { CloudUpload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import { documentsApi, orgApi } from '@/lib/api'
import { formatBytes } from '@/lib/utils'
import { useUploadStore } from '@/store/uploadStore'
import GraphRecommendationCard from '@/components/knowledge/GraphRecommendationCard'

const ALLOWED = ['.pdf','.docx','.doc','.xlsx','.xls','.png','.jpg','.jpeg','.txt']
const MAX_SIZE = 5 * 1024 * 1024 * 1024

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

  const uploadFile = async (file: File) => {
    const docId = `temp-${Date.now()}`
    addToQueue({ documentId: docId, fileName: file.name, totalChunks: 0, uploadedChunks: 0, status: 'uploading' })
    try {
      updateProgress(docId, { status: 'encrypting' })
      const { data: init } = await documentsApi.initiateUpload({
        file_name: file.name, file_size: file.size,
        mime_type: file.type, category, department,
        visibility, graph_processing: graphProcessing,
        industry_edition: industry,
      })
      updateProgress(docId, { documentId: init.document_id, totalChunks: init.total_chunks })

      const CHUNK = init.chunk_size || 10 * 1024 * 1024
      const buffer = await file.arrayBuffer()
      const bytes  = new Uint8Array(buffer)
      let uploaded = 0

      for (let i = 0; i < init.total_chunks; i++) {
        const chunk = bytes.slice(i * CHUNK, (i + 1) * CHUNK)
        const fd    = new FormData()
        fd.append('document_id', init.document_id)
        fd.append('chunk_index', String(i))
        fd.append('chunk_data',  new Blob([chunk]))
        fd.append('sha256_hash', 'placeholder')
        fd.append('aes_key_hex', init.aes_key_hex)
        await documentsApi.uploadChunk(fd)
        uploaded++
        updateProgress(init.document_id, { uploadedChunks: uploaded })
      }
      updateProgress(init.document_id, { status: 'done' })
      toast.success(`${file.name} uploaded & encrypted!`)
      setUploadedDocs(p => [...p, { id: init.document_id, name: file.name }])
    } catch (e: any) {
      updateProgress(docId, { status: 'error', error: e?.response?.data?.error || 'Upload failed' })
      toast.error(`Failed: ${file.name}`)
    }
  }

  const onDrop = useCallback((files: File[]) => { files.forEach(uploadFile) }, [category, department])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT_MIMES,
    maxSize: MAX_SIZE, multiple: true,
  })

  const statusIcon = (s: string) => {
    if (s === 'done')    return <CheckCircle2 className="w-4 h-4 text-green-600" />
    if (s === 'error')   return <AlertCircle className="w-4 h-4 text-red-500" />
    return <Loader2 className="w-4 h-4 text-[#1A3DAF] animate-spin" />
  }
  const statusText = (q: any) => {
    if (q.status === 'done')     return 'Encrypted & stored ✓'
    if (q.status === 'error')    return q.error || 'Failed'
    if (q.status === 'encrypting') return 'AES-256-GCM encrypting…'
    return `Uploading chunk ${q.uploadedChunks}/${q.totalChunks}…`
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">Upload Files</h2>
        <p className="text-sm font-light text-[#9B9890]">Drag & drop files — ZSTD compressed, AES-256 encrypted automatically</p>
      </div>

      {/* Drop zone */}
      <div {...getRootProps()} className={`border-2 border-dashed rounded-[16px] p-14 text-center cursor-pointer transition-all ${isDragActive ? 'border-[#1A3DAF] bg-[#EBF0FF]' : 'border-[#DDD9D0] bg-white hover:border-[#1A3DAF]/50 hover:bg-[#F7F5F0]'}`}>
        <input {...getInputProps()} />
        <div className={`w-14 h-14 rounded-[14px] border mx-auto mb-4 flex items-center justify-center transition-all ${isDragActive ? 'bg-[#EBF0FF] border-[#1A3DAF]/30' : 'bg-[#F7F5F0] border-[#DDD9D0]'}`}>
          <CloudUpload className={`w-6 h-6 ${isDragActive ? 'text-[#1A3DAF]' : 'text-[#9B9890]'}`} />
        </div>
        <p className="font-display text-lg font-semibold text-[#0E0D0A] mb-2">{isDragActive ? 'Drop to upload & encrypt' : 'Drop files here'}</p>
        <p className="text-sm font-light text-[#9B9890] mb-4">or click to browse · Max 5 GB per file</p>
        <div className="flex gap-2 justify-center flex-wrap">
          {ALLOWED.map(ext => <span key={ext} className="font-mono text-[10px] font-semibold px-2 py-1 rounded-full bg-[#F7F5F0] border border-[#DDD9D0] text-[#9B9890]">{ext.toUpperCase().replace('.','')} </span>)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Upload queue */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader title="Upload Queue" action={queue.length > 0 && <button onClick={clearQueue} className="text-xs text-[#1A3DAF] hover:underline">Clear all</button>} />
            {queue.length === 0 ? (
              <CardBody className="text-center text-sm text-[#9B9890]">No files selected. Drop files above to begin.</CardBody>
            ) : (
              <div className="divide-y divide-[#ECEAE4]">
                {queue.map(q => (
                  <div key={q.documentId} className="p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[#0E0D0A] truncate mb-1.5">{q.fileName}</div>
                      <div className="h-1 bg-[#ECEAE4] rounded-full overflow-hidden mb-1.5">
                        <div className={`h-full rounded-full transition-all ${q.status === 'done' ? 'bg-green-500 w-full' : q.status === 'error' ? 'bg-red-500 w-full' : 'bg-[#1A3DAF] animate-pulse'}`}
                          style={{ width: q.status === 'done' ? '100%' : q.totalChunks ? `${(q.uploadedChunks / q.totalChunks) * 100}%` : '15%' }} />
                      </div>
                      <div className={`text-[10.5px] font-mono ${q.status === 'done' ? 'text-green-600' : q.status === 'error' ? 'text-red-500' : 'text-[#1A3DAF]'}`}>
                        {statusText(q)}
                      </div>
                    </div>
                    {statusIcon(q.status)}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Graph Recommendations for uploaded docs */}
          {uploadedDocs.length > 0 && (
            <div className="mt-5 space-y-4">
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
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Upload Settings" />
            <CardBody className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#0E0D0A] mb-1.5 block">Document Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-sm font-light text-[#0E0D0A] outline-none focus:border-[#1A3DAF]">
                  {['Auto-detect (Orivo AI)','Contract','Tax Filing','Invoice','Medical Record','Audit Report','Compliance','Other'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#0E0D0A] mb-1.5 block">Industry Edition</label>
                <select value={industry} onChange={e => setIndustry(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-sm font-light text-[#0E0D0A] outline-none focus:border-[#1A3DAF]">
                  <option value="generic">Generic (General Enterprise)</option>
                  <option value="healthcare">Healthcare (HIPAA, Medical Docs)</option>
                  <option value="legal">Legal (Contracts, Clauses, Risk)</option>
                  <option value="finance">Finance (AML, KYC, Regulatory)</option>
                  <option value="manufacturing">Manufacturing (SOP, ISO)</option>
                  <option value="government">Government (Records, Audits)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#0E0D0A] mb-1.5 block">Department</label>
                <select value={department} onChange={e => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-sm font-light text-[#0E0D0A] outline-none focus:border-[#1A3DAF]">
                  <option value="">No Department</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#0E0D0A] mb-1.5 block">Visibility</label>
                <select value={visibility} onChange={e => setVisibility(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-sm font-light text-[#0E0D0A] outline-none focus:border-[#1A3DAF]">
                  <option value="private">Private (Only Me)</option>
                  <option value="department">Department</option>
                  <option value="organization">Organization (Everyone)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#0E0D0A] mb-1.5 block">Graph Processing</label>
                <select value={graphProcessing} onChange={e => setGraphProcessing(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-sm font-light text-[#0E0D0A] outline-none focus:border-[#1A3DAF]">
                  <option value="ai">AI Decide (Recommended)</option>
                  <option value="always">Always Add to Graph</option>
                  <option value="never">Never Add to Graph</option>
                </select>
              </div>
              <div className="pt-2 border-t border-[#ECEAE4] space-y-3">
                {[['ZSTD Level 9 Compression','true'],['AES-256-GCM Encryption','true'],['RSA-4096 Key Wrapping','true'],['Orivo AI Processing','true'],['SHA-256 Integrity Hash','true']].map(([label, on]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs font-light text-[#5A5750]">{label}</span>
                    <div className="w-9 h-5 bg-[#1A3DAF] rounded-full relative"><div className="w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 right-0.5 shadow-sm" /></div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}


'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Download, Trash2, Upload, Search } from 'lucide-react'
import { useDocuments } from '@/hooks/useDocuments'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import { formatBytes, formatDate, truncate } from '@/lib/utils'
import { documentsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import type { Document } from '@/types'

const EXT_STYLE: Record<string, string> = {
  pdf:'bg-red-50 text-red-600', docx:'bg-blue-50 text-blue-600', doc:'bg-blue-50 text-blue-600',
  xlsx:'bg-green-50 text-green-600', xls:'bg-green-50 text-green-600',
  png:'bg-purple-50 text-purple-600', jpg:'bg-purple-50 text-purple-600',
}

export default function DocumentsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { data, loading, refetch } = useDocuments()
  const docs: Document[] = data?.results || []
  const filtered = docs.filter(d => d.original_name.toLowerCase().includes(search.toLowerCase()))

  const deleteDoc = async (id: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return
    try { await documentsApi.delete(id); toast.success('Document deleted.'); refetch() }
    catch { toast.error('Delete failed.') }
  }

  const toggleSelect = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">Document Library</h2>
          <p className="text-sm font-light text-[#9B9890]">{data?.count || 0} documents · All encrypted</p>
        </div>
        <Button onClick={() => router.push('/upload')} className="gap-2">
          <Upload className="w-3.5 h-3.5" /> Upload
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-[#DDD9D0] rounded-[7px] flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-[#9B9890] flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter documents…"
            className="flex-1 border-none outline-none text-sm bg-transparent text-[#0E0D0A] placeholder:text-[#9B9890]" />
        </div>
        <div className="font-mono text-xs text-[#9B9890] ml-auto">{filtered.length} results</div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#DDD9D0] bg-[#F7F5F0]">
                <th className="px-4 py-2.5 w-8"><input type="checkbox" className="accent-[#1A3DAF]" /></th>
                {['File Name','Category','Size','Uploaded','Status',''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-mono text-[10px] font-semibold text-[#9B9890] uppercase tracking-[0.6px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="p-10 text-center text-sm text-[#9B9890]">Loading…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={7} className="p-10 text-center text-sm text-[#9B9890]">No documents found.</td></tr>
              : filtered.map(doc => {
                const ext = doc.file_extension?.replace('.','').toLowerCase()
                return (
                  <tr key={doc.id} className={`border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0] cursor-pointer ${selected.has(doc.id) ? 'bg-[#EBF0FF]' : ''}`}>
                    <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelect(doc.id) }}>
                      <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} className="accent-[#1A3DAF]" />
                    </td>
                    <td className="px-4 py-3" onClick={() => router.push(`/documents/${doc.id}`)}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-[7px] flex items-center justify-center font-mono text-[9px] font-bold flex-shrink-0 ${EXT_STYLE[ext] || 'bg-gray-50 text-gray-500'}`}>
                          {ext?.toUpperCase().slice(0,3) || 'FILE'}
                        </div>
                        <span className="text-[13px] font-medium text-[#0E0D0A]">{truncate(doc.original_name, 40)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-[#5A5750]">{doc.category || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#9B9890]">{formatBytes(doc.original_size)}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#9B9890] whitespace-nowrap">{formatDate(doc.created_at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={doc.status === 'ai_ready' || doc.status === 'encrypted' ? 'green' : doc.status === 'processing' ? 'amber' : 'red'}>
                        {doc.status.replace('_',' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <button onClick={() => router.push(`/documents/${doc.id}`)} className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[#F7F5F0] text-[#9B9890] hover:text-[#0E0D0A] transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[#F7F5F0] text-[#9B9890] hover:text-[#0E0D0A] transition-colors">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteDoc(doc.id)} className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-red-50 text-[#9B9890] hover:text-red-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {data && data.count > 20 && (
          <div className="px-5 py-3 border-t border-[#ECEAE4] flex items-center justify-between">
            <span className="font-mono text-xs text-[#9B9890]">Showing 1–{Math.min(20, data.count)} of {data.count}</span>
            <div className="flex gap-1.5">
              {[1,2,3].map(p => <button key={p} className="w-7 h-7 rounded-[6px] font-mono text-xs border border-[#DDD9D0] hover:bg-[#0E0D0A] hover:text-white hover:border-[#0E0D0A] transition-all">{p}</button>)}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Download, Trash2, Upload, Search, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocuments } from '@/hooks/useDocuments'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import Modal from '@/components/shared/Modal'
import { downloadDocument } from './downloadDocument'
import { cn, formatBytes, formatDate, truncate } from '@/lib/utils'
import { documentsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import type { Document } from '@/types'

const EXT_TONE: Record<string, string> = {
  pdf: 'text-[#B91C1C]', docx: 'text-[#1A3DAF]', doc: 'text-[#1A3DAF]',
  xlsx: 'text-[#15803D]', xls: 'text-[#15803D]',
  png: 'text-[#7E22CE]', jpg: 'text-[#7E22CE]',
}

const STATUS: Record<string, { label: string; variant: 'green' | 'blue' | 'amber' | 'red' | 'gray' }> = {
  ai_ready:   { label: 'Ready',      variant: 'green' },
  encrypted:  { label: 'Encrypted',  variant: 'blue' },
  processing: { label: 'Processing', variant: 'amber' },
  uploading:  { label: 'Uploading',  variant: 'gray' },
  failed:     { label: 'Failed',     variant: 'red' },
}

const PAGE_SIZE = 20 // backend REST_FRAMEWORK PAGE_SIZE (PageNumberPagination)

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageList(current: number, total: number): (number | null)[] {
  const keep = new Set([1, total, current - 1, current, current + 1].filter(p => p >= 1 && p <= total))
  const sorted = Array.from(keep).sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => { if (i > 0 && p - sorted[i - 1] > 1) out.push(null); out.push(p) })
  return out
}

export default function DocumentsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')   // debounced search sent to the API
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      const q = search.trim()
      setQuery(prev => { if (prev !== q) setPage(1); return q })
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, loading, error, refetch } = useDocuments({ page, ...(query ? { search: query } : {}) })
  const docs: Document[] = data?.results || []
  const count = data?.count || 0
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  // Selection is per page; drop it whenever the visible set changes.
  useEffect(() => { setSelected(new Set()) }, [page, query])
  // Deleting the last rows of the last page leaves it empty — step back a page.
  useEffect(() => {
    if (!loading && data && docs.length === 0 && page > 1) setPage(p => Math.min(p - 1, Math.max(1, Math.ceil(count / PAGE_SIZE))))
  }, [loading, data, docs.length, page, count])

  const deleteDoc = async (id: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return
    try { await documentsApi.delete(id); toast.success('Document deleted.'); refetch() }
    catch { toast.error('Delete failed.') }
  }

  const deleteSelected = async () => {
    setBulkDeleting(true)
    const ids = Array.from(selected)
    const results = await Promise.allSettled(ids.map(id => documentsApi.delete(id)))
    const failed = results.filter(r => r.status === 'rejected').length
    const ok = ids.length - failed
    if (ok) toast.success(`${ok} ${ok === 1 ? 'document' : 'documents'} deleted.`)
    if (failed) toast.error(`${failed} ${failed === 1 ? 'document' : 'documents'} could not be deleted.`)
    setBulkDeleting(false)
    setConfirmBulk(false)
    setSelected(new Set())
    refetch()
  }

  const toggleSelect = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const allSelected = docs.length > 0 && docs.every(d => selected.has(d.id))
  const someSelected = !allSelected && docs.some(d => selected.has(d.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(docs.map(d => d.id)))
  const firstRow = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastRow = Math.min(page * PAGE_SIZE, count)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description={`${count.toLocaleString()} ${count === 1 ? 'document' : 'documents'}, each encrypted before it’s stored.`}
        actions={
          <Button size="sm" onClick={() => router.push('/upload')}>
            <Upload className="h-3.5 w-3.5" /> Upload
          </Button>
        }
      />

      <Card>
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[#ECEAE4] p-3">
          <label className="relative min-w-[200px] max-w-sm flex-1">
            <span className="sr-only">Filter documents</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A877F]" strokeWidth={1.75} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by file name"
              className="field h-9 pl-9" />
          </label>
          {selected.size > 0 && (
            <Button variant="red" size="sm" onClick={() => setConfirmBulk(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size} selected
            </Button>
          )}
          <div className="ml-auto text-[12.5px] tabular-nums text-[#8A877F]">
            {count.toLocaleString()} {count === 1 ? 'result' : 'results'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[14px]">
            <thead>
              <tr className="text-[12.5px] text-[#8A877F]">
                <th className="w-10 py-2.5 pl-5 pr-2"><input type="checkbox" className="accent-[#1A3DAF]" aria-label="Select all on this page"
                  checked={allSelected} disabled={docs.length === 0}
                  ref={el => { if (el) el.indeterminate = someSelected }} onChange={toggleAll} /></th>
                {['Name', 'Category', 'Size', 'Uploaded', 'Status'].map(h => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-normal">{h}</th>
                ))}
                <th className="w-28 px-3 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="border-t border-[#F1EFEA]">
                  <td colSpan={7} className="px-5 py-4">
                    <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div>
                  </td>
                </tr>
              ) : error && !data ? (
                <tr className="border-t border-[#F1EFEA]">
                  <td colSpan={7} className="px-5 py-8 text-center text-[13.5px] text-[#B91C1C]">
                    Documents couldn’t be loaded. <button onClick={refetch} className="link">Try again</button>
                  </td>
                </tr>
              ) : docs.length === 0 ? (
                <tr className="border-t border-[#F1EFEA]">
                  <td colSpan={7}>
                    {query ? (
                      <p className="px-5 py-8 text-center text-[13.5px] text-[#8A877F]">No documents match that name.</p>
                    ) : (
                      <EmptyState icon={<FileText />} title="No documents yet"
                        action={<Button size="sm" onClick={() => router.push('/upload')}><Upload className="h-3.5 w-3.5" /> Upload documents</Button>}>
                        Upload a few files to get started. They’re encrypted first, then made searchable.
                      </EmptyState>
                    )}
                  </td>
                </tr>
              ) : docs.map(doc => {
                const ext = doc.file_extension?.replace('.','').toLowerCase()
                const st = STATUS[doc.status] || { label: doc.status.replace('_', ' '), variant: 'gray' as const }
                return (
                  <tr key={doc.id} className={cn(
                    'group cursor-pointer border-t border-[#F1EFEA] hover:bg-[#FBFAF7]',
                    selected.has(doc.id) && 'bg-[#EEF2FC] hover:bg-[#EEF2FC]'
                  )}>
                    <td className="py-3 pl-5 pr-2" onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) toggleSelect(doc.id) }}>
                      <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} className="accent-[#1A3DAF]" aria-label={`Select ${doc.original_name}`} />
                    </td>
                    <td className="px-3 py-3" onClick={() => router.push(`/documents/${doc.id}`)}>
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className={cn('h-[18px] w-[18px] shrink-0', (ext && EXT_TONE[ext]) || 'text-[#8A877F]')} strokeWidth={1.75} />
                        <span className="truncate font-medium text-[#0E0D0A]" title={doc.original_name}>{truncate(doc.original_name, 40)}</span>
                        {ext && <span className="shrink-0 text-[12px] uppercase text-[#8A877F]">{ext.slice(0, 4)}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[13.5px] text-[#5A5750]">{doc.category || <span className="text-[#8A877F]">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[13.5px] tabular-nums text-[#5A5750]">{formatBytes(doc.original_size)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[13.5px] text-[#5A5750]">{formatDate(doc.created_at)}</td>
                    <td className="px-3 py-3">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button onClick={() => router.push(`/documents/${doc.id}`)} aria-label="Open"
                          className="rounded-[6px] p-1.5 text-[#8A877F] hover:bg-[#ECEAE4] hover:text-[#0E0D0A]">
                          <Eye className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                        <button onClick={() => downloadDocument(doc.id, doc.original_name)} aria-label="Download"
                          disabled={doc.status === 'uploading'} title={doc.status === 'uploading' ? 'Available once the upload finishes' : undefined}
                          className="rounded-[6px] p-1.5 text-[#8A877F] hover:bg-[#ECEAE4] hover:text-[#0E0D0A]">
                          <Download className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                        <button onClick={() => deleteDoc(doc.id)} aria-label="Delete"
                          className="rounded-[6px] p-1.5 text-[#8A877F] hover:bg-[#FCEFEF] hover:text-[#B91C1C]">
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {count > PAGE_SIZE && (
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ECEAE4] px-5 py-3">
            <span className="text-[12.5px] tabular-nums text-[#8A877F]">Showing {firstRow}–{lastRow} of {count.toLocaleString()}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading} aria-label="Previous page"
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#DDD9D0] bg-white text-[#2B2924] transition-colors hover:border-[#BDB8AC] hover:bg-[#FBFAF7] disabled:cursor-not-allowed disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pageList(page, totalPages).map((p, i) => p === null ? (
                <span key={`gap-${i}`} className="px-1 text-[13px] text-[#8A877F]">…</span>
              ) : (
                <button key={p} onClick={() => setPage(p)} disabled={loading} aria-current={p === page ? 'page' : undefined}
                  className={cn('h-8 min-w-8 rounded-[8px] border px-2.5 text-[13px] tabular-nums transition-colors',
                    p === page ? 'border-[#0E0D0A] bg-[#0E0D0A] text-[#F7F5F0]'
                               : 'border-[#DDD9D0] bg-white text-[#2B2924] hover:border-[#BDB8AC] hover:bg-[#FBFAF7]')}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages || loading} aria-label="Next page"
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#DDD9D0] bg-white text-[#2B2924] transition-colors hover:border-[#BDB8AC] hover:bg-[#FBFAF7] disabled:cursor-not-allowed disabled:opacity-50">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </nav>
        )}
      </Card>

      <Modal open={confirmBulk} onOpenChange={o => { if (!bulkDeleting) setConfirmBulk(o) }}
        title={`Delete ${selected.size} ${selected.size === 1 ? 'document' : 'documents'}?`}
        description="They’re removed from storage and search. This cannot be undone."
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setConfirmBulk(false)} disabled={bulkDeleting}>Cancel</Button>
          <Button variant="red" size="sm" onClick={deleteSelected} loading={bulkDeleting}>Delete</Button>
        </>}>
        <p className="text-[13.5px] text-[#5A5750]">Only the documents selected on this page are deleted.</p>
      </Modal>
    </div>
  )
}

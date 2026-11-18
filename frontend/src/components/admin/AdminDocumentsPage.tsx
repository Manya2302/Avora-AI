'use client'
import { useCallback, useEffect, useState } from 'react'
import { Search, FileText, X } from 'lucide-react'
import { adminApi } from '@/lib/api'
import { formatBytes, formatDate } from '@/lib/utils'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

/* What GET /admin-panel/documents/ returns per row (AdminDocumentSerializer). */
type AdminDoc = {
  id: string; original_name: string; file_extension: string; mime_type: string
  original_size: number; compressed_size: number; encrypted_size: number
  status: 'uploading' | 'processing' | 'encrypted' | 'ai_ready' | 'failed'
  category: string; created_at: string
  owner_id: string; owner_email: string; owner_name: string
}
type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] }

const PAGE_SIZE = 20
const STATUS: Record<AdminDoc['status'], { label: string; variant: 'gray' | 'blue' | 'green' | 'amber' | 'red' }> = {
  uploading:  { label: 'Uploading',  variant: 'gray' },
  processing: { label: 'Processing', variant: 'amber' },
  encrypted:  { label: 'Encrypted',  variant: 'blue' },
  ai_ready:   { label: 'Ready',      variant: 'green' },
  failed:     { label: 'Failed',     variant: 'red' },
}

export default function AdminDocumentsPage() {
  const [q, setQ]           = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [ext, setExt]       = useState('')
  const [owner, setOwner]   = useState<{ id: string; label: string } | null>(null)
  const [page, setPage]     = useState(1)
  const [exts, setExts]     = useState<string[]>([])
  const [data, setData]     = useState<Page<AdminDoc> | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady]   = useState(false)

  // ?owner=<user id> (linked from the Users page) — read once on mount
  useEffect(() => {
    let id = ''
    try { id = new URLSearchParams(window.location.search).get('owner') || '' } catch { /* ignore */ }
    if (id) {
      setOwner({ id, label: 'one user' })
      adminApi.user(id).then(r => setOwner({ id, label: r.data?.full_name || r.data?.email || 'one user' })).catch(() => {})
    }
    setReady(true)
    // extension filter options come from what is actually stored
    adminApi.storage()
      .then(r => setExts((r.data?.by_extension ?? []).map((x: any) => x.file_extension).filter(Boolean)))
      .catch(() => setExts([]))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(() => {
    if (!ready) return
    const params: Record<string, unknown> = { page }
    if (search) params.search = search
    if (status) params.status = status
    if (ext) params.file_extension = ext
    if (owner) params.owner = owner.id
    adminApi.documents(params)
      .then(r => { setData(r.data); setFailed(false) })
      .catch(e => {
        if (e?.response?.status === 404 && page > 1) { setPage(1); return }
        setFailed(true)
      })
  }, [ready, page, search, status, ext, owner])

  useEffect(() => { load() }, [load])

  const clearOwner = () => {
    setOwner(null); setPage(1)
    try { window.history.replaceState(null, '', window.location.pathname) } catch { /* ignore */ }
  }

  const rows = data?.results ?? []
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1
  const filtered = !!(search || status || ext || owner)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Every document stored in Avora, across all users. File contents stay encrypted; this list shows only names and metadata."
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ECEAE4] p-3">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Search documents</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A877F]" strokeWidth={1.75} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by file name or owner" className="field h-9 pl-9" />
          </label>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} className="field h-9 w-auto pr-8" aria-label="Filter by status">
            <option value="">Any status</option>
            {(Object.keys(STATUS) as AdminDoc['status'][]).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
          <select value={ext} onChange={e => { setExt(e.target.value); setPage(1) }} className="field h-9 w-auto pr-8" aria-label="Filter by file type">
            <option value="">All file types</option>
            {exts.map(x => <option key={x} value={x}>{x.replace(/^\./, '').toUpperCase()}</option>)}
          </select>
          {owner && (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#DDD9D0] bg-[#FBFAF7] pl-3 pr-1.5 text-[13px] text-[#2B2924]">
              Owner: <span className="max-w-[160px] truncate font-medium">{owner.label}</span>
              <button onClick={clearOwner} aria-label="Clear owner filter" className="rounded-[5px] p-1 text-[#8A877F] hover:bg-[#ECEAE4] hover:text-[#0E0D0A]">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        {failed && !data ? (
          <EmptyState icon={<FileText />} title="Couldn't load documents" action={<Button variant="ghost" size="sm" onClick={load}>Try again</Button>}>
            The admin API didn't respond. Check that the backend is running.
          </EmptyState>
        ) : !data ? (
          <div className="space-y-2 p-5">{[0, 1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div>
        ) : !rows.length ? (
          <EmptyState icon={<FileText />} title={filtered ? 'No documents match' : 'No documents yet'}>
            {filtered ? 'Try a different search or clear the filters.' : 'Documents appear here once users upload them.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[14px]">
              <thead>
                <tr className="text-[12.5px] text-[#8A877F]">
                  <th className="px-5 py-2.5 font-normal">Name</th>
                  <th className="px-3 py-2.5 font-normal">Owner</th>
                  <th className="px-3 py-2.5 font-normal">Type</th>
                  <th className="px-3 py-2.5 text-right font-normal">Size</th>
                  <th className="px-3 py-2.5 text-right font-normal">Stored</th>
                  <th className="px-3 py-2.5 font-normal">Status</th>
                  <th className="px-3 py-2.5 font-normal">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(d => {
                  const st = STATUS[d.status] ?? { label: d.status, variant: 'gray' as const }
                  return (
                    <tr key={d.id} className="border-t border-[#F1EFEA] hover:bg-[#FBFAF7]">
                      <td className="max-w-[280px] px-5 py-2.5">
                        <div className="truncate font-medium text-[#0E0D0A]" title={d.original_name}>{d.original_name}</div>
                        {d.category && <div className="truncate text-[12.5px] text-[#8A877F]">{d.category.replace(/_/g, ' ')}</div>}
                      </td>
                      <td className="max-w-[220px] px-3 py-2.5">
                        <div className="truncate text-[#2B2924]">{d.owner_name || '—'}</div>
                        <div className="truncate text-[12.5px] text-[#8A877F]">{d.owner_email}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-[#5A5750]">{(d.file_extension || '').replace(/^\./, '').toUpperCase() || '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#2B2924]">{d.original_size ? formatBytes(d.original_size) : '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#5A5750]" title="Size after compression and encryption">
                        {d.encrypted_size ? formatBytes(d.encrypted_size) : '—'}
                      </td>
                      <td className="px-3 py-2.5"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#5A5750]">{formatDate(d.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.count > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ECEAE4] px-5 py-3 text-[13px] text-[#8A877F]">
            <span className="tabular-nums">Page {page} of {pages} · {data.count.toLocaleString('en-IN')} documents</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={!data.previous} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="ghost" size="sm" disabled={!data.next} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

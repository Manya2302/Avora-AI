'use client'
import { useState, useEffect } from 'react'
import { Shield, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { auditApi } from '@/lib/api'
import type { AuditLog } from '@/types'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { cn, formatDateTime, getInitials } from '@/lib/utils'
import toast from 'react-hot-toast'
import { saveBlob, blobErrorMessage } from '@/components/documents/downloadDocument'

const PAGE_SIZE = 20 // backend PageNumberPagination PAGE_SIZE

const ACTION_VARIANT: Record<string, any> = {
  upload:'green', download:'blue', delete:'red', login:'amber', search:'purple', view:'gray', logout:'gray'
}

export default function AuditLogsPage() {
  const [logs, setLogs]       = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')
  const [page, setPage]       = useState(1)
  const [count, setCount]     = useState(0)
  const [error, setError]     = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false   // ignore responses for a filter/page the user has already left
    setLoading(true)
    setError(false)
    auditApi.getLogs({ page, ...(filter ? { action: filter } : {}) })
      .then(r => { if (!cancelled) { setLogs(r.data.results || []); setCount(r.data.count || 0) } })
      .catch(() => { if (!cancelled) { setLogs([]); setCount(0); setError(true) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filter, page, reloadKey])

  const changeFilter = (f: string) => { setFilter(f); setPage(1) }
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const exportCsv = async () => {
    setExporting(true)
    try {
      const res = await auditApi.exportCsv(filter ? { action: filter } : {})
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      saveBlob(res.data as Blob, `audit-log-${filter || 'all'}-${stamp}.csv`)
    } catch (e) {
      toast.error(await blobErrorMessage(e, 'The export failed. Please try again.'))
    } finally {
      setExporting(false)
    }
  }

  const filters = ['', 'upload', 'download', 'delete', 'login', 'search', 'view']

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every upload, download, search and sign-in in your vault, with who did it and from where."
        actions={
          <Button variant="ghost" size="sm" onClick={exportCsv} loading={exporting} disabled={count === 0 && !loading}
            title={count === 0 && !loading ? 'Nothing to export for this filter' : 'Download every event matching this filter'}>
            {!exporting && <Download className="h-3.5 w-3.5" />} Export CSV
          </Button>
        }
      />

      {/* filter tabs */}
      <div className="flex gap-6 overflow-x-auto border-b border-[#DDD9D0]" role="tablist">
        {filters.map(f => (
          <button key={f} onClick={() => changeFilter(f)} role="tab" aria-selected={filter === f}
            className={cn(
              '-mb-px shrink-0 border-b-2 pb-2.5 text-[14px] transition-colors',
              filter === f ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'
            )}>
            {f === '' ? 'All events' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[14px]">
            <thead>
              <tr className="text-[12.5px] text-[#8A877F]">
                <th className="whitespace-nowrap px-5 py-2.5 font-normal">User</th>
                {['Action', 'Resource', 'Date and time', 'IP address'].map(h => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="border-t border-[#F1EFEA]">
                  <td colSpan={5} className="px-5 py-4">
                    <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div>
                  </td>
                </tr>
              ) : error ? (
                <tr className="border-t border-[#F1EFEA]">
                  <td colSpan={5} className="px-5 py-8 text-center text-[13.5px] text-[#B91C1C]">
                    The audit log couldn’t be loaded. <button onClick={() => setReloadKey(k => k + 1)} className="link">Try again</button>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr className="border-t border-[#F1EFEA]">
                  <td colSpan={5}>
                    <EmptyState icon={<Shield />} title={filter ? `No ${filter} events yet` : 'No activity yet'}>
                      Actions appear here as soon as someone uses the vault.
                    </EmptyState>
                  </td>
                </tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-t border-[#F1EFEA] hover:bg-[#FBFAF7]">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EEF2FC] text-[11px] font-medium text-[#1A3DAF]">
                        {log.user_name ? getInitials(log.user_name) : '?'}
                      </span>
                      <span className="whitespace-nowrap font-medium text-[#0E0D0A]">{log.user_name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><Badge variant={ACTION_VARIANT[log.action] || 'gray'}>{log.action}</Badge></td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-[13.5px] text-[#5A5750]" title={log.resource || undefined}>{log.resource || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13.5px] tabular-nums text-[#5A5750]">{formatDateTime(log.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12.5px] text-[#8A877F]">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!error && count > PAGE_SIZE && (
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ECEAE4] px-5 py-3">
            <span className="text-[12.5px] tabular-nums text-[#8A877F]">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} of {count.toLocaleString()} · page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages || loading} aria-label="Next page">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        )}
      </Card>
    </div>
  )
}

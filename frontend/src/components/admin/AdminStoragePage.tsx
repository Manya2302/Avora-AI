'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Database } from 'lucide-react'
import { adminApi } from '@/lib/api'
import { formatBytes } from '@/lib/utils'
import { Card, CardHeader } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

/* GET /admin-panel/storage/ */
type Bucket = { count: number; size: number | null }
type StorageStats = {
  total_encrypted_bytes: number; total_original_bytes: number; total_compressed_bytes: number; total_documents: number
  by_extension: Array<Bucket & { file_extension: string }>
  by_status?: Array<Bucket & { status: string }>
  by_owner?: Array<Bucket & { owner_id: string; owner__email: string; owner__full_name: string }>
}

const STATUS_LABEL: Record<string, string> = {
  uploading: 'Uploading', processing: 'Processing', encrypted: 'Encrypted', ai_ready: 'Ready', failed: 'Failed',
}

export default function AdminStoragePage() {
  const [data, setData]     = useState<StorageStats | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    adminApi.storage()
      .then(r => { setData(r.data); setFailed(false) })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const saved = data && data.total_original_bytes > 0 && data.total_compressed_bytes > 0
    ? Math.round((1 - data.total_compressed_bytes / data.total_original_bytes) * 100)
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage"
        description="What Avora is storing, measured from the document records: original size, after compression, and the encrypted bytes actually kept."
        actions={<Button variant="ghost" size="sm" loading={loading} onClick={load}>Refresh</Button>}
      />

      {failed && !data ? (
        <Card>
          <EmptyState icon={<Database />} title="Couldn't load storage figures" action={<Button variant="ghost" size="sm" onClick={load}>Try again</Button>}>
            The admin API didn't respond. Check that the backend is running.
          </EmptyState>
        </Card>
      ) : !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-[104px] animate-pulse rounded-[12px] bg-[#F1EFEA]" />)}
        </div>
      ) : !data.total_documents ? (
        <Card>
          <EmptyState icon={<Database />} title="Nothing stored yet">Storage figures appear once users upload documents.</EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure label="Stored (encrypted)" value={formatBytes(data.total_encrypted_bytes)} hint="Bytes kept in object storage" />
            <Figure label="Original size" value={data.total_original_bytes ? formatBytes(data.total_original_bytes) : '—'} hint="As uploaded" />
            <Figure label="Compression saved" value={saved === null ? '—' : `${saved}%`}
              hint={data.total_compressed_bytes ? `${formatBytes(data.total_compressed_bytes)} after compression` : undefined} />
            <Figure label="Documents" value={data.total_documents.toLocaleString('en-IN')} hint="Not counting deleted" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="By file type" subtitle="Top 10 by number of documents" />
              <Bars
                rows={data.by_extension.map(r => ({
                  key: r.file_extension || 'none',
                  label: (r.file_extension || '').replace(/^\./, '').toUpperCase() || 'No extension',
                  count: r.count, size: r.size || 0,
                }))}
              />
            </Card>

            {data.by_status && (
              <Card>
                <CardHeader title="By processing status" />
                <Bars
                  rows={data.by_status.map(r => ({
                    key: r.status, label: STATUS_LABEL[r.status] ?? r.status, count: r.count, size: r.size || 0,
                    tone: r.status === 'failed' ? '#DC2626' : undefined,
                  }))}
                />
              </Card>
            )}
          </div>

          {data.by_owner && data.by_owner.length > 0 && (
            <Card>
              <CardHeader title="Largest users" subtitle="Top 10 by encrypted bytes stored" />
              <Bars
                rows={data.by_owner.map(r => ({
                  key: r.owner_id,
                  label: r.owner__full_name || r.owner__email,
                  sub: r.owner__full_name ? r.owner__email : undefined,
                  href: `/securevault-admin/documents?owner=${r.owner_id}`,
                  count: r.count, size: r.size || 0,
                }))}
              />
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[12px] border border-[#DDD9D0] bg-white p-4">
      <div className="text-[13px] text-[#5A5750]">{label}</div>
      <div className="mt-3 font-display text-[28px] font-semibold leading-none tabular-nums text-[#0E0D0A]">{value}</div>
      {hint && <div className="mt-2 text-[12.5px] text-[#8A877F]">{hint}</div>}
    </div>
  )
}

function Bars({ rows }: {
  rows: Array<{ key: string; label: string; sub?: string; href?: string; count: number; size: number; tone?: string }>
}) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-[13px] text-[#8A877F]">Nothing to show.</p>
  const max = Math.max(1, ...rows.map(r => r.size))
  return (
    <ul>
      {rows.map(r => (
        <li key={r.key} className="border-t border-[#F1EFEA] px-5 py-3 first:border-0">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              {r.href
                ? <Link href={r.href} className="block truncate text-[13.5px] text-[#0E0D0A] hover:underline">{r.label}</Link>
                : <span className="block truncate text-[13.5px] text-[#0E0D0A]">{r.label}</span>}
              {r.sub && <span className="block truncate text-[12px] text-[#8A877F]">{r.sub}</span>}
            </div>
            <span className="shrink-0 text-[12.5px] tabular-nums text-[#5A5750]">
              {formatBytes(r.size)}<span className="text-[#8A877F]"> · {r.count.toLocaleString('en-IN')} {r.count === 1 ? 'doc' : 'docs'}</span>
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#F1EFEA]">
            <div className="h-full rounded-full" style={{ width: r.size ? `${Math.max(1.5, (r.size / max) * 100)}%` : 0, background: r.tone ?? '#1A3DAF' }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

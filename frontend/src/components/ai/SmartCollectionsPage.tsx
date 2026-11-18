'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Folder, RefreshCw } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import toast from 'react-hot-toast'
import type { SmartCollection } from '@/types'

const COLOR_MAP: Record<string, string> = {
  green:'bg-[#EDF7F0]', blue:'bg-[#EEF2FC]', amber:'bg-[#FBF3E4]', purple:'bg-[#F5EEFB]',
  red:'bg-[#FCEFEF]', slate:'bg-[#F1EFEA]', teal:'bg-[#EAF5F6]', orange:'bg-[#FBF0E8]',
  indigo:'bg-[#EEF2FC]', cyan:'bg-[#EAF5F6]', pink:'bg-[#FBEFF3]', gold:'bg-[#FBF3E4]',
}

export default function SmartCollectionsPage() {
  const router = useRouter()
  const [collections, setCollections] = useState<SmartCollection[]>([])
  const [loading, setLoading]         = useState(true)
  const [seeding, setSeeding]         = useState(false)

  const load = () => {
    aiApi.collections().then(r => setCollections(r.data.results || r.data || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const seed = async () => {
    setSeeding(true)
    try {
      await aiApi.seedCollections()
      toast.success('Collections built.')
      load()
    } catch { toast.error('Couldn’t build collections. Try again.') }
    finally { setSeeding(false) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections"
        description="Avora groups your documents by type as they come in, so you don’t have to file them yourself."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} /> Refresh</Button>
            <Button size="sm" onClick={seed} loading={seeding}>Build collections</Button>
          </>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({length: 8}).map((_,i) => <div key={i} className="h-[120px] animate-pulse rounded-[12px] bg-[#F1EFEA]" />)}
        </div>
      ) : collections.length === 0 ? (
        <Card>
          <EmptyState icon={<Folder />} title="No collections yet"
            action={<Button size="sm" onClick={seed} loading={seeding}>Build collections</Button>}>
            Avora can sort the documents you’ve already uploaded into collections such as invoices, contracts and tax filings.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {collections.map(col => {
            const colorCls = COLOR_MAP[col.color] || 'bg-[#EEF2FC]'
            return (
              <button key={col.id} onClick={() => router.push(`/collections/${col.id}`)}
                className="group flex min-w-0 flex-col rounded-[12px] border border-[#DDD9D0] bg-white p-4 text-left transition-colors hover:border-[#BDB8AC]">
                <div className={`mb-4 flex h-9 w-9 items-center justify-center rounded-[8px] text-[18px] ${colorCls}`}>
                  {col.icon}
                </div>
                <div className="truncate text-[14px] font-semibold text-[#0E0D0A]">{col.name}</div>
                <div className="mt-0.5 text-[13px] text-[#8A877F] tabular-nums">
                  {col.document_count} document{col.document_count !== 1 ? 's' : ''}
                </div>
                {col.collection_type === 'ai_generated' && (
                  <div className="mt-3">
                    <Badge variant="gray">Created by Avora</Badge>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {collections.length > 0 && (
        <p className="text-[13px] text-[#8A877F]">
          Collections update as you upload. When Avora sees a new kind of document, it adds a collection for it.
        </p>
      )}
    </div>
  )
}

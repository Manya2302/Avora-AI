'use client'
import { useEffect, useState } from 'react'
import { aiApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import { BarChart3, Search, Folder, Sparkles, TrendingUp } from 'lucide-react'
import StatCard from '@/components/shared/StatCard'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import Button from '@/components/shared/Button'

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true); setError(false)
    aiApi.aiDashboard().then(r => setData(r.data)).catch(() => setError(true)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI activity"
        description="How much Avora has read, sorted and searched for you."
      />
      {!loading && error && (
        <Card>
          <EmptyState icon={<BarChart3 />} title="Couldn’t load AI activity"
            action={<Button size="sm" variant="ghost" onClick={load}>Try again</Button>}>
            Something went wrong fetching your activity. Check your connection and try again.
          </EmptyState>
        </Card>
      )}
      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Documents processed" value={data.total_processed?.toLocaleString() ?? '—'} icon={<Sparkles strokeWidth={1.75} />} accent="blue" />
            <StatCard label="Searches" value={data.search_count?.toLocaleString() ?? '—'} icon={<Search strokeWidth={1.75} />} accent="green" />
            <StatCard label="Collections" value={data.collections ?? '—'} icon={<Folder strokeWidth={1.75} />} accent="amber" />
            <StatCard label="Processing now" value={data.processing ?? '—'} icon={<TrendingUp strokeWidth={1.75} />} accent="purple" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Most common document types" />
              <div>
                {!data.top_categories?.length && <p className="px-5 py-6 text-[13.5px] text-[#8A877F]">No documents have been classified yet.</p>}
                {data.top_categories?.map((c: any) => (
                  <div key={c.category} className="flex items-center justify-between gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                    <span className="min-w-0 truncate text-[14px] capitalize text-[#2B2924]">{c.category?.replace(/_/g,' ')}</span>
                    <span className="text-[13.5px] font-medium tabular-nums text-[#0E0D0A]">{c.count}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Recent searches" />
              <div>
                {!data.recent_searches?.length && <p className="px-5 py-6 text-[13.5px] text-[#8A877F]">No searches yet.</p>}
                {data.recent_searches?.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0 hover:bg-[#FBFAF7]">
                    <Search className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-[#0E0D0A]">{s.query}</span>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-[#8A877F]">{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-[104px] animate-pulse rounded-[12px] bg-[#F1EFEA]" />)}
          </div>
          <p className="text-[13px] text-[#8A877F]">Loading activity…</p>
        </div>
      )}
    </div>
  )
}

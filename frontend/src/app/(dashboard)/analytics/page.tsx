'use client'
import { useEffect, useState } from 'react'
import { aiApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import { BarChart3, Search, Folder, Sparkles, TrendingUp } from 'lucide-react'
import StatCard from '@/components/shared/StatCard'

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null)
  useEffect(() => { aiApi.aiDashboard().then(r => setData(r.data)).catch(() => {}) }, [])
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><BarChart3 className="w-5 h-5 text-[#1A3DAF]" /></div>
        <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">AI Activity</h2><p className="text-sm text-[#9B9890]">Your Avora AI usage and document intelligence metrics</p></div>
      </div>
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <StatCard label="AI Processed" value={data.total_processed?.toLocaleString() || 0} icon={<Sparkles />} accent="blue" />
            <StatCard label="Total Searches" value={data.search_count?.toLocaleString() || 0} icon={<Search />} accent="green" />
            <StatCard label="Smart Collections" value={data.collections || 0} icon={<Folder />} accent="amber" />
            <StatCard label="Processing" value={data.processing || 0} icon={<TrendingUp />} accent="purple" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Top Document Categories" />
              <div className="p-4 space-y-2">
                {data.top_categories?.map((c: any) => (
                  <div key={c.category} className="flex items-center justify-between p-2.5 bg-[#F7F5F0] rounded-[9px]">
                    <span className="text-sm text-[#5A5750]">{c.category?.replace(/_/g,' ')}</span>
                    <span className="font-mono text-xs font-semibold text-[#0E0D0A]">{c.count}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Recent Searches" />
              <div className="divide-y divide-[#ECEAE4]">
                {data.recent_searches?.map((s: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <Search className="w-3.5 h-3.5 text-[#9B9890]" />
                    <span className="text-sm text-[#0E0D0A] flex-1">{s.query}</span>
                    <span className="font-mono text-[10px] text-[#9B9890]">{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
      {!data && <div className="text-center py-20 text-sm text-[#9B9890]">Loading analytics…</div>}
    </div>
  )
}

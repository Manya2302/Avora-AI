'use client'
import { useEffect, useState } from 'react'
import { Sparkles, MessageSquare, AlertTriangle, Clock, FileBarChart, TrendingUp } from 'lucide-react'
import { adminGovernanceApi } from '@/lib/api'
import StatCard from '@/components/shared/StatCard'
import { Card, CardHeader } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'

export default function AdminAIGovernancePage() {
  const [data, setData] = useState<any>(null)
  const [flagged, setFlagged] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      adminGovernanceApi.governance().then(r => setData(r.data)),
      adminGovernanceApi.flaggedResponses().then(r => setFlagged(r.data.results||[])),
    ]).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="AI governance" description="How Copilot is being used, how confident its answers are, and which answers need a second look." />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({length:4}).map((_,i) => <div key={i} className="h-[104px] animate-pulse rounded-[12px] bg-[#F1EFEA]"/>)}</div>
      ) : data && (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Conversations"      value={data.total_conversations} icon={<MessageSquare/>} accent="blue"/>
          <StatCard label="Questions asked"    value={data.total_queries}       icon={<Sparkles/>}      accent="purple"/>
          <StatCard label="Average confidence" value={`${data.avg_confidence}%`} icon={<TrendingUp/>}    accent={data.avg_confidence>=70?'green':'amber'}/>
          <StatCard label="Average response time" value={`${data.avg_latency_ms} ms`} icon={<Clock/>}    accent="blue"/>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader title="Usage by mode"/>
            <ul>
              {data.by_mode?.map((m: any) => (
                <li key={m.mode} className="flex items-center justify-between border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                  <span className="text-[14px] capitalize text-[#2B2924]">{m.mode}</span>
                  <span className="text-[14px] font-medium tabular-nums text-[#0E0D0A]">{m.count}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Safety signals"/>
            <ul>
              <li className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#B91C1C]" strokeWidth={1.75}/>
                <span className="flex-1 text-[14px] text-[#2B2924]">Possible hallucinations</span>
                <span className="text-[14px] font-medium tabular-nums text-[#B91C1C]">{data.hallucination_flags}</span>
              </li>
              <li className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                <AlertTriangle className="h-4 w-4 shrink-0 text-[#A35A04]" strokeWidth={1.75}/>
                <span className="flex-1 text-[14px] text-[#2B2924]">Low-confidence answers</span>
                <span className="text-[14px] font-medium tabular-nums text-[#A35A04]">{data.low_confidence_count}</span>
              </li>
              <li className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0">
                <FileBarChart className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75}/>
                <span className="flex-1 text-[14px] text-[#2B2924]">Reports generated</span>
                <span className="text-[14px] font-medium tabular-nums text-[#0E0D0A]">{data.reports_generated}</span>
              </li>
            </ul>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Review queue"
            subtitle="Copilot answers flagged for low confidence."
            action={<span className="text-[12.5px] tabular-nums text-[#8A877F]">{flagged.length} flagged</span>}
          />
          {flagged.length === 0 ? (
            <EmptyState title="Nothing to review">Flagged answers will show up here so someone can check them.</EmptyState>
          ) : (
            <ul>
              {flagged.map((m: any) => (
                <li key={m.id} className="border-t border-[#F1EFEA] px-5 py-3 first:border-0 hover:bg-[#FBFAF7]">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="red">Low confidence</Badge>
                    <span className="text-[12.5px] tabular-nums text-[#8A877F]">{Math.round((m.confidence_score||0)*100)}% confidence</span>
                  </div>
                  <p className="line-clamp-2 text-[14px] text-[#2B2924]">{m.content}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>)}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { Sparkles, MessageSquare, AlertTriangle, Clock, FileBarChart, TrendingUp } from 'lucide-react'
import { adminGovernanceApi } from '@/lib/api'
import StatCard from '@/components/shared/StatCard'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'

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
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#3B5BDB]/15 border border-[#3B5BDB]/25 rounded-[11px] flex items-center justify-center"><Sparkles className="w-5 h-5 text-[#7B9FE8]"/></div>
        <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">AI Governance</h2>
          <p className="text-sm text-[#9B9890]">Copilot usage, confidence, and safety monitoring — Phase 4</p></div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">{Array.from({length:4}).map((_,i) => <div key={i} className="h-28 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse"/>)}</div>
      ) : data && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <StatCard label="Total Conversations" value={data.total_conversations} icon={<MessageSquare/>} accent="blue"/>
          <StatCard label="Total Queries"       value={data.total_queries}       icon={<Sparkles/>}      accent="purple"/>
          <StatCard label="Avg Confidence"      value={`${data.avg_confidence}%`} icon={<TrendingUp/>}    accent={data.avg_confidence>=70?'green':'amber'}/>
          <StatCard label="Avg Latency"         value={`${data.avg_latency_ms}ms`} icon={<Clock/>}         accent="blue"/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Usage by Mode"/>
            <CardBody className="space-y-2">
              {data.by_mode?.map((m: any) => (
                <div key={m.mode} className="flex items-center justify-between p-2.5 bg-[#F7F5F0] rounded-[8px]">
                  <span className="text-sm text-[#5A5750] capitalize">{m.mode}</span>
                  <span className="font-mono text-sm font-semibold text-[#0E0D0A]">{m.count}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Safety Signals"/>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-[9px]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500"/>
                  <span className="text-sm text-red-700">Hallucination flags</span>
                </div>
                <span className="font-mono text-sm font-bold text-red-600">{data.hallucination_flags}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-100 rounded-[9px]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500"/>
                  <span className="text-sm text-amber-700">Low confidence responses</span>
                </div>
                <span className="font-mono text-sm font-bold text-amber-600">{data.low_confidence_count}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-100 rounded-[9px]">
                <div className="flex items-center gap-2">
                  <FileBarChart className="w-4 h-4 text-green-600"/>
                  <span className="text-sm text-green-700">Reports generated</span>
                </div>
                <span className="font-mono text-sm font-bold text-green-600">{data.reports_generated}</span>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Flagged Responses — Review Queue" action={<span className="font-mono text-[10px] text-[#9B9890]">{flagged.length} flagged</span>}/>
          {flagged.length === 0 ? (
            <CardBody className="text-center py-10 text-sm text-[#9B9890]">No flagged responses. All clear.</CardBody>
          ) : (
            <div className="divide-y divide-[#ECEAE4]">
              {flagged.map((m: any) => (
                <div key={m.id} className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="red">Low confidence</Badge>
                    <span className="font-mono text-[10px] text-[#9B9890]">{Math.round((m.confidence_score||0)*100)}% confidence</span>
                  </div>
                  <p className="text-sm text-[#5A5750] line-clamp-2">{m.content}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </>)}
    </div>
  )
}

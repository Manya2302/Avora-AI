'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutGrid, MessageSquare, FileBarChart, BookOpen, Network, Lightbulb, Pin, ArrowRight, Sparkles } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import StatCard from '@/components/shared/StatCard'
import Badge from '@/components/shared/Badge'

export default function WorkspacePage() {
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { copilotApi.dashboard().then(r => setData(r.data)).catch(()=>{}).finally(()=>setLoading(false)) }, [])

  const tools = [
    { label:'New Conversation',   icon:MessageSquare, href:'/copilot',              color:'bg-[#EBF0FF] text-[#1A3DAF]', desc:'Ask anything about your documents' },
    { label:'Generated Reports',  icon:FileBarChart,  href:'/copilot/reports',      color:'bg-purple-50 text-purple-600', desc:'Multi-document analysis reports' },
    { label:'Prompt Library',     icon:BookOpen,       href:'/copilot/prompts',      color:'bg-amber-50 text-amber-600', desc:'Built-in enterprise prompts' },
    { label:'Knowledge Explorer', icon:Network,        href:'/knowledge',            color:'bg-green-50 text-green-600', desc:'Organizational knowledge graph' },
    { label:'Recommendations',   icon:Lightbulb,      href:'/copilot/recommendations', color:'bg-red-50 text-red-600', desc:'Proactive AI suggestions' },
    { label:'Conversation History', icon:MessageSquare, href:'/copilot/history',    color:'bg-blue-50 text-blue-600', desc:'Revisit past conversations' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-[#1A3DAF] to-[#7B9FE8] rounded-[11px] flex items-center justify-center">
          <LayoutGrid className="w-5 h-5 text-white"/>
        </div>
        <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">AI Workspace</h2>
          <p className="text-sm text-[#9B9890]">Your enterprise knowledge assistant command center</p></div>
      </div>

      {/* Usage stats */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <StatCard label="Conversations"   value={data.total_conversations} icon={<MessageSquare/>} accent="blue"/>
          <StatCard label="Questions Asked" value={data.total_questions}     icon={<Sparkles/>}      accent="purple"/>
          <StatCard label="Reports Generated" value={data.reports_generated} icon={<FileBarChart/>}   accent="green"/>
          <StatCard label="Avg Confidence"  value={`${data.avg_confidence}%`} icon={<Lightbulb/>}      accent="amber"/>
        </div>
      )}

      {/* Tools grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map(t => (
          <button key={t.href} onClick={() => router.push(t.href)}
            className="text-left bg-white border border-[#DDD9D0] rounded-[14px] p-5 hover:border-[#1A3DAF]/30 hover:shadow-md transition-all hover:-translate-y-0.5 group">
            <div className={`w-11 h-11 rounded-[11px] flex items-center justify-center mb-4 ${t.color}`}>
              <t.icon className="w-5 h-5"/>
            </div>
            <h3 className="font-semibold text-[#0E0D0A] mb-1 group-hover:text-[#1A3DAF] transition-colors flex items-center gap-1.5">
              {t.label} <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity"/>
            </h3>
            <p className="text-xs text-[#9B9890]">{t.desc}</p>
          </button>
        ))}
      </div>

      {/* Recent conversations */}
      {data?.recent_convs?.length > 0 && (
        <Card>
          <CardHeader title="Recent Conversations" action={<button onClick={() => router.push('/copilot/history')} className="text-xs text-[#1A3DAF] hover:underline">All →</button>}/>
          <div className="divide-y divide-[#ECEAE4]">
            {data.recent_convs.map((c: any) => (
              <div key={c.id} onClick={() => router.push(`/copilot?conv=${c.id}`)}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[#F7F5F0] cursor-pointer">
                <MessageSquare className="w-4 h-4 text-[#9B9890] flex-shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0E0D0A] truncate">{c.title}</p>
                  <p className="font-mono text-[11px] text-[#9B9890]">{c.message_count} messages</p>
                </div>
                <Badge variant="blue">{c.mode}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

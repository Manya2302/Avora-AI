'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, FileBarChart, BookOpen, Network, Lightbulb, Sparkles, History, Plus } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card, CardHeader } from '@/components/shared/Card'
import StatCard from '@/components/shared/StatCard'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'

export default function WorkspacePage() {
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { copilotApi.dashboard().then(r => setData(r.data)).catch(()=>{}).finally(()=>setLoading(false)) }, [])

  const tools = [
    { label:'New conversation',     icon:MessageSquare, href:'/copilot',                 desc:'Ask a question about your documents' },
    { label:'Reports',              icon:FileBarChart,  href:'/copilot/reports',         desc:'Analysis that spans many documents' },
    { label:'Prompt library',       icon:BookOpen,      href:'/copilot/prompts',         desc:'Ready-made questions for common reviews' },
    { label:'Knowledge explorer',   icon:Network,       href:'/knowledge',               desc:'How people, vendors and documents connect' },
    { label:'Recommendations',      icon:Lightbulb,     href:'/copilot/recommendations', desc:'Things worth a look in your documents' },
    { label:'Conversation history', icon:History,       href:'/copilot/history',         desc:'Pick up a past conversation' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Copilot"
        description="Ask questions across your documents, generate reports and pick up past conversations."
        actions={<Button size="sm" onClick={() => router.push('/copilot')}><Plus className="h-3.5 w-3.5"/> New chat</Button>}
      />

      {/* Usage stats */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[104px] animate-pulse rounded-[12px] bg-[#F1EFEA]"/>)}
        </div>
      ) : !data ? (
        <p className="text-[13px] text-[#8A877F]">Usage stats couldn’t be loaded right now.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <StatCard label="Conversations"     value={data.total_conversations} icon={<MessageSquare/>} accent="blue"/>
          <StatCard label="Questions asked"   value={data.total_questions}     icon={<Sparkles/>}      accent="purple"/>
          <StatCard label="Reports generated" value={data.reports_generated}   icon={<FileBarChart/>}  accent="green"/>
          <StatCard label="Average confidence" value={typeof data.avg_confidence === 'number' ? `${data.avg_confidence}%` : '—'} icon={<Lightbulb/>}  accent="amber"/>
        </div>
      )}

      {/* Tools grid */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map(t => (
          <button key={t.href} onClick={() => router.push(t.href)}
            className="group flex items-start gap-3 rounded-[12px] border border-[#DDD9D0] bg-white p-4 text-left transition-colors hover:border-[#BDB8AC]">
            <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75}/>
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold text-[#0E0D0A]">{t.label}</h3>
              <p className="mt-0.5 text-[13px] text-[#8A877F]">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Recent conversations */}
      {data?.recent_convs?.length > 0 && (
        <Card>
          <CardHeader title="Recent conversations" action={<button onClick={() => router.push('/copilot/history')} className="link text-[13px]">View all</button>}/>
          <div>
            {data.recent_convs.map((c: any) => (
              <div key={c.id} onClick={() => router.push(`/copilot?conv=${c.id}`)}
                className="flex cursor-pointer items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0 hover:bg-[#FBFAF7]">
                <MessageSquare className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75}/>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#0E0D0A]">{c.title}</p>
                  <p className="text-[12.5px] text-[#8A877F]">{c.message_count} messages</p>
                </div>
                <Badge variant="gray" className="capitalize">{c.mode}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

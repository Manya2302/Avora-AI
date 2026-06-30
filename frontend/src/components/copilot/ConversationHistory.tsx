'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Pin, Trash2, Search, FileText, Shield, BookOpen, Brain, AlertTriangle } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import type { Conversation } from '@/types'
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'

const MODE_ICON: Record<string,any> = { document:FileText, compliance:Shield, audit:BookOpen, knowledge:Brain, risk:AlertTriangle }
const MODE_COLOR: Record<string,any> = { document:'blue', compliance:'green', audit:'purple', knowledge:'amber', risk:'red' }

export default function ConversationHistory() {
  const router = useRouter()
  const [convs, setConvs]   = useState<Conversation[]>([])
  const [loading, setLoad]  = useState(true)
  const [search, setSearch] = useState('')

  const load = () => { copilotApi.conversations().then(r => setConvs(r.data.results||[])).catch(()=>{}).finally(()=>setLoad(false)) }
  useEffect(() => { load() }, [])

  const pin = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try { await copilotApi.pinConversation(id); load() } catch {}
  }
  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this conversation?')) return
    try { await copilotApi.deleteConversation(id); toast.success('Deleted.'); load() } catch {}
  }

  const filtered = convs.filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()))
  const pinned   = filtered.filter(c => c.is_pinned)
  const others   = filtered.filter(c => !c.is_pinned)

  const ConvCard = ({ c }: { c: Conversation }) => {
    const Icon = MODE_ICON[c.mode] || FileText
    return (
      <div onClick={() => router.push(`/copilot?conv=${c.id}`)}
        className="flex items-center gap-3 px-5 py-3.5 border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0] cursor-pointer group">
        <div className="w-9 h-9 bg-[#EBF0FF] rounded-[9px] flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-[#1A3DAF]"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-medium text-[#0E0D0A] truncate">{c.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={MODE_COLOR[c.mode]}>{c.mode}</Badge>
            <span className="font-mono text-[10.5px] text-[#9B9890]">{c.message_count} msgs · {formatDateTime(c.updated_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => pin(c.id, e)} className={`p-1.5 rounded-md hover:bg-white ${c.is_pinned ? 'text-amber-500' : 'text-[#9B9890]'}`}>
            <Pin className="w-3.5 h-3.5" fill={c.is_pinned ? 'currentColor' : 'none'}/>
          </button>
          <button onClick={e => del(c.id, e)} className="p-1.5 rounded-md hover:bg-red-50 text-[#9B9890] hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><MessageSquare className="w-5 h-5 text-[#1A3DAF]"/></div>
          <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Conversation History</h2>
            <p className="text-sm text-[#9B9890]">All your past Copilot conversations</p></div>
        </div>
        <button onClick={() => router.push('/copilot')} className="px-4 py-2 bg-[#0E0D0A] text-white rounded-[9px] text-sm font-medium hover:bg-[#252318] transition-colors">New Chat</button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 bg-white border border-[#DDD9D0] rounded-[9px] max-w-sm">
        <Search className="w-3.5 h-3.5 text-[#9B9890]"/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…"
          className="flex-1 border-none outline-none text-sm bg-transparent text-[#0E0D0A] placeholder:text-[#9B9890]"/>
      </div>

      {loading ? <div className="h-40 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse"/>
      : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#DDD9D0] rounded-[16px]">
          <MessageSquare className="w-10 h-10 text-[#DDD9D0] mx-auto mb-3"/>
          <p className="text-sm text-[#9B9890]">No conversations yet. Start chatting with Avora Copilot.</p>
        </div>
      ) : (<>
        {pinned.length > 0 && (
          <Card>
            <div className="px-4 py-2.5 border-b border-[#ECEAE4] flex items-center gap-2">
              <Pin className="w-3.5 h-3.5 text-amber-500" fill="currentColor"/>
              <span className="text-xs font-semibold text-[#5A5750]">Pinned</span>
            </div>
            {pinned.map(c => <ConvCard key={c.id} c={c}/>)}
          </Card>
        )}
        <Card>
          {others.length === 0 && pinned.length > 0 ? null : others.map(c => <ConvCard key={c.id} c={c}/>)}
        </Card>
      </>)}
    </div>
  )
}

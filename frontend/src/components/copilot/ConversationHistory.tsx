'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Pin, Trash2, Search, FileText, Shield, BookOpen, Brain, AlertTriangle, Plus } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
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
        className="group flex cursor-pointer items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0 hover:bg-[#FBFAF7]">
        <Icon className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75}/>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[#0E0D0A]">{c.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={MODE_COLOR[c.mode]} className="capitalize">{c.mode}</Badge>
            <span className="text-[12.5px] text-[#8A877F]">{c.message_count} messages · {formatDateTime(c.updated_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button onClick={e => pin(c.id, e)} aria-label={c.is_pinned ? 'Unpin conversation' : 'Pin conversation'}
            className={`rounded-[6px] p-1.5 hover:bg-[#ECEAE4] ${c.is_pinned ? 'text-[#0E0D0A]' : 'text-[#8A877F] hover:text-[#0E0D0A]'}`}>
            <Pin className="h-3.5 w-3.5" fill={c.is_pinned ? 'currentColor' : 'none'}/>
          </button>
          <button onClick={e => del(c.id, e)} aria-label="Delete conversation"
            className="rounded-[6px] p-1.5 text-[#8A877F] hover:bg-[#FCEFEF] hover:text-[#B91C1C]">
            <Trash2 className="h-3.5 w-3.5"/>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversation history"
        description="Every conversation you've had with Copilot. Pin the ones you come back to."
        actions={<Button size="sm" onClick={() => router.push('/copilot')}><Plus className="h-3.5 w-3.5"/> New chat</Button>}
      />

      <label className="relative block max-w-sm">
        <span className="sr-only">Search conversations</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A877F]"/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations"
          className="field h-9 pl-9"/>
      </label>

      {loading ? (
        <Card>
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]"/>)}
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<MessageSquare/>} title={search ? 'No conversations match that search' : 'No conversations yet'}
            action={!search && <Button size="sm" onClick={() => router.push('/copilot')}>Start a conversation</Button>}>
            {search ? 'Try a different word from the conversation title.' : 'Ask Copilot a question about your documents and it will show up here.'}
          </EmptyState>
        </Card>
      ) : (<>
        {pinned.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 border-b border-[#ECEAE4] px-5 py-3">
              <Pin className="h-3.5 w-3.5 text-[#8A877F]" fill="currentColor"/>
              <span className="text-[14px] font-semibold text-[#0E0D0A]">Pinned</span>
            </div>
            {pinned.map(c => <ConvCard key={c.id} c={c}/>)}
          </Card>
        )}
        {others.length === 0 && pinned.length > 0 ? null : (
          <Card>
            {others.map(c => <ConvCard key={c.id} c={c}/>)}
          </Card>
        )}
      </>)}
    </div>
  )
}

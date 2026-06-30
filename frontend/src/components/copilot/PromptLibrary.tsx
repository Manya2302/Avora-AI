'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Sparkles, Plus, X } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import type { PromptTemplate } from '@/types'
import toast from 'react-hot-toast'

const CATEGORIES = ['','audit','contract','vendor','policy','risk','compliance','financial','hr']
const CAT_COLOR: Record<string,any> = { audit:'purple', contract:'blue', vendor:'amber', policy:'green', risk:'red', compliance:'blue', financial:'green', hr:'amber', custom:'gray' }

export default function PromptLibrary() {
  const router = useRouter()
  const [prompts, setPrompts] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat]         = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPrompt, setNewPrompt] = useState('')

  const load = () => { copilotApi.prompts(cat || undefined).then(r => setPrompts(r.data.results||r.data||[])).catch(()=>{}).finally(()=>setLoading(false)) }
  useEffect(() => { load() }, [cat])

  const seed = async () => {
    try { await copilotApi.seedPrompts(); toast.success('Built-in prompts loaded!'); load() } catch {}
  }

  const usePrompt = (p: PromptTemplate) => {
    router.push(`/copilot?template=${p.id}`)
  }

  const createPrompt = async () => {
    if (!newTitle.trim() || !newPrompt.trim()) return
    try {
      await copilotApi.createPrompt({ title:newTitle, prompt:newPrompt, category:'custom' })
      toast.success('Prompt created!')
      setShowNew(false); setNewTitle(''); setNewPrompt(''); load()
    } catch { toast.error('Failed to create prompt.') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><BookOpen className="w-5 h-5 text-[#1A3DAF]"/></div>
          <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Prompt Library</h2>
            <p className="text-sm text-[#9B9890]">Built-in enterprise prompts for common tasks</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={seed}><Sparkles className="w-3.5 h-3.5"/> Load Built-ins</Button>
          <Button size="sm" onClick={() => setShowNew(true)}><Plus className="w-3.5 h-3.5"/> New Prompt</Button>
        </div>
      </div>

      {showNew && (
        <Card>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#0E0D0A]">Create Custom Prompt</span>
              <button onClick={() => setShowNew(false)}><X className="w-4 h-4 text-[#9B9890]"/></button>
            </div>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Prompt title…"
              className="w-full px-3 py-2.5 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-sm outline-none focus:border-[#1A3DAF]"/>
            <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder="Enter the full prompt text…" rows={3}
              className="w-full px-3 py-2.5 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-sm outline-none focus:border-[#1A3DAF] resize-none"/>
            <Button size="sm" onClick={createPrompt}>Save Prompt</Button>
          </div>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-all ${cat===c ? 'bg-[#0E0D0A] text-white border-[#0E0D0A]' : 'bg-white border-[#DDD9D0] text-[#5A5750] hover:border-[#0E0D0A]'}`}>
            {c || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({length:4}).map((_,i) => <div key={i} className="h-28 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse"/>)}</div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#DDD9D0] rounded-[16px]">
          <BookOpen className="w-10 h-10 text-[#DDD9D0] mx-auto mb-3"/>
          <p className="text-sm text-[#9B9890] mb-4">No prompts yet.</p>
          <Button size="sm" onClick={seed}><Sparkles className="w-3.5 h-3.5"/> Load Built-in Prompts</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {prompts.map(p => (
            <div key={p.id} onClick={() => usePrompt(p)}
              className="bg-white border border-[#DDD9D0] rounded-[13px] p-4 hover:border-[#1A3DAF]/30 hover:shadow-md transition-all cursor-pointer group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-[#0E0D0A] text-sm group-hover:text-[#1A3DAF] transition-colors">{p.title}</h3>
                <Badge variant={CAT_COLOR[p.category] || 'gray'}>{p.category}</Badge>
              </div>
              <p className="text-xs text-[#9B9890] mb-3 line-clamp-2">{p.description || p.prompt}</p>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-[#9B9890]">{p.use_count} uses</span>
                {p.is_builtin && <span className="font-mono text-[9px] text-[#1A3DAF] bg-[#EBF0FF] px-2 py-0.5 rounded-full">Built-in</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Plus, X } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
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
    try { await copilotApi.seedPrompts(); toast.success('Built-in prompts loaded.'); load() } catch {}
  }

  const usePrompt = (p: PromptTemplate) => {
    router.push(`/copilot?template=${p.id}`)
  }

  const createPrompt = async () => {
    if (!newTitle.trim() || !newPrompt.trim()) return
    try {
      await copilotApi.createPrompt({ title:newTitle, prompt:newPrompt, category:'custom' })
      toast.success('Prompt saved.')
      setShowNew(false); setNewTitle(''); setNewPrompt(''); load()
    } catch { toast.error('Failed to create prompt.') }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prompt library"
        description="Ready-made questions for common review tasks. Pick one to open it in Copilot."
        actions={<>
          <Button variant="ghost" size="sm" onClick={seed}>Load built-in prompts</Button>
          <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5"/> New prompt</Button>
        </>}
      />

      {showNew && (
        <Card>
          <CardHeader title="New prompt" subtitle="Saved to your library under Custom."
            action={<button onClick={() => setShowNew(false)} aria-label="Close" className="rounded-[6px] p-1 text-[#8A877F] hover:bg-[#F1EFEA] hover:text-[#0E0D0A]"><X className="h-4 w-4"/></button>}/>
          <CardBody className="space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#2B2924]">Title</span>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Termination clauses in vendor contracts"
                className="field"/>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-[#2B2924]">Prompt</span>
              <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder="Write the full question Copilot should answer" rows={3}
                className="field resize-none"/>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={createPrompt}>Save prompt</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="flex gap-5 overflow-x-auto border-b border-[#ECEAE4]">
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`-mb-px shrink-0 border-b-2 pb-2.5 text-[13.5px] capitalize transition-colors ${cat===c ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'}`}>
            {c === 'hr' ? 'HR' : c || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{Array.from({length:4}).map((_,i) => <div key={i} className="h-28 animate-pulse rounded-[12px] bg-[#F1EFEA]"/>)}</div>
      ) : prompts.length === 0 ? (
        <Card>
          <EmptyState icon={<BookOpen/>} title="No prompts here yet"
            action={<Button size="sm" onClick={seed}>Load built-in prompts</Button>}>
            Load the built-in set to get started, or write your own with New prompt.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {prompts.map(p => (
            <button key={p.id} onClick={() => usePrompt(p)}
              className="group flex flex-col rounded-[12px] border border-[#DDD9D0] bg-white p-4 text-left transition-colors hover:border-[#BDB8AC]">
              <div className="mb-1.5 flex w-full items-start justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-[#0E0D0A]">{p.title}</h3>
                <Badge variant={CAT_COLOR[p.category] || 'gray'} className="capitalize">{p.category}</Badge>
              </div>
              <p className="mb-3 line-clamp-2 text-[13px] text-[#5A5750]">{p.description || p.prompt}</p>
              <div className="mt-auto flex w-full items-center justify-between text-[12.5px] text-[#8A877F]">
                <span>Used {p.use_count} {p.use_count === 1 ? 'time' : 'times'}{p.is_builtin && ' · Built-in'}</span>
                <span className="text-[#1A3DAF] opacity-0 transition-opacity group-hover:opacity-100">Use prompt</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

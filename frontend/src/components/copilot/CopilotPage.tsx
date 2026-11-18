'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Sparkles, Send, FileText, ChevronDown, Plus, Brain,
  AlertTriangle, FolderSearch, ExternalLink, History,
  Cloud, Mail, Github, MessageSquare, Database, Upload,
  CheckCircle2, X, ChevronRight, ArrowRight
} from 'lucide-react'
import { copilotApi, integrationsApi } from '@/lib/api'
import type { Conversation, DocSource } from '@/types'
import { cn } from '@/lib/utils'
import Badge from '@/components/shared/Badge'
import toast from 'react-hot-toast'

// ── Source definitions ────────────────────────────────────────────────────────
const SOURCE_APPS = [
  { id: 'all',          label: 'All sources',      icon: Database,      color: '#1A3DAF', always: true },
  { id: 'google_drive', label: 'Google Drive',     icon: Cloud,         color: '#0066DA' },
  { id: 'gmail',        label: 'Gmail',            icon: Mail,          color: '#EA4335' },
  { id: 'github',       label: 'GitHub',           icon: Github,        color: '#24292F' },
  { id: 'slack',        label: 'Slack',            icon: MessageSquare, color: '#611f69' },
  { id: 'uploads',      label: 'Uploaded files',   icon: Upload,        color: '#16A34A' },
]

const SUGGESTED = [
  'Find all vendor contracts signed in 2024',
  'Show invoices above ₹5,00,000',
  'Summarize HR policies',
  'Are we audit ready?',
  'Show contracts expiring next quarter',
]

// Citations carry the document's origin (added by /copilot/query/ and conversation detail)
type CitedSource = DocSource & { origin?: string }

// Distinct apps the cited documents came from, in SOURCE_APPS order
function sourceAppsUsed(sources?: CitedSource[]) {
  const used = new Set((sources || []).map(s => s.origin).filter(Boolean) as string[])
  return SOURCE_APPS.filter(app => !app.always && used.has(app.id))
}

interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  confidence?: number
  sources?: CitedSource[]
  flags?: string[]
  pending?: boolean
  activeAgent?: string
  agentReason?: string
}

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => { if (!disabled) onToggle() }}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150 ${disabled ? 'cursor-not-allowed bg-[#ECEAE4]' : on ? 'bg-[#0E0D0A]' : 'bg-[#DDD9D0]'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full transition-transform duration-150 ${disabled ? 'bg-[#F7F5F0]' : 'bg-white'} ${on ? 'translate-x-3.5' : 'translate-x-0'}`} />
    </button>
  )
}

// ── Sources Panel ─────────────────────────────────────────────────────────────
function SourcesPanel({
  enabled, onToggle, gdConnected, connectedApps
}: {
  enabled: Record<string, boolean>
  onToggle: (id: string) => void
  gdConnected: boolean
  connectedApps: Record<string, boolean>
}) {
  const [tab, setTab] = useState<'sources' | 'history'>('sources')
  const [addOpen, setAddOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="hidden w-60 shrink-0 flex-col overflow-hidden rounded-[12px] border border-[#DDD9D0] bg-white md:flex">
      {/* Tabs */}
      <div className="flex gap-5 border-b border-[#ECEAE4] px-4">
        {(['sources', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 pb-2.5 pt-3 text-[13px] transition-colors ${tab === t ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'}`}>
            {t === 'sources' ? 'Sources' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'sources' ? (
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          {!gdConnected && (
            <p className="px-1 pt-1 text-[12.5px] text-[#8A877F]">
              Connect Google Drive or another app so Copilot can search more than your uploads.
            </p>
          )}

          {/* Add button */}
          <div className="relative">
            <button
              onClick={() => setAddOpen(o => !o)}
              aria-expanded={addOpen}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-[#DDD9D0] bg-white px-3 text-[13px] font-medium text-[#2B2924] transition-colors hover:border-[#BDB8AC] hover:bg-[#FBFAF7]"
            >
              <Plus className="h-3.5 w-3.5" /> Connect a source
              <ChevronDown className={`h-3.5 w-3.5 text-[#8A877F] transition-transform ${addOpen ? 'rotate-180' : ''}`} />
            </button>
            {addOpen && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[8px] border border-[#DDD9D0] bg-white py-1 shadow-lg">
                {SOURCE_APPS.filter(s => !s.always).map(app => (
                  <button key={app.id}
                    onClick={() => { setAddOpen(false); if (app.id === 'google_drive' || app.id === 'github') router.push('/integrations') }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#F7F5F0]">
                    <app.icon className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                    <span className="text-[13px] text-[#0E0D0A]">{app.label}</span>
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-[#8A877F]" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Source toggles */}
          <div>
            <p className="mb-1 px-1 text-[12px] font-medium text-[#8A877F]">Search in</p>
            {SOURCE_APPS.map(app => {
              if (app.always) return null
              const isConnected = app.id === 'uploads' || connectedApps[app.id]
              return (
                <div key={app.id}
                  className={`flex items-center gap-2.5 rounded-[8px] px-2 py-2 transition-colors ${!isConnected ? '' : 'hover:bg-[#FBFAF7]'}`}>
                  <app.icon className={`h-4 w-4 shrink-0 ${isConnected ? 'text-[#5A5750]' : 'text-[#BDB8AC]'}`} strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] ${!isConnected ? 'text-[#8A877F]' : enabled[app.id] ? 'font-medium text-[#0E0D0A]' : 'text-[#2B2924]'}`}>{app.label}</span>
                    {!isConnected && <span className="block text-[11.5px] text-[#8A877F]">Not connected</span>}
                  </span>
                  <Toggle on={!!enabled[app.id]} onToggle={() => onToggle(app.id)} disabled={!isConnected} />
                </div>
              )
            })}
          </div>

          {/* Let AI decide */}
          <div className="mt-auto border-t border-[#ECEAE4] pt-3">
            <div className="flex items-center justify-between gap-2 px-2">
              <span className="text-[13px] text-[#2B2924]">Let Copilot choose sources</span>
              <Toggle on={!!enabled['all']} onToggle={() => onToggle('all')} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <History className="h-5 w-5 text-[#BDB8AC]" strokeWidth={1.75} />
          <p className="text-[13px] text-[#8A877F]">Past conversations live on the history page.</p>
          <button onClick={() => router.push('/copilot/history')}
            className="link text-[13px]">Open history</button>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CopilotPage() {
  // useSearchParams needs a Suspense boundary in Next 14
  return <Suspense fallback={null}><CopilotPageInner /></Suspense>
}

function CopilotPageInner() {
  const router   = useRouter()
  const params   = useSearchParams()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const [activeAgent, setActiveAgent] = useState('Coordinator Agent')
  const [agentReason, setAgentReason] = useState('Ready to route your request.')
  const [convId, setConvId]           = useState<string | null>(params.get('conv'))
  const [msgs, setMsgs]               = useState<Msg[]>([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [expandedSrc, setExpanded]    = useState<string | null>(null)
  const [gdConnected, setGdConnected] = useState(false)
  const [connectedApps, setConnectedApps] = useState<Record<string, boolean>>({})

  // Source toggles — "all" = let AI decide (default on)
  const [sourcesEnabled, setSourcesEnabled] = useState<Record<string, boolean>>({
    all: true, google_drive: false, gmail: false, github: false, slack: false, uploads: false,
  })

  useEffect(() => {
    integrationsApi.list().then(r => {
      const connected: Record<string, boolean> = {}
      if (Array.isArray(r.data)) {
        r.data.forEach((app: any) => {
          if (app.status === 'connected' || app.status === 'syncing' || app.status === 'active') {
            connected[app.provider] = true
            if (app.provider === 'google-drive' || app.provider === 'google_drive') {
              setGdConnected(true)
              connected['google_drive'] = true
            }
          }
        })
      }
      setConnectedApps(connected)
    }).catch(() => {
      // Fallback
      integrationsApi.gdStatus().then(r => {
        setGdConnected(r.data?.status === 'connected' || r.data?.status === 'syncing')
        if (r.data?.status === 'connected') setConnectedApps(prev => ({...prev, google_drive: true}))
      }).catch(() => {})
    })
  }, [])

  const toggleSource = (id: string) => {
    if (id === 'all') {
      setSourcesEnabled(p => ({ ...p, all: !p.all }))
      return
    }
    setSourcesEnabled(p => {
      const next = { ...p, [id]: !p[id] }
      // If any specific source on, turn off "all"
      const anySpecific = SOURCE_APPS.filter(s => !s.always).some(s => next[s.id])
      return { ...next, all: !anySpecific }
    })
  }

  // ?template=<prompt id> from the prompt library → prefill the composer with that prompt
  const templateId = params.get('template')
  useEffect(() => {
    if (!templateId) return
    let cancelled = false
    copilotApi.openPrompt(templateId).then(r => {
      if (cancelled || !r.data?.prompt) return
      setInput(r.data.prompt)
      inputRef.current?.focus()
    }).catch(() => { if (!cancelled) toast.error('Could not load that prompt.') })
    return () => { cancelled = true }
  }, [templateId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, loading])

  useEffect(() => {
    if (convId) {
      copilotApi.conversation(convId).then(r => {
        const conv = r.data
        setMsgs((conv.messages || []).map((m: any) => ({
          id: m.id, role: m.role, content: m.content,
          confidence: m.confidence_score, sources: m.references,
          activeAgent: m.activeAgent, agentReason: m.agentReason,
        })))
      }).catch(() => {})
    }
  }, [convId])

  const send = async (q?: string) => {
    const text = (q || input).trim()
    if (!text || loading) return
    const userMsg: Msg   = { id: Date.now().toString(), role: 'user', content: text }
    const pendingMsg: Msg = { id: 'pending', role: 'assistant', content: '', pending: true }
    setMsgs(p => [...p, userMsg, pendingMsg])
    setInput(''); setLoading(true)
    try {
      const { data } = await copilotApi.query({ question: text, conversation_id: convId, mode: 'document' })
      if (!convId) setConvId(data.conversation_id)
      const newAgent = data.active_agent || 'Search Agent'
      setActiveAgent(newAgent)
      setAgentReason(data.agent_reason || '')
      setMsgs(p => p.filter(m => m.id !== 'pending').concat({
        id: data.message_id, role: 'assistant', content: data.answer,
        confidence: data.confidence, sources: data.sources, flags: data.hallucination_flags,
        activeAgent: newAgent, agentReason: data.agent_reason,
      }))
    } catch {
      setMsgs(p => p.filter(m => m.id !== 'pending').concat({
        id: Date.now().toString(), role: 'assistant',
        content: 'Sorry, I ran into an issue. Please try again.',
      }))
      toast.error('Query failed.')
    } finally { setLoading(false) }
  }

  const newChat = () => {
    setConvId(null); setMsgs([]); setInput('')
    setActiveAgent('Coordinator Agent'); setAgentReason('Ready to route your request.')
  }

  const confColor = (c?: number) => !c ? 'gray' : c >= 0.75 ? 'green' : c >= 0.5 ? 'amber' : 'red'
  const confLabel = (c?: number) => !c ? '—' : c >= 0.75 ? 'High confidence' : c >= 0.5 ? 'Medium confidence' : 'Low confidence'

  // Active sources label for input placeholder
  const activeSourceLabels = sourcesEnabled.all
    ? 'all sources'
    : SOURCE_APPS.filter(s => !s.always && sourcesEnabled[s.id]).map(s => s.label).join(', ') || 'all sources'

  return (
    <div className="mx-auto flex h-[calc(100vh-110px)] max-w-6xl gap-5">

      {/* ── Sources panel (left) ── */}
      <SourcesPanel enabled={sourcesEnabled} onToggle={toggleSource} gdConnected={gdConnected} connectedApps={connectedApps} />

      {/* ── Chat area (right) ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-[#ECEAE4] pb-4">
          <div className="min-w-0 flex-1">
            <h1 className="page-title">Copilot</h1>
            <p className="mt-0.5 truncate text-[13px] text-[#8A877F]">Searching {activeSourceLabels}</p>
          </div>

          {/* Agent badge */}
          <div tabIndex={0} className="group relative flex cursor-help items-center gap-1.5 rounded-[6px] border border-[#DDD9D0] bg-white px-2 py-1 outline-none">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
            <span className="text-[12.5px] font-medium text-[#2B2924]">{activeAgent}</span>
            <div className="invisible absolute right-0 top-full z-20 mt-2 w-64 rounded-[8px] bg-[#0E0D0A] p-3 text-[12.5px] text-[#F7F5F0] opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">
              <p className="mb-1 font-medium">Why this agent</p>
              <p className="text-[#F7F5F0]/65">{agentReason}</p>
            </div>
          </div>

          <button onClick={newChat} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#0E0D0A] bg-[#0E0D0A] px-3 text-[13px] font-medium text-[#F7F5F0] transition-colors hover:bg-[#2B2924]">
            <Plus className="h-3.5 w-3.5" /> New chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-6 overflow-y-auto pr-1">
          {msgs.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <h2 className="font-display text-[22px] font-semibold text-[#0E0D0A]">What would you like to know?</h2>
              <p className="mb-6 mt-1.5 max-w-md text-[14px] text-[#5A5750]">
                Ask about anything in your documents. Copilot passes your question to the right specialist — finance, legal, security — and shows where each answer came from.
              </p>
              <div className="w-full max-w-lg overflow-hidden rounded-[12px] border border-[#DDD9D0] bg-white text-left">
                {SUGGESTED.map(q => (
                  <button key={q} onClick={() => send(q)}
                    className="flex w-full items-center gap-3 border-t border-[#F1EFEA] px-4 py-2.5 text-[14px] text-[#2B2924] transition-colors first:border-0 hover:bg-[#FBFAF7] hover:text-[#0E0D0A]">
                    <span className="flex-1">{q}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#BDB8AC]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, index) => {
            const prevAgent = index > 0 ? msgs[index - 1]?.activeAgent : 'Coordinator Agent'
            const agentSwitched = m.role === 'assistant' && m.activeAgent && m.activeAgent !== prevAgent
            return (
              <div key={m.id} className="flex flex-col gap-3">
                {agentSwitched && (
                  <div className="flex flex-col items-center gap-1 text-center">
                    <div className="flex items-center gap-2 text-[12.5px]">
                      <span className="text-[#8A877F]">{prevAgent || 'Coordinator Agent'}</span>
                      <ArrowRight className="h-3 w-3 text-[#BDB8AC]" />
                      <span className="font-medium text-[#2B2924]">{m.activeAgent}</span>
                    </div>
                    {m.agentReason && <span className="max-w-md text-[12px] text-[#8A877F]">{m.agentReason}</span>}
                  </div>
                )}

                <div className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(m.role === 'user' ? 'max-w-[78%]' : 'w-full max-w-[720px]')}>
                    <div className={cn(m.role === 'user' && 'rounded-[12px] bg-[#0E0D0A] px-4 py-2.5')}>
                      {m.pending ? (
                        <div className="flex h-6 items-center gap-2 text-[13px] text-[#8A877F]">
                          <span className="flex gap-1">
                            {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8A877F]" style={{ animationDelay: `${i * 0.15}s` }} />)}
                          </span>
                          Searching your documents…
                        </div>
                      ) : (
                        <p className={cn('whitespace-pre-wrap text-[14.5px] leading-[1.7]', m.role === 'user' ? 'text-[#F7F5F0]' : 'text-[#2B2924]')}>{m.content}</p>
                      )}
                    </div>

                    {/* Sources used chips */}
                    {m.role === 'assistant' && !m.pending && sourceAppsUsed(m.sources).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {sourceAppsUsed(m.sources).map(app => (
                          <span key={app.id} className="inline-flex items-center gap-1 rounded-[5px] bg-[#F1EFEA] px-1.5 py-0.5 text-[11.5px] text-[#5A5750]">
                            <app.icon className="h-3 w-3" strokeWidth={1.75} />
                            {app.label}
                          </span>
                        ))}
                      </div>
                    )}

                    {m.role === 'assistant' && !m.pending && (
                      <div className="mt-3 space-y-2.5">
                        {/* Citations */}
                        {m.sources && m.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {m.sources.map((s, i) => (
                              <button key={i} onClick={() => router.push(`/documents/${s.document_id}`)} title={s.document_name}
                                className="inline-flex max-w-[260px] items-center gap-1.5 rounded-[6px] border border-[#DDD9D0] bg-white px-2 py-1 text-[12.5px] text-[#2B2924] transition-colors hover:border-[#BDB8AC] hover:bg-[#FBFAF7]">
                                <FileText className="h-3.5 w-3.5 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                                <span className="truncate">{s.document_name}</span>
                                <span className="shrink-0 tabular-nums text-[#8A877F]">{Math.round(s.relevance * 100)}%</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-[#8A877F]">
                          {m.confidence !== undefined && (
                            <Badge variant={confColor(m.confidence) as 'green' | 'amber' | 'red' | 'gray'}>
                              {confLabel(m.confidence)} · {Math.round((m.confidence || 0) * 100)}%
                            </Badge>
                          )}
                          {m.flags && m.flags.length > 0 && (
                            <Badge variant="red"><AlertTriangle className="h-3 w-3" /> Needs review</Badge>
                          )}
                          {m.sources && m.sources.length > 0 && (
                            <button onClick={() => setExpanded(expandedSrc === m.id ? null : m.id)}
                              aria-expanded={expandedSrc === m.id}
                              className="inline-flex items-center gap-1 text-[12.5px] text-[#5A5750] hover:text-[#0E0D0A]">
                              {expandedSrc === m.id ? 'Hide' : 'Show'} excerpts from {m.sources.length} source{m.sources.length > 1 ? 's' : ''}
                              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expandedSrc === m.id && 'rotate-180')} />
                            </button>
                          )}
                        </div>

                        {m.sources && m.sources.length > 0 && expandedSrc === m.id && (
                          <div className="overflow-hidden rounded-[12px] border border-[#DDD9D0] bg-white">
                            {m.sources.map((s, i) => (
                              <button key={i} onClick={() => router.push(`/documents/${s.document_id}`)}
                                className="flex w-full items-start gap-2.5 border-t border-[#F1EFEA] px-4 py-3 text-left transition-colors first:border-0 hover:bg-[#FBFAF7]">
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-[13.5px] font-medium text-[#0E0D0A]">{s.document_name}</span>
                                    <span className="shrink-0 text-[12px] tabular-nums text-[#8A877F]">{Math.round(s.relevance * 100)}% match</span>
                                  </div>
                                  {s.excerpt && <p className="mt-0.5 line-clamp-2 text-[13px] text-[#5A5750]">“{s.excerpt}”</p>}
                                </div>
                                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8A877F]" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="mt-4 flex items-end gap-2 rounded-[12px] border border-[#DDD9D0] bg-white p-2 pl-3.5 transition-colors focus-within:border-[#1A3DAF] focus-within:ring-[3px] focus-within:ring-[#1A3DAF]/10">
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={`Ask about ${activeSourceLabels}…`}
            aria-label="Message Copilot"
            rows={1} className="max-h-32 min-h-[32px] flex-1 resize-none border-none bg-transparent py-1.5 text-[14px] text-[#0E0D0A] outline-none placeholder:text-[#9B9890] focus-visible:outline-none" />
          <button onClick={() => send()} disabled={!input.trim() || loading} aria-label="Send"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#0E0D0A] text-[#F7F5F0] transition-colors hover:bg-[#2B2924] disabled:cursor-not-allowed disabled:bg-[#DDD9D0]">
            <Send className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <p className="mt-2 text-center text-[12px] text-[#8A877F]">
          Copilot answers from your documents and cites them. Check anything important against the original.
        </p>
      </div>
    </div>
  )
}

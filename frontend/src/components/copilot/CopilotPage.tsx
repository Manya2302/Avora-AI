'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, Send, FileText, ChevronDown, Plus, Pin, BookOpen, Brain, Shield, AlertTriangle, FolderSearch, ExternalLink } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import type { Conversation, DocSource } from '@/types'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const SUGGESTED: Record<string,string[]> = {
  document:   ['Find all vendor contracts signed in 2024','Show invoices above ₹5,00,000','Summarize HR policies', 'Are we audit ready?', 'Show contracts expiring next quarter'],
}

interface Msg {
  id: string
  role: 'user'|'assistant'
  content: string
  confidence?: number
  sources?: DocSource[]
  flags?: string[]
  pending?: boolean
  activeAgent?: string
  agentReason?: string
}

export default function CopilotPage() {
  const router  = useRouter()
  const params  = useSearchParams()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const [activeAgent, setActiveAgent] = useState('Coordinator Agent')
  const [agentReason, setAgentReason] = useState('Ready to route your request.')

  const [convId, setConvId]       = useState<string | null>(params.get('conv'))
  const [msgs, setMsgs]           = useState<Msg[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [expandedSrc, setExpanded] = useState<string | null>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs, loading])

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
    const userMsg: Msg = { id: Date.now().toString(), role:'user', content:text }
    const pendingMsg: Msg = { id:'pending', role:'assistant', content:'', pending:true }
    setMsgs(p => [...p, userMsg, pendingMsg])
    setInput(''); setLoading(true)
    try {
      const { data } = await copilotApi.query({ question:text, conversation_id:convId, mode: 'document' })
      if (!convId) setConvId(data.conversation_id)
      
      const newAgent = data.active_agent || 'Search Agent'
      setActiveAgent(newAgent)
      setAgentReason(data.agent_reason || '')

      setMsgs(p => p.filter(m => m.id !== 'pending').concat({
        id: data.message_id, role:'assistant', content: data.answer,
        confidence: data.confidence, sources: data.sources, flags: data.hallucination_flags,
        activeAgent: newAgent, agentReason: data.agent_reason,
      }))
    } catch (e) {
      setMsgs(p => p.filter(m => m.id !== 'pending').concat({
        id: Date.now().toString(), role:'assistant',
        content: 'Sorry, I ran into an issue answering that. Please try again.',
      }))
      toast.error('Query failed.')
    } finally { setLoading(false) }
  }

  const newChat = () => { setConvId(null); setMsgs([]); setInput(''); setActiveAgent('Coordinator Agent'); setAgentReason('Ready to route your request.') }


  const confColor = (c?: number) => !c ? 'gray' : c >= 0.75 ? 'green' : c >= 0.5 ? 'amber' : 'red'
  const confLabel = (c?: number) => !c ? '—' : c >= 0.75 ? 'High confidence' : c >= 0.5 ? 'Medium confidence' : 'Low confidence'

  return (
    <div className="flex flex-col h-[calc(100vh-110px)] max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-9 h-9 bg-gradient-to-br from-[#1A3DAF] to-[#7B9FE8] rounded-[10px] flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white"/>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl font-bold text-[#0E0D0A]">Avora Copilot</h2>
          <p className="text-xs text-[#9B9890]">Enterprise Knowledge Assistant</p>
        </div>

        {/* Dynamic Agent Badge */}
        <div className="relative group flex items-center gap-2 px-3 py-1.5 bg-[#F0FDF4] border border-[#16A34A]/20 rounded-full cursor-help">
          <div className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse"/>
          <span className="text-[12px] font-semibold text-[#16A34A]">{activeAgent}</span>
          
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-3 bg-[#0E0D0A] text-white text-xs rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
            <p className="font-semibold mb-1">Agent Reasoning</p>
            <p className="text-white/70 font-light">{agentReason}</p>
          </div>
        </div>

        <button onClick={newChat} className="flex items-center gap-1.5 px-3 py-2 bg-[#0E0D0A] text-white rounded-[9px] text-xs font-medium hover:bg-[#252318] transition-colors">
          <Plus className="w-3.5 h-3.5"/> New Chat
        </button>
        <button onClick={() => router.push('/copilot/history')} className="px-3 py-2 bg-white border border-[#DDD9D0] rounded-[9px] text-xs font-medium text-[#5A5750] hover:border-[#1A3DAF]/40 transition-all">
          History
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <div className="w-16 h-16 bg-gradient-to-br from-[#EBF0FF] to-[#F0FDF4] rounded-2xl flex items-center justify-center mb-4 border border-[#1A3DAF]/10">
              <Brain className="w-7 h-7 text-[#1A3DAF]"/>
            </div>
            <h3 className="font-display text-xl font-semibold text-[#0E0D0A] mb-2">Avora Coordinator</h3>
            <p className="text-sm text-[#9B9890] mb-7 max-w-md">I will automatically route your question to the best specialized AI Agent (Finance, Legal, Security, etc.)</p>
            <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
              {SUGGESTED['document'].map(q => (
                <button key={q} onClick={() => send(q)}
                  className="text-left p-3 bg-white border border-[#DDD9D0] rounded-[11px] text-[13px] font-medium text-[#5A5750] hover:border-[#1A3DAF]/40 hover:bg-[#EBF0FF] hover:text-[#1A3DAF] transition-all flex items-center gap-2.5">
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0 opacity-60"/> {q}
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
              <div className="flex flex-col items-center justify-center my-4 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-semibold text-[#9B9890]">{prevAgent || 'Coordinator Agent'}</span>
                  <span className="text-[#9B9890]">↓</span>
                  <span className="text-[11px] font-semibold text-[#1A3DAF] bg-[#EBF0FF] px-2 py-1 rounded-full">{m.activeAgent}</span>
                </div>
                {m.agentReason && <span className="text-[10px] text-[#9B9890] bg-[#F7F5F0] px-3 py-1 rounded-full border border-[#ECEAE4]">Reason: {m.agentReason}</span>}
              </div>
            )}
            
            <div className={cn('flex gap-3', m.role==='user' ? 'justify-end' : 'justify-start')}>
              {m.role==='assistant' && (
                <div className="w-7 h-7 bg-gradient-to-br from-[#1A3DAF] to-[#7B9FE8] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-white"/>
                </div>
              )}
              <div className={cn('max-w-[78%]', m.role==='user' ? '' : 'flex-1')}>
              <div className={cn('rounded-[14px] px-4 py-3',
                m.role==='user' ? 'bg-[#0E0D0A] text-white rounded-br-[4px]' : 'bg-white border border-[#DDD9D0] text-[#0E0D0A] rounded-bl-[4px]')}>
                {m.pending ? (
                  <div className="flex gap-1.5 items-center h-5">
                    {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-[#1A3DAF] rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}
                  </div>
                ) : (
                  <p className="text-[14px] font-light leading-[1.7] whitespace-pre-wrap">{m.content}</p>
                )}
              </div>

              {/* Confidence + sources */}
              {m.role==='assistant' && !m.pending && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {m.confidence !== undefined && (
                      <span className={cn('font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                        confColor(m.confidence)==='green' ? 'bg-green-50 text-green-700 border-green-100' :
                        confColor(m.confidence)==='amber' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        confColor(m.confidence)==='red' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-600 border-gray-100')}>
                        {confLabel(m.confidence)} · {Math.round((m.confidence||0)*100)}%
                      </span>
                    )}
                    {m.sources && m.sources.length > 0 && (
                      <span className="font-mono text-[10px] text-[#9B9890] bg-[#F7F5F0] px-2 py-0.5 rounded-full border border-[#ECEAE4]">
                        {m.sources.length} source{m.sources.length>1?'s':''}
                      </span>
                    )}
                    {m.flags && m.flags.length > 0 && (
                      <span className="font-mono text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5"/> Review flagged
                      </span>
                    )}
                  </div>

                  {/* Sources panel */}
                  {m.sources && m.sources.length > 0 && (
                    <div className="border border-[#ECEAE4] rounded-[11px] overflow-hidden bg-[#FAFAF8]">
                      <button onClick={() => setExpanded(expandedSrc===m.id ? null : m.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F7F5F0] transition-colors">
                        <FolderSearch className="w-3.5 h-3.5 text-[#1A3DAF] flex-shrink-0"/>
                        <span className="text-[11.5px] font-medium text-[#1A3DAF] flex-1">View {m.sources.length} source document{m.sources.length>1?'s':''}</span>
                        <ChevronDown className={cn('w-3.5 h-3.5 text-[#9B9890] transition-transform', expandedSrc===m.id && 'rotate-180')}/>
                      </button>
                      {expandedSrc===m.id && (
                        <div className="divide-y divide-[#ECEAE4] border-t border-[#ECEAE4]">
                          {m.sources.map((s, i) => (
                            <button key={i} onClick={() => router.push(`/documents/${s.document_id}`)}
                              className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-white transition-colors text-left">
                              <FileText className="w-3.5 h-3.5 text-[#9B9890] flex-shrink-0 mt-0.5"/>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] font-medium text-[#0E0D0A] truncate">{s.document_name}</span>
                                  <span className="font-mono text-[9.5px] text-[#9B9890] flex-shrink-0">{Math.round(s.relevance*100)}%</span>
                                </div>
                                {s.excerpt && <p className="text-[11px] text-[#9B9890] line-clamp-2 mt-0.5">"{s.excerpt}"</p>}
                              </div>
                              <ExternalLink className="w-3 h-3 text-[#9B9890] flex-shrink-0 mt-0.5"/>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          </div>
        )})}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div className="mt-4 flex items-end gap-3 p-3 bg-white border border-[#DDD9D0] rounded-[14px] focus-within:border-[#1A3DAF] focus-within:ring-2 focus-within:ring-[#1A3DAF]/8 transition-all">
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={`Ask the coordinator anything about your documents…`}
          rows={1} className="flex-1 bg-transparent border-none outline-none text-[14px] font-light text-[#0E0D0A] placeholder:text-[#9B9890] resize-none max-h-32"/>
        <button onClick={() => send()} disabled={!input.trim() || loading}
          className="w-9 h-9 bg-[#0E0D0A] rounded-[9px] flex items-center justify-center flex-shrink-0 hover:bg-[#1A3DAF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <Send className="w-4 h-4 text-white"/>
        </button>
      </div>
      <p className="text-center text-[10.5px] text-[#9B9890] mt-2">Avora Copilot only answers from your uploaded documents and always shows sources. It will never invent information.</p>
    </div>
  )
}

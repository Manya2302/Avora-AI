'use client'
import { useState, useEffect, useRef } from 'react'
import { Sparkles, Send, ArrowLeft, Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { complianceApi } from '@/lib/api'

const QUICK = ['Are we audit ready?','What documents are missing?','When do our certificates expire?','What are our highest risks?','How to improve our compliance score?','Summarise contract risks']

export default function ComplianceCopilot() {
  const router    = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [msgs, setMsgs]     = useState<any[]>([])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [ctx, setCtx]       = useState<any>(null)

  useEffect(() => {
    complianceApi.copilotHistory().then(r => setMsgs(r.data.results||[])).catch(()=>{})
  }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [msgs])

  const send = async (q?: string) => {
    const text = (q||input).trim()
    if (!text||loading) return
    setMsgs(p => [...p, {id:Date.now().toString(),role:'user',message:text,created_at:new Date().toISOString()}])
    setInput(''); setLoading(true)
    try {
      const { data } = await complianceApi.askCopilot(text)
      setCtx(data.context)
      setMsgs(p => [...p, {id:(Date.now()+1).toString(),role:'assistant',message:data.answer,created_at:new Date().toISOString()}])
    } catch {
      setMsgs(p => [...p, {id:Date.now().toString(),role:'assistant',message:'Sorry, I could not process that. Please try again.',created_at:new Date().toISOString()}])
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={()=>router.back()} className="text-[#9B9890] hover:text-[#0E0D0A]"><ArrowLeft className="w-4 h-4"/></button>
        <div className="w-9 h-9 bg-gradient-to-br from-[#1A3DAF] to-[#7B9FE8] rounded-[10px] flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white"/>
        </div>
        <div><h2 className="font-display text-xl font-bold text-[#0E0D0A]">Compliance Copilot</h2>
          <p className="text-xs text-[#9B9890]">AI-powered compliance intelligence</p></div>
        {ctx && (
          <div className="ml-auto flex items-center gap-3 px-3 py-1.5 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[9px]">
            <div className={`w-2 h-2 rounded-full ${ctx.score>=80?'bg-green-500':ctx.score>=60?'bg-amber-400':'bg-red-500'}`}/>
            <span className="font-mono text-[11px] text-[#5A5750]">Score: <strong>{ctx.score}</strong></span>
            <span className="font-mono text-[11px] text-[#5A5750]">Missing: <strong className="text-red-600">{ctx.missing}</strong></span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 bg-gradient-to-br from-[#EBF0FF] to-[#F0FDF4] rounded-2xl flex items-center justify-center mb-4 border border-[#1A3DAF]/10">
              <Sparkles className="w-7 h-7 text-[#1A3DAF]"/>
            </div>
            <h3 className="font-display text-xl font-semibold text-[#0E0D0A] mb-2">Ask Avora Compliance Copilot</h3>
            <p className="text-sm text-[#9B9890] mb-6 max-w-sm">I have full visibility into your compliance score, missing documents, expiring certificates and contract risks.</p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {QUICK.map(q => (
                <button key={q} onClick={()=>send(q)}
                  className="text-left p-3 bg-white border border-[#DDD9D0] rounded-[11px] text-xs font-medium text-[#5A5750] hover:border-[#1A3DAF]/40 hover:bg-[#EBF0FF] hover:text-[#1A3DAF] transition-all">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map(m => (
          <div key={m.id} className={`flex gap-3 ${m.role==='user'?'justify-end':'justify-start'}`}>
            {m.role==='assistant' && (
              <div className="w-7 h-7 bg-gradient-to-br from-[#1A3DAF] to-[#7B9FE8] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-white"/>
              </div>
            )}
            <div className={`max-w-[75%] rounded-[14px] px-4 py-3 ${m.role==='user'?'bg-[#0E0D0A] text-white rounded-br-[4px]':'bg-white border border-[#DDD9D0] text-[#0E0D0A] rounded-bl-[4px]'}`}>
              <p className="text-[14px] font-light leading-[1.7] whitespace-pre-wrap">{m.message}</p>
              <p className={`text-[10px] mt-1 font-mono ${m.role==='user'?'text-white/40':'text-[#9B9890]'}`}>{new Date(m.created_at).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 bg-gradient-to-br from-[#1A3DAF] to-[#7B9FE8] rounded-full flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white"/>
            </div>
            <div className="bg-white border border-[#DDD9D0] rounded-[14px] rounded-bl-[4px] px-4 py-3">
              <div className="flex gap-1.5 items-center h-5">
                {[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 bg-[#1A3DAF] rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      <div className="mt-4 flex items-center gap-3 p-3 bg-white border border-[#DDD9D0] rounded-[14px] focus-within:border-[#1A3DAF] focus-within:ring-2 focus-within:ring-[#1A3DAF]/8 transition-all">
        <Shield className="w-4 h-4 text-[#9B9890] flex-shrink-0"/>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}
          placeholder="Ask about compliance, missing docs, expiry, contract risks…"
          className="flex-1 bg-transparent border-none outline-none text-[14px] font-light text-[#0E0D0A] placeholder:text-[#9B9890]"/>
        <button onClick={()=>send()} disabled={!input.trim()||loading}
          className="w-8 h-8 bg-[#0E0D0A] rounded-[8px] flex items-center justify-center hover:bg-[#1A3DAF] disabled:opacity-40 disabled:cursor-not-allowed">
          <Send className="w-3.5 h-3.5 text-white"/>
        </button>
      </div>
    </div>
  )
}

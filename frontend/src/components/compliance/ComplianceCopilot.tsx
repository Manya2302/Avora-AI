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
      setMsgs(p => [...p, {id:Date.now().toString(),role:'assistant',message:'Sorry, I couldn’t answer that. Please try again.',created_at:new Date().toISOString()}])
    } finally { setLoading(false) }
  }

  return (
    <div className="flex h-[calc(100vh-120px)] max-w-4xl flex-col">
      {/* header */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button onClick={()=>router.back()} aria-label="Go back"
          className="-ml-1 rounded-[6px] p-1.5 text-[#8A877F] hover:bg-[#ECEAE4] hover:text-[#0E0D0A]">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75}/>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="page-title">Compliance Copilot</h1>
          <p className="mt-0.5 text-[13.5px] text-[#5A5750]">Questions about your score, missing documents, expiring certificates and contract risk.</p>
        </div>
        {ctx && (
          <div className="flex items-center gap-3 rounded-[8px] border border-[#DDD9D0] bg-white px-3 py-1.5 text-[12.5px] text-[#5A5750]">
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${ctx.score>=80?'bg-[#16A34A]':ctx.score>=60?'bg-[#D97706]':'bg-[#DC2626]'}`}/>
              Score <span className="font-medium tabular-nums text-[#0E0D0A]">{ctx.score}</span>
            </span>
            <span className="text-[#DDD9D0]">|</span>
            <span>Missing <span className="font-medium tabular-nums text-[#0E0D0A]">{ctx.missing}</span></span>
          </div>
        )}
      </div>

      {/* conversation */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {msgs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <h2 className="text-[16px] font-semibold text-[#0E0D0A]">Ask about your compliance</h2>
            <p className="mb-6 mt-1 max-w-sm text-[13.5px] text-[#8A877F]">Copilot can see your compliance score, missing documents, expiring certificates and contract risks.</p>
            <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {QUICK.map(q => (
                <button key={q} onClick={()=>send(q)}
                  className="rounded-[8px] border border-[#DDD9D0] bg-white px-3 py-2.5 text-left text-[13.5px] text-[#2B2924] transition-colors hover:border-[#BDB8AC] hover:bg-[#FBFAF7]">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map(m => (
          <div key={m.id} className={`flex gap-3 ${m.role==='user'?'justify-end':'justify-start'}`}>
            {m.role==='assistant' && (
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F1EFEA]">
                <Sparkles className="h-3.5 w-3.5 text-[#1A3DAF]" strokeWidth={1.75}/>
              </div>
            )}
            <div className={`max-w-[85%] rounded-[12px] px-4 py-3 sm:max-w-[75%] ${m.role==='user'?'rounded-br-[4px] bg-[#0E0D0A] text-[#F7F5F0]':'rounded-bl-[4px] border border-[#DDD9D0] bg-white text-[#0E0D0A]'}`}>
              <p className="whitespace-pre-wrap text-[14px] leading-[1.65]">{m.message}</p>
              <p className={`mt-1 text-[11px] ${m.role==='user'?'text-[#F7F5F0]/50':'text-[#8A877F]'}`}>{new Date(m.created_at).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F1EFEA]">
              <Sparkles className="h-3.5 w-3.5 text-[#1A3DAF]" strokeWidth={1.75}/>
            </div>
            <div className="rounded-[12px] rounded-bl-[4px] border border-[#DDD9D0] bg-white px-4 py-3" aria-label="Copilot is thinking">
              <div className="flex h-5 items-center gap-1.5">
                {[0,1,2].map(i=><div key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8A877F]" style={{animationDelay:`${i*0.15}s`}}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* composer */}
      <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-[#DDD9D0] bg-white p-2 pl-3.5 transition-colors focus-within:border-[#1A3DAF] focus-within:ring-[3px] focus-within:ring-[#1A3DAF]/10">
        <Shield className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75}/>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}
          aria-label="Ask Copilot a question"
          placeholder="Ask about missing documents, expiry dates, contract risk…"
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-[#0E0D0A] outline-none placeholder:text-[#9B9890]"/>
        <button onClick={()=>send()} disabled={!input.trim()||loading} aria-label="Send"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#0E0D0A] text-[#F7F5F0] transition-colors hover:bg-[#2B2924] disabled:cursor-not-allowed disabled:opacity-40">
          <Send className="h-3.5 w-3.5"/>
        </button>
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { Lightbulb, X, ArrowRight } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import type { AIRecommendation } from '@/types'
import toast from 'react-hot-toast'

const PV: Record<string,any> = { critical:'red', high:'amber', medium:'blue', low:'gray' }

export default function RecommendationsCenter() {
  const [recs, setRecs] = useState<AIRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const load = () => { copilotApi.recommendations().then(r => setRecs(r.data.results||[])).catch(()=>{}).finally(()=>setLoading(false)) }
  useEffect(() => { load() }, [])

  const dismiss = async (id: string) => {
    try { await copilotApi.dismissRecommendation(id); setRecs(p => p.filter(r => r.id !== id)); toast.success('Dismissed.') } catch {}
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-[11px] flex items-center justify-center"><Lightbulb className="w-5 h-5 text-amber-600"/></div>
        <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Recommendations Center</h2>
          <p className="text-sm text-[#9B9890]">Proactive AI suggestions based on your documents</p></div>
      </div>

      {loading ? <div className="h-32 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse"/>
      : recs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#DDD9D0] rounded-[16px]">
          <Lightbulb className="w-10 h-10 text-[#DDD9D0] mx-auto mb-3"/>
          <p className="text-sm text-[#9B9890]">No recommendations right now. Avora is monitoring your documents.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map(r => (
            <Card key={r.id}>
              <div className="p-4 flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <h3 className="font-semibold text-[#0E0D0A] text-sm">{r.title}</h3>
                    <Badge variant={PV[r.priority]}>{r.priority}</Badge>
                  </div>
                  <p className="text-sm text-[#5A5750] mb-2">{r.description}</p>
                  {r.action && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#1A3DAF]">
                      <ArrowRight className="w-3 h-3"/> {r.action}
                    </div>
                  )}
                </div>
                <button onClick={() => dismiss(r.id)} className="text-[#9B9890] hover:text-[#0E0D0A] flex-shrink-0"><X className="w-4 h-4"/></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { copilotApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
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
    <div className="space-y-6">
      <PageHeader
        title="Recommendations"
        description="Things Copilot noticed in your documents that are worth a look."
      />

      {loading ? (
        <Card>
          <div className="space-y-2 p-5">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-[6px] bg-[#F1EFEA]"/>)}
          </div>
        </Card>
      ) : recs.length === 0 ? (
        <Card>
          <EmptyState icon={<Lightbulb/>} title="Nothing to review right now">
            New suggestions appear here as documents are added or change.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          {recs.map(r => (
            <div key={r.id} className="group flex items-start gap-3 border-t border-[#F1EFEA] px-5 py-4 first:border-0 hover:bg-[#FBFAF7]">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-[14px] font-semibold text-[#0E0D0A]">{r.title}</h3>
                  <Badge variant={PV[r.priority]} className="capitalize">{r.priority}</Badge>
                </div>
                <p className="text-[13.5px] text-[#5A5750]">{r.description}</p>
                {r.action && (
                  <p className="mt-2 text-[13px] text-[#2B2924]">
                    <span className="text-[#8A877F]">Suggested next step: </span>{r.action}
                  </p>
                )}
              </div>
              <button onClick={() => dismiss(r.id)} aria-label={`Dismiss ${r.title}`}
                className="shrink-0 rounded-[6px] p-1.5 text-[#8A877F] hover:bg-[#ECEAE4] hover:text-[#0E0D0A]">
                <X className="h-4 w-4"/>
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'
import { Network, Sparkles, CheckCircle2, XCircle, ChevronRight, Loader2, AlertTriangle } from 'lucide-react'
import { knowledgeApi } from '@/lib/api'
import toast from 'react-hot-toast'
import Button from '@/components/shared/Button'

interface ScoreResult {
  graph_score: number
  recommended: boolean
  document_type: string
  confidence: number
  entities: Array<{ name: string; type: string }>
  relationships: Array<{ from: string; to: string; rel: string }>
  reason: string
}

interface Props {
  documentId: string
  docName: string
  onDone?: () => void
}

const TYPE_COLORS: Record<string, string> = {
  vendor:      'bg-[#EEF2FC] text-[#1A3DAF]',
  customer:    'bg-[#EDF7F0] text-[#15803D]',
  employee:    'bg-[#F5EEFB] text-[#7E22CE]',
  contract:    'bg-[#FBF3E4] text-[#A35A04]',
  invoice:     'bg-[#FCEFEF] text-[#B91C1C]',
  certificate: 'bg-[#EAF5F6] text-[#0E7490]',
  policy:      'bg-[#F1EFEA] text-[#2B2924]',
  project:     'bg-[#EEF2FC] text-[#14308A]',
  department:  'bg-[#F1EFEA] text-[#5A5750]',
}

export default function GraphRecommendationCard({ documentId, docName, onDone }: Props) {
  const [scoring, setScoring] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [done, setDone] = useState(false)

  const runScore = async () => {
    setScoring(true)
    try {
      const { data } = await knowledgeApi.score({ document_id: documentId, doc_name: docName })
      setResult(data)
    } catch (e: any) {
      if (e?.response?.status === 400 && e.response.data?.error === 'No text available to score.') {
        toast.error('The document text is still being read. Try again in a few seconds.')
      } else {
        toast.error('Couldn’t analyse the document. It’s still searchable.')
      }
    } finally {
      setScoring(false)
    }
  }

  const handleConfirm = async () => {
    if (!result) return
    setConfirming(true)
    try {
      await knowledgeApi.confirm({ document_id: documentId, doc_name: docName, score_result: result })
      toast.success('Added to the knowledge map.')
      setDone(true)
      onDone?.()
    } catch {
      toast.error('Couldn’t add it to the knowledge map.')
    } finally {
      setConfirming(false)
    }
  }

  const handleSkip = () => {
    toast.success('Skipped. The document is still searchable.')
    setDone(true)
    onDone?.()
  }

  const scoreColor = result
    ? result.graph_score >= 75 ? 'text-[#15803D]'
    : result.graph_score >= 50 ? 'text-[#A35A04]'
    : 'text-[#5A5750]'
    : ''

  const scoreBg = result
    ? result.graph_score >= 75 ? 'bg-[#EDF7F0]'
    : result.graph_score >= 50 ? 'bg-[#FBF3E4]'
    : 'bg-[#F1EFEA]'
    : ''

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-[12px] border border-[#DDD9D0] bg-white px-4 py-3 text-[13.5px] text-[#5A5750]">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" strokeWidth={1.75} />
        Done. The document is indexed and searchable.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[12px] border border-[#DDD9D0] bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#ECEAE4] px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-[#0E0D0A]">Add to the knowledge map?</h3>
          <p className="mt-0.5 text-[12.5px] text-[#8A877F]">
            Avora can link the people, companies and contracts in this document to the rest of your records.
          </p>
        </div>
        <span className="text-[12.5px] text-[#8A877F]">Search indexing happens either way</span>
      </div>

      <div className="px-5 py-4">
        {/* Pre-score state */}
        {!result && !scoring && (
          <div className="space-y-4">
            <p className="text-[14px] text-[#5A5750]">
              Avora will read <span className="font-medium text-[#0E0D0A]">{docName}</span> and suggest whether it’s worth adding.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={runScore}>Analyse document</Button>
              <Button variant="ghost" size="sm" onClick={handleSkip}>Skip</Button>
            </div>
          </div>
        )}

        {/* Scoring loading */}
        {scoring && (
          <div className="flex items-center gap-2.5 py-4 text-[13.5px] text-[#5A5750]">
            <Loader2 className="h-4 w-4 animate-spin text-[#8A877F]" />
            <span>Finding names, companies and contracts in the document…</span>
          </div>
        )}

        {/* Score result */}
        {result && (
          <div className="space-y-4">
            {/* Score meter */}
            <div className={`flex flex-col gap-3 rounded-[8px] p-4 sm:flex-row sm:items-center sm:gap-5 ${scoreBg}`}>
              <div className="shrink-0">
                <div className={`font-display text-[34px] font-semibold leading-none tabular-nums ${scoreColor}`}>
                  {result.graph_score}
                </div>
                <div className="mt-1 text-[12.5px] text-[#5A5750]">Relevance score</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {result.recommended
                    ? <CheckCircle2 className="h-4 w-4 text-[#16A34A]" strokeWidth={1.75} />
                    : <AlertTriangle className="h-4 w-4 text-[#D97706]" strokeWidth={1.75} />}
                  <span className="text-[14px] font-semibold text-[#0E0D0A]">
                    {result.document_type}
                  </span>
                  <span className="text-[12.5px] tabular-nums text-[#8A877F]">
                    {Math.round(result.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-[#2B2924]">{result.reason}</p>
              </div>
            </div>

            {/* Score bar */}
            <div>
              <div className="mb-1 flex justify-between text-[12px] text-[#8A877F]">
                <span>Low value</span><span>High value</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#F1EFEA]">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    result.graph_score >= 75 ? 'bg-[#16A34A]' :
                    result.graph_score >= 50 ? 'bg-[#D97706]' : 'bg-[#BDB8AC]'
                  }`}
                  style={{ width: `${result.graph_score}%` }}
                />
              </div>
            </div>

            {/* Detected entities */}
            {result.entities.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] text-[#5A5750]">
                  Found in this document <span className="tabular-nums text-[#8A877F]">· {result.entities.length}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.entities.map((e, i) => (
                    <span key={i}
                      className={`inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[12px] font-medium ${TYPE_COLORS[e.type] || 'bg-[#F1EFEA] text-[#5A5750]'}`}>
                      {e.name}
                      <span className="font-normal capitalize opacity-70">· {e.type}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.entities.length === 0 && !result.recommended && (
              <p className="text-[13px] text-[#8A877F]">
                No companies, people or contracts found. The document is still searchable.
              </p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 border-t border-[#ECEAE4] pt-4">
              {result.recommended ? (
                <>
                  <Button size="sm" onClick={handleConfirm} disabled={confirming}>
                    {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    Add to knowledge map
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSkip}>Skip</Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={handleSkip}>Continue without adding</Button>
                  <Button variant="plain" size="sm" onClick={handleConfirm} disabled={confirming}>
                    {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" strokeWidth={1.75} />}
                    Add anyway
                  </Button>
                </>
              )}
              <span className="text-[12.5px] text-[#8A877F] sm:ml-auto">Already searchable</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

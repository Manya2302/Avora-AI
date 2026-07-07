'use client'
import { useState } from 'react'
import { Network, Sparkles, CheckCircle2, XCircle, ChevronRight, Loader2, AlertTriangle } from 'lucide-react'
import { knowledgeApi } from '@/lib/api'
import toast from 'react-hot-toast'

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
  vendor:      'bg-blue-50 text-blue-700 border-blue-100',
  customer:    'bg-green-50 text-green-700 border-green-100',
  employee:    'bg-purple-50 text-purple-700 border-purple-100',
  contract:    'bg-amber-50 text-amber-700 border-amber-100',
  invoice:     'bg-orange-50 text-orange-700 border-orange-100',
  certificate: 'bg-teal-50 text-teal-700 border-teal-100',
  policy:      'bg-rose-50 text-rose-700 border-rose-100',
  project:     'bg-indigo-50 text-indigo-700 border-indigo-100',
  department:  'bg-gray-50 text-gray-700 border-gray-200',
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
        toast.error('Document is still processing (OCR). Please wait a few seconds and try again.')
      } else {
        toast.error('Graph scoring failed. The document is still indexed for search.')
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
      toast.success('Document added to Knowledge Graph!')
      setDone(true)
      onDone?.()
    } catch {
      toast.error('Failed to add to graph.')
    } finally {
      setConfirming(false)
    }
  }

  const handleSkip = () => {
    toast.success('Document skipped from Knowledge Graph. Still searchable via RAG.')
    setDone(true)
    onDone?.()
  }

  const scoreColor = result
    ? result.graph_score >= 75 ? 'text-green-600'
    : result.graph_score >= 50 ? 'text-amber-600'
    : 'text-[#9B9890]'
    : ''

  const scoreBg = result
    ? result.graph_score >= 75 ? 'bg-green-50 border-green-200'
    : result.graph_score >= 50 ? 'bg-amber-50 border-amber-200'
    : 'bg-[#F7F5F0] border-[#ECEAE4]'
    : ''

  if (done) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[12px] text-sm text-[#5A5750]">
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        Graph processing complete. Document is indexed and searchable.
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#DDD9D0] rounded-[16px] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-[#ECEAE4] bg-gradient-to-r from-[#EBF0FF]/40 to-transparent">
        <div className="w-8 h-8 bg-[#EBF0FF] rounded-[9px] flex items-center justify-center flex-shrink-0">
          <Network className="w-4 h-4 text-[#1A3DAF]" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-[#0E0D0A]">Knowledge Graph AI</h3>
          <p className="text-[12px] text-[#9B9890]">
            Should this document enrich your organizational knowledge graph?
          </p>
        </div>
        <div className="font-mono text-[10px] text-[#9B9890] bg-white border border-[#ECEAE4] px-2 py-0.5 rounded-full">
          RAG indexing is always automatic
        </div>
      </div>

      <div className="px-5 py-4">
        {/* Pre-score state */}
        {!result && !scoring && (
          <div className="text-center py-4">
            <p className="text-sm text-[#5A5750] mb-4">
              Let AI analyse <strong className="text-[#0E0D0A]">{docName}</strong> and decide if it belongs in the Knowledge Graph.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={runScore}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0E0D0A] text-white rounded-[10px] text-sm font-medium hover:bg-[#252318] transition-colors">
                <Sparkles className="w-4 h-4" /> Analyse with AI
              </button>
              <button onClick={handleSkip}
                className="px-5 py-2.5 border border-[#DDD9D0] text-[#5A5750] rounded-[10px] text-sm font-medium hover:border-[#9B9890] transition-colors">
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Scoring loading */}
        {scoring && (
          <div className="flex items-center gap-3 py-6 justify-center text-[#5A5750]">
            <Loader2 className="w-5 h-5 animate-spin text-[#1A3DAF]" />
            <span className="text-sm">AI is extracting entities and computing graph score…</span>
          </div>
        )}

        {/* Score result */}
        {result && (
          <div className="space-y-4">
            {/* Score meter */}
            <div className={`flex items-center gap-4 p-4 border rounded-[12px] ${scoreBg}`}>
              <div className="text-center flex-shrink-0">
                <div className={`font-display text-4xl font-black ${scoreColor}`}>
                  {result.graph_score}
                </div>
                <div className="font-mono text-[10px] text-[#9B9890] uppercase tracking-wide">Graph Score</div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {result.recommended
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  <span className="font-semibold text-sm text-[#0E0D0A]">
                    {result.document_type}
                  </span>
                  <span className="font-mono text-[10px] text-[#9B9890]">
                    {Math.round(result.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="text-[12.5px] text-[#5A5750] leading-relaxed">{result.reason}</p>
              </div>
            </div>

            {/* Score bar */}
            <div>
              <div className="flex justify-between text-[10px] font-mono text-[#9B9890] mb-1">
                <span>Low value</span><span>High value</span>
              </div>
              <div className="h-2 bg-[#ECEAE4] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    result.graph_score >= 75 ? 'bg-green-500' :
                    result.graph_score >= 50 ? 'bg-amber-500' : 'bg-[#DDD9D0]'
                  }`}
                  style={{ width: `${result.graph_score}%` }}
                />
              </div>
            </div>

            {/* Detected entities */}
            {result.entities.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[#0E0D0A] uppercase tracking-wide mb-2">
                  Detected Entities ({result.entities.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.entities.map((e, i) => (
                    <span key={i}
                      className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border ${TYPE_COLORS[e.type] || 'bg-[#F7F5F0] text-[#5A5750] border-[#ECEAE4]'}`}>
                      ✓ {e.name}
                      <span className="opacity-60 font-normal capitalize">· {e.type}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.entities.length === 0 && !result.recommended && (
              <div className="text-center py-2 text-sm text-[#9B9890]">
                No business entities detected. This document will still be searchable through RAG.
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2 border-t border-[#ECEAE4]">
              {result.recommended ? (
                <>
                  <button onClick={handleConfirm} disabled={confirming}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#0E0D0A] text-white rounded-[10px] text-sm font-medium hover:bg-[#252318] transition-colors disabled:opacity-50">
                    {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
                    Add to Knowledge Graph
                  </button>
                  <button onClick={handleSkip}
                    className="px-5 py-2.5 border border-[#DDD9D0] text-[#5A5750] rounded-[10px] text-sm font-medium hover:border-[#9B9890] transition-colors">
                    Skip
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleSkip}
                    className="px-5 py-2.5 bg-[#F7F5F0] border border-[#ECEAE4] text-[#0E0D0A] rounded-[10px] text-sm font-medium hover:bg-[#ECEAE4] transition-colors">
                    Continue without adding
                  </button>
                  <button onClick={handleConfirm} disabled={confirming}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-[#DDD9D0] text-[#5A5750] rounded-[10px] text-sm hover:border-[#1A3DAF] hover:text-[#1A3DAF] transition-colors disabled:opacity-50">
                    {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Network className="w-3.5 h-3.5" />}
                    Add anyway
                  </button>
                </>
              )}
              <span className="ml-auto font-mono text-[10px] text-[#9B9890]">
                RAG indexing is already done ✓
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

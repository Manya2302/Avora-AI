'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sparkles, Clock, TrendingUp, Filter, X, ChevronDown } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import type { SearchResultItem } from '@/types'

const CATEGORY_OPTIONS = ['invoice','contract','tax_filing','medical_record','bank_statement','legal_agreement','audit_report','certificate','purchase_order','employee_record']
const CONF_OPTIONS = ['public','internal','confidential','restricted']
const CONF_VARIANT: Record<string, any> = { public:'green', internal:'blue', confidential:'amber', restricted:'red' }

export default function SearchPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<SearchResultItem[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [popular, setPopular]       = useState<Array<{query:string;count:number}>>([])
  const [history, setHistory]       = useState<Array<{query:string;created_at:string}>>([])
  const [loading, setLoading]       = useState(false)
  const [searched, setSearched]     = useState(false)
  const [elapsed, setElapsed]       = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters]       = useState<Record<string,string>>({})
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiConfidence, setAiConfidence] = useState(0)
  const [aiSources, setAiSources] = useState<any[]>([])
  const [expandedBreakdown, setExpandedBreakdown] = useState<string|null>(null)

  useEffect(() => {
    aiApi.popularSearches().then(r => setPopular(r.data.popular || [])).catch(() => {})
    aiApi.searchHistory().then(r => setHistory(r.data.results?.slice(0,8) || [])).catch(() => {})
    inputRef.current?.focus()
  }, [])

  const fetchSuggestions = async (val: string) => {
    if (val.length < 2) { setSuggestions([]); return }
    try {
      const { data } = await aiApi.suggestions(val)
      setSuggestions(data.suggestions || [])
      setShowSuggestions(true)
    } catch {}
  }

  const handleInput = (val: string) => {
    setQuery(val)
    fetchSuggestions(val)
  }

  const runSearch = async (q?: string) => {
    const text = (q ?? query).trim()
    if (!text) return
    setQuery(text); setLoading(true); setSearched(true); setShowSuggestions(false)
    setAiAnswer(''); setAiConfidence(0); setAiSources([]); setExpandedBreakdown(null)
    try {
      const { data } = await aiApi.search({ query: text, top_k: 12, filters })
      setResults(data.results || [])
      setElapsed(data.elapsed_ms || 0)
      setAiAnswer(data.ai_answer || '')
      setAiConfidence(data.ai_confidence || 0)
      setAiSources(data.ai_sources || [])
    } catch { setResults([]) }
    finally { setLoading(false) }
  }

  const clearFilter = (key: string) => setFilters(p => { const n = {...p}; delete n[key]; return n })
  const activeFilterCount = Object.keys(filters).length

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[#1A3DAF]" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">Avora AI Search</h2>
          <p className="text-sm font-light text-[#9B9890]">Find documents by meaning — not keywords or filenames</p>
        </div>
      </div>

      {/* Search box */}
      <div className="bg-white border border-[#DDD9D0] rounded-[16px] p-5">
        <div className="relative">
          <div className={`flex items-center gap-3 px-4 py-3.5 border rounded-[11px] transition-all ${showSuggestions ? 'border-[#1A3DAF] bg-white ring-2 ring-[#1A3DAF]/8' : 'border-[#DDD9D0] bg-[#F7F5F0] focus-within:border-[#1A3DAF] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1A3DAF]/8'}`}>
            <Search className="w-5 h-5 text-[#1A3DAF] flex-shrink-0" />
            <input ref={inputRef} value={query}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runSearch(); if (e.key === 'Escape') setShowSuggestions(false) }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Find invoices from last March, show vendor contracts, GST filings Q1…"
              className="flex-1 bg-transparent border-none outline-none text-[15px] font-light text-[#0E0D0A] placeholder:text-[#9B9890]" />
            {query && <button onClick={() => { setQuery(''); setResults([]); setSearched(false) }} className="text-[#9B9890] hover:text-[#0E0D0A] flex-shrink-0"><X className="w-4 h-4" /></button>}
            <button onClick={() => runSearch()} className="px-4 py-2 bg-[#0E0D0A] text-white rounded-[8px] font-mono text-[11px] font-medium hover:bg-[#252318] transition-colors flex-shrink-0">Search</button>
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-[#DDD9D0] rounded-[11px] shadow-lg overflow-hidden">
              {suggestions.map(s => (
                <button key={s} onClick={() => { setQuery(s); setShowSuggestions(false); runSearch(s) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F7F5F0] transition-colors text-left">
                  <Search className="w-3.5 h-3.5 text-[#9B9890] flex-shrink-0" />
                  <span className="text-[13.5px] text-[#0E0D0A]">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick suggestions */}
        {!searched && (
          <div className="mt-4 flex flex-wrap gap-2">
            {['Find invoices from last quarter','Show vendor contracts','GST returns Q1 2026','Contracts expiring soon','Medical records January','Audit compliance reports'].map(s => (
              <button key={s} onClick={() => runSearch(s)}
                className="text-[12px] font-light text-[#5A5750] px-3 py-1.5 bg-[#F7F5F0] border border-[#ECEAE4] rounded-full hover:border-[#1A3DAF] hover:text-[#1A3DAF] hover:bg-[#EBF0FF] transition-all whitespace-nowrap">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${showFilters ? 'border-[#1A3DAF] text-[#1A3DAF] bg-[#EBF0FF]' : 'border-[#DDD9D0] text-[#5A5750] hover:border-[#1A3DAF]'}`}>
            <Filter className="w-3 h-3" /> Filters {activeFilterCount > 0 && <span className="bg-[#1A3DAF] text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]">{activeFilterCount}</span>}
          </button>
          {Object.entries(filters).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 px-2.5 py-1 bg-[#EBF0FF] text-[#1A3DAF] border border-[#1A3DAF]/15 rounded-full text-xs font-medium">
              {v} <button onClick={() => clearFilter(k)}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>

        {showFilters && (
          <div className="mt-3 pt-3 border-t border-[#ECEAE4] grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#0E0D0A] block mb-1.5">Category</label>
              <select value={filters.category || ''} onChange={e => e.target.value ? setFilters(p => ({...p, category: e.target.value})) : clearFilter('category')}
                className="w-full px-2.5 py-2 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-xs outline-none">
                <option value="">Any</option>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#0E0D0A] block mb-1.5">Confidentiality</label>
              <select value={filters.confidentiality || ''} onChange={e => e.target.value ? setFilters(p => ({...p, confidentiality: e.target.value})) : clearFilter('confidentiality')}
                className="w-full px-2.5 py-2 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] text-xs outline-none">
                <option value="">Any</option>
                {CONF_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* History + Popular (when not searched) */}
      {!searched && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {history.length > 0 && (
            <Card>
              <div className="px-4 py-3 border-b border-[#ECEAE4] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#9B9890]" /><span className="text-sm font-semibold text-[#0E0D0A]">Recent Searches</span>
              </div>
              <div className="divide-y divide-[#ECEAE4]">
                {history.map((h, i) => (
                  <button key={i} onClick={() => runSearch(h.query)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F7F5F0] text-left transition-colors">
                    <Clock className="w-3 h-3 text-[#9B9890] flex-shrink-0" />
                    <span className="text-[13px] text-[#0E0D0A] flex-1">{h.query}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {popular.length > 0 && (
            <Card>
              <div className="px-4 py-3 border-b border-[#ECEAE4] flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#9B9890]" /><span className="text-sm font-semibold text-[#0E0D0A]">Popular Searches</span>
              </div>
              <div className="divide-y divide-[#ECEAE4]">
                {popular.map((p, i) => (
                  <button key={i} onClick={() => runSearch(p.query)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F7F5F0] text-left transition-colors">
                    <TrendingUp className="w-3 h-3 text-[#9B9890] flex-shrink-0" />
                    <span className="text-[13px] text-[#0E0D0A] flex-1">{p.query}</span>
                    <span className="font-mono text-[10px] text-[#9B9890]">{p.count}×</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* AI Overview Answer Card */}
      {searched && !loading && aiAnswer && (
        <div className="bg-[#EBF0FF]/45 border border-[#1A3DAF]/15 rounded-[16px] p-5 shadow-sm relative overflow-hidden backdrop-blur-md select-text">
          <div className="absolute top-0 right-0 p-4">
            <Sparkles className="w-5 h-5 text-[#1A3DAF]/20 animate-pulse" />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-[#EBF0FF] rounded-full flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-[#1A3DAF]" />
            </div>
            <h3 className="text-xs font-mono font-semibold uppercase tracking-[0.5px] text-[#1A3DAF]">AI Overview</h3>
            {aiConfidence > 0 && (
              <span className="text-[10px] font-mono text-[#9B9890] ml-auto bg-white/70 px-2 py-0.5 rounded-full border border-[#ECEAE4]">
                Confidence: <strong className="text-[#0E0D0A]">{Math.round(aiConfidence * 100)}%</strong>
              </span>
            )}
          </div>
          <div className="text-[14.5px] text-[#252318] leading-relaxed font-light font-sans">
            {aiAnswer}
          </div>
        </div>
      )}

      {/* Results */}
      {searched && (
        <div className="bg-white border border-[#DDD9D0] rounded-[16px] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#ECEAE4] flex items-center justify-between">
            <span className="text-xs font-mono text-[#9B9890]">
              Avora found <strong className="text-[#0E0D0A]">{results.length} results</strong>
            </span>
            <span className="font-mono text-[10px] text-[#1A3DAF] bg-[#EBF0FF] px-2.5 py-1 rounded-full border border-[#1A3DAF]/15">
              ⚡ Hybrid Retrieval · {elapsed}ms
            </span>
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <div className="w-8 h-8 border-2 border-[#EBF0FF] border-t-[#1A3DAF] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#9B9890]">Avora is searching your vault…</p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-16 text-center">
              <Sparkles className="w-10 h-10 text-[#DDD9D0] mx-auto mb-3" />
              <p className="font-medium text-[#5A5750]">No documents matched</p>
              <p className="text-xs text-[#9B9890] mt-1">Try a broader query or check if documents have been processed by Avora AI.</p>
            </div>
          ) : (
            results.map((r, i) => (
              <div key={r.document_id} onClick={() => router.push(`/documents/${r.document_id}`)}
                className="flex items-start gap-3.5 px-5 py-4 border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0] cursor-pointer group">
                <div className={`w-0.5 self-stretch rounded-full flex-shrink-0 mt-1 ${r.score >= 90 ? 'bg-green-500' : r.score >= 70 ? 'bg-amber-400' : 'bg-red-400'}`} />
                <div className="w-7 h-7 font-mono text-[10px] font-bold rounded-[6px] flex items-center justify-center flex-shrink-0 mt-0.5 bg-[#F7F5F0] text-[#9B9890]">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[14px] font-semibold text-[#0E0D0A] group-hover:text-[#1A3DAF] transition-colors">{r.original_name}</span>
                    {r.category && <Badge variant="blue">{r.category.replace(/_/g,' ')}</Badge>}
                    {r.confidentiality && r.confidentiality !== 'internal' && <Badge variant={CONF_VARIANT[r.confidentiality]}>{r.confidentiality}</Badge>}
                  </div>
                  {r.short_summary && <p className="text-[12.5px] font-light text-[#5A5750] line-clamp-2 mb-2">{r.short_summary}</p>}
                  <div className="flex items-center gap-3 flex-wrap">
                    {r.tags?.slice(0,4).map((t:string) => <span key={t} className="font-mono text-[10px] text-[#9B9890]">{t}</span>)}
                    <span className={`font-mono text-[10px] font-semibold ml-auto px-2 py-0.5 rounded-full border flex-shrink-0 ${r.score >= 90 ? 'bg-green-50 text-green-700 border-green-100' : r.score >= 70 ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-[#F7F5F0] text-[#9B9890] border-[#DDD9D0]'}`}>
                      {r.score}% match
                    </span>
                    <button onClick={e => { e.stopPropagation(); setExpandedBreakdown(expandedBreakdown === r.document_id ? null : r.document_id) }}
                      className="font-mono text-[10px] text-[#9B9890] hover:text-[#1A3DAF] transition-colors">
                      {expandedBreakdown === r.document_id ? '▲ hide' : '▼ why?'}
                    </button>
                  </div>
                  {expandedBreakdown === r.document_id && (r as any).score_breakdown && (
                    <div className="mt-2 grid grid-cols-5 gap-1.5 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[8px] p-2.5">
                      {Object.entries((r as any).score_breakdown).map(([k, v]: any) => (
                        <div key={k} className="text-center">
                          <div className="font-mono text-[11px] font-bold text-[#0E0D0A]">{v}%</div>
                          <div className="font-mono text-[9px] text-[#9B9890] capitalize">{k}</div>
                          <div className="h-1 bg-[#ECEAE4] rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-[#1A3DAF] rounded-full" style={{width: `${Math.min(v,100)}%`}}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {results.length > 0 && (
            <div className="px-5 py-3 bg-[#EBF0FF] border-t border-[#1A3DAF]/10 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#1A3DAF]" />
              <span className="font-mono text-[11px] text-[#1A3DAF]">Hybrid Retrieval — Vector · BM25 · Metadata · Knowledge Graph · Recency · Reranking</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

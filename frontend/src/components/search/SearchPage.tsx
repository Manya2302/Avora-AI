'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sparkles, Clock, TrendingUp, Filter, X, ChevronDown } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { Card, CardHeader } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
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
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description="Describe what you’re looking for in plain words. Results match on meaning, not just file names."
      />

      {/* Search box */}
      <Card className="overflow-visible">
        <div className="p-4 sm:p-5">
          <div className="relative">
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search documents</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A877F]" strokeWidth={1.75} />
                <input ref={inputRef} value={query}
                  onChange={e => handleInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runSearch(); if (e.key === 'Escape') setShowSuggestions(false) }}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Invoices from last March, vendor contracts, GST filings Q1…"
                  className="field h-10 pl-9 pr-9 text-[15px]" />
                {query && (
                  <button onClick={() => { setQuery(''); setResults([]); setSearched(false) }} aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] p-1 text-[#8A877F] hover:bg-[#F1EFEA] hover:text-[#0E0D0A]">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              <Button onClick={() => runSearch()} className="h-10">Search</Button>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[8px] border border-[#DDD9D0] bg-white py-1 shadow-lg">
                {suggestions.map(s => (
                  <button key={s} onClick={() => { setQuery(s); setShowSuggestions(false); runSearch(s) }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[#FBFAF7]">
                    <Search className="h-3.5 w-3.5 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                    <span className="truncate text-[14px] text-[#0E0D0A]">{s}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick suggestions */}
          {!searched && (
            <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-1.5">
              <span className="mr-1 text-[12.5px] text-[#8A877F]">Try</span>
              {['Find invoices from last quarter','Show vendor contracts','GST returns Q1 2026','Contracts expiring soon','Medical records January','Audit compliance reports'].map(s => (
                <button key={s} onClick={() => runSearch(s)}
                  className="whitespace-nowrap rounded-[6px] border border-[#ECEAE4] bg-[#FBFAF7] px-2.5 py-1 text-[13px] text-[#5A5750] transition-colors hover:border-[#BDB8AC] hover:text-[#0E0D0A]">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] transition-colors',
                showFilters ? 'border-[#BDB8AC] bg-[#F1EFEA] text-[#0E0D0A]' : 'border-[#DDD9D0] bg-white text-[#5A5750] hover:border-[#BDB8AC] hover:text-[#0E0D0A]'
              )}>
              <Filter className="h-3.5 w-3.5" strokeWidth={1.75} /> Filters
              {activeFilterCount > 0 && <span className="text-[12.5px] tabular-nums text-[#1A3DAF]">{activeFilterCount}</span>}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showFilters && 'rotate-180')} strokeWidth={1.75} />
            </button>
            {Object.entries(filters).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-[6px] bg-[#EEF2FC] py-1 pl-2.5 pr-1 text-[13px] text-[#1A3DAF]">
                {v.replace(/_/g,' ')}
                <button onClick={() => clearFilter(k)} aria-label={`Remove ${v} filter`} className="rounded-[4px] p-0.5 hover:bg-[#1A3DAF]/10">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          {showFilters && (
            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[#ECEAE4] pt-3 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">Category</label>
                <select value={filters.category || ''} onChange={e => e.target.value ? setFilters(p => ({...p, category: e.target.value})) : clearFilter('category')}
                  className="field h-9 py-0">
                  <option value="">Any</option>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">Confidentiality</label>
                <select value={filters.confidentiality || ''} onChange={e => e.target.value ? setFilters(p => ({...p, confidentiality: e.target.value})) : clearFilter('confidentiality')}
                  className="field h-9 py-0">
                  <option value="">Any</option>
                  {CONF_OPTIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* History + Popular (when not searched) */}
      {!searched && (history.length > 0 || popular.length > 0) && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {history.length > 0 && (
            <Card>
              <CardHeader title="Recent searches" />
              <ul>
                {history.map((h, i) => (
                  <li key={i} className="border-t border-[#F1EFEA] first:border-0">
                    <button onClick={() => runSearch(h.query)}
                      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#FBFAF7]">
                      <Clock className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-[#0E0D0A]">{h.query}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {popular.length > 0 && (
            <Card>
              <CardHeader title="Popular searches" />
              <ul>
                {popular.map((p, i) => (
                  <li key={i} className="border-t border-[#F1EFEA] first:border-0">
                    <button onClick={() => runSearch(p.query)}
                      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#FBFAF7]">
                      <TrendingUp className="h-4 w-4 shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-[#0E0D0A]">{p.query}</span>
                      <span className="shrink-0 text-[12.5px] tabular-nums text-[#8A877F]">{p.count}×</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* Answer */}
      {searched && !loading && aiAnswer && (
        <div className="select-text rounded-[12px] bg-[#0E0D0A] p-5 text-[#F7F5F0]">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#9FB4EE]" strokeWidth={1.75} />
            <h3 className="text-[14px] font-semibold">Answer from your documents</h3>
            {aiConfidence > 0 && (
              <span className="ml-auto text-[12.5px] text-[#F7F5F0]/65">
                Confidence <span className="tabular-nums text-[#F7F5F0]">{Math.round(aiConfidence * 100)}%</span>
              </span>
            )}
          </div>
          <div className="text-[14px] leading-relaxed text-[#F7F5F0]/90">
            {aiAnswer}
          </div>
        </div>
      )}

      {/* Results */}
      {searched && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECEAE4] px-5 py-3.5">
            <span className="text-[14px] font-semibold text-[#0E0D0A]">
              {loading ? 'Searching…' : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
            </span>
            {!loading && (
              <span className="text-[12.5px] tabular-nums text-[#8A877F]">{elapsed} ms</span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-[6px] bg-[#F1EFEA]" />)}</div>
          ) : results.length === 0 ? (
            <EmptyState icon={<Search />} title="No documents matched">
              Try fewer or broader words. New uploads can take a minute before they show up here.
            </EmptyState>
          ) : (
            results.map((r, i) => (
              <div key={r.document_id} onClick={() => router.push(`/documents/${r.document_id}`)}
                className="group flex cursor-pointer items-start gap-3 border-t border-[#F1EFEA] px-5 py-3.5 first:border-0 hover:bg-[#FBFAF7]">
                <span className="mt-0.5 w-5 shrink-0 text-right text-[12.5px] tabular-nums text-[#8A877F]">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words text-[14px] font-medium text-[#0E0D0A] group-hover:text-[#1A3DAF]">{r.original_name}</span>
                    {r.category && <Badge>{r.category.replace(/_/g,' ')}</Badge>}
                    {r.confidentiality && r.confidentiality !== 'internal' && <Badge variant={CONF_VARIANT[r.confidentiality]}>{r.confidentiality}</Badge>}
                  </div>
                  {r.short_summary && <p className="mb-2 line-clamp-2 text-[13px] text-[#5A5750]">{r.short_summary}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                    {r.tags?.slice(0,4).map((t:string) => <span key={t} className="text-[#8A877F]">#{t}</span>)}
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[#5A5750]">
                      <span className={cn('h-1.5 w-1.5 rounded-full', r.score >= 90 ? 'bg-[#16A34A]' : r.score >= 70 ? 'bg-[#D97706]' : 'bg-[#8A877F]')} />
                      <span className="tabular-nums">{r.score}% match</span>
                    </span>
                    <button onClick={e => { e.stopPropagation(); setExpandedBreakdown(expandedBreakdown === r.document_id ? null : r.document_id) }}
                      aria-expanded={expandedBreakdown === r.document_id}
                      className="inline-flex items-center gap-0.5 text-[#8A877F] transition-colors hover:text-[#1A3DAF]">
                      {expandedBreakdown === r.document_id ? 'Hide' : 'Why?'}
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expandedBreakdown === r.document_id && 'rotate-180')} strokeWidth={1.75} />
                    </button>
                  </div>
                  {expandedBreakdown === r.document_id && (r as any).score_breakdown && (
                    <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7] p-3 sm:grid-cols-5">
                      {Object.entries((r as any).score_breakdown).map(([k, v]: any) => (
                        <div key={k}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[12px] capitalize text-[#8A877F]">{k}</span>
                            <span className="text-[12.5px] font-medium tabular-nums text-[#0E0D0A]">{v}%</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#ECEAE4]">
                            <div className="h-full rounded-full bg-[#1A3DAF]" style={{width: `${Math.min(v,100)}%`}}/>
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
            <div className="border-t border-[#ECEAE4] px-5 py-3 text-[12.5px] text-[#8A877F]">
              Ranked by meaning, keywords, document details, linked documents and recency.
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

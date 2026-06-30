'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Folder, Sparkles, RefreshCw } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import toast from 'react-hot-toast'
import type { SmartCollection } from '@/types'

const COLOR_MAP: Record<string, string> = {
  green:'bg-green-50 text-green-700 border-green-100', blue:'bg-blue-50 text-blue-700 border-blue-100',
  amber:'bg-amber-50 text-amber-700 border-amber-100', purple:'bg-purple-50 text-purple-700 border-purple-100',
  red:'bg-red-50 text-red-700 border-red-100', slate:'bg-slate-50 text-slate-700 border-slate-100',
  teal:'bg-teal-50 text-teal-700 border-teal-100', orange:'bg-orange-50 text-orange-700 border-orange-100',
  indigo:'bg-indigo-50 text-indigo-700 border-indigo-100', cyan:'bg-cyan-50 text-cyan-700 border-cyan-100',
  pink:'bg-pink-50 text-pink-700 border-pink-100', gold:'bg-yellow-50 text-yellow-700 border-yellow-100',
}

export default function SmartCollectionsPage() {
  const router = useRouter()
  const [collections, setCollections] = useState<SmartCollection[]>([])
  const [loading, setLoading]         = useState(true)
  const [seeding, setSeeding]         = useState(false)

  const load = () => {
    aiApi.collections().then(r => setCollections(r.data.results || r.data || [])).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const seed = async () => {
    setSeeding(true)
    try {
      await aiApi.seedCollections()
      toast.success('Smart collections created by Avora AI!')
      load()
    } catch { toast.error('Failed to seed collections.') }
    finally { setSeeding(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><Folder className="w-5 h-5 text-[#1A3DAF]" /></div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">Smart Collections</h2>
            <p className="text-sm font-light text-[#9B9890]">Auto-organised by Avora AI — you never create folders</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
          <Button size="sm" onClick={seed} loading={seeding}><Sparkles className="w-3.5 h-3.5" /> Build Collections</Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({length: 8}).map((_,i) => <div key={i} className="h-32 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse" />)}
        </div>
      ) : collections.length === 0 ? (
        <div className="text-center py-20 bg-white border border-[#DDD9D0] rounded-[16px]">
          <Folder className="w-12 h-12 text-[#DDD9D0] mx-auto mb-4" />
          <p className="font-display text-lg font-semibold text-[#0E0D0A] mb-2">No collections yet</p>
          <p className="text-sm font-light text-[#9B9890] mb-5">Let Avora AI automatically organise your documents into smart collections.</p>
          <Button onClick={seed} loading={seeding}><Sparkles className="w-4 h-4" /> Build Smart Collections</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {collections.map(col => {
            const colorCls = COLOR_MAP[col.color] || 'bg-blue-50 text-blue-700 border-blue-100'
            return (
              <button key={col.id} onClick={() => router.push(`/collections/${col.id}`)}
                className="group text-left bg-white border border-[#DDD9D0] rounded-[14px] p-5 hover:border-[#1A3DAF]/30 hover:shadow-md transition-all hover:-translate-y-0.5">
                <div className={`w-11 h-11 rounded-[10px] border flex items-center justify-center text-xl mb-4 transition-transform group-hover:scale-110 ${colorCls}`}>
                  {col.icon}
                </div>
                <div className="font-semibold text-[14px] text-[#0E0D0A] mb-1 group-hover:text-[#1A3DAF] transition-colors">{col.name}</div>
                <div className="font-mono text-[11px] text-[#9B9890]">
                  {col.document_count} document{col.document_count !== 1 ? 's' : ''}
                </div>
                {col.collection_type === 'ai_generated' && (
                  <div className="mt-3 flex items-center gap-1 font-mono text-[9.5px] text-[#1A3DAF]">
                    <Sparkles className="w-3 h-3" /> AI Generated
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {collections.length > 0 && (
        <div className="flex items-center gap-2.5 p-4 bg-[#EBF0FF] border border-[#1A3DAF]/12 rounded-[11px]">
          <Sparkles className="w-4 h-4 text-[#1A3DAF] flex-shrink-0" />
          <p className="text-[12.5px] font-light text-[#1A3DAF]">
            Avora AI automatically updates these collections as you upload new documents. New categories are detected and collections are created dynamically.
          </p>
        </div>
      )}
    </div>
  )
}

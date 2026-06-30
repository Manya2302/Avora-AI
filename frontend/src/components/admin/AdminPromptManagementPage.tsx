'use client'
import { useEffect, useState } from 'react'
import { BookOpen, TrendingUp } from 'lucide-react'
import { adminGovernanceApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'

const CAT_COLOR: Record<string,any> = { audit:'purple', contract:'blue', vendor:'amber', policy:'green', risk:'red', compliance:'blue', financial:'green', hr:'amber', custom:'gray' }

export default function AdminPromptManagementPage() {
  const [prompts, setPrompts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { adminGovernanceApi.prompts().then(r => setPrompts(r.data.results||r.data||[])).catch(()=>{}).finally(()=>setLoading(false)) }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#3B5BDB]/15 border border-[#3B5BDB]/25 rounded-[11px] flex items-center justify-center"><BookOpen className="w-5 h-5 text-[#7B9FE8]"/></div>
        <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Prompt Management</h2>
          <p className="text-sm text-[#9B9890]">All enterprise prompt templates across the platform — Phase 4</p></div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#DDD9D0] bg-[#F7F5F0]">
                {['Title','Category','Type','Uses',''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-mono text-[10px] font-semibold text-[#9B9890] uppercase tracking-[0.6px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="p-10 text-center text-sm text-[#9B9890]">Loading…</td></tr>
              : prompts.length === 0 ? <tr><td colSpan={5} className="p-10 text-center text-sm text-[#9B9890]">No prompt templates yet.</td></tr>
              : prompts.map((p: any) => (
                <tr key={p.id} className="border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0]">
                  <td className="px-4 py-3 text-[13px] font-medium text-[#0E0D0A]">{p.title}</td>
                  <td className="px-4 py-3"><Badge variant={CAT_COLOR[p.category]||'gray'}>{p.category}</Badge></td>
                  <td className="px-4 py-3 text-xs text-[#5A5750]">{p.is_builtin ? 'Built-in' : 'Custom'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#0E0D0A] flex items-center gap-1"><TrendingUp className="w-3 h-3 text-[#9B9890]"/>{p.use_count}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

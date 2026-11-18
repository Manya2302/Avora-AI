'use client'
import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { adminGovernanceApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'

const CAT_COLOR: Record<string,any> = { audit:'purple', contract:'blue', vendor:'amber', policy:'green', risk:'red', compliance:'blue', financial:'green', hr:'amber', custom:'gray' }

export default function AdminPromptManagementPage() {
  const [prompts, setPrompts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { adminGovernanceApi.prompts().then(r => setPrompts(r.data.results||r.data||[])).catch(()=>{}).finally(()=>setLoading(false)) }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="Prompts" description="Every prompt template in the workspace, built-in and custom, with how often each is used." />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[14px]">
            <thead>
              <tr className="text-[12.5px] text-[#8A877F]">
                {['Title','Category','Type','Uses',''].map((h, i) => (
                  <th key={h} className={`${i === 0 ? 'px-5' : 'px-3'} py-2.5 font-normal`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="border-t border-[#F1EFEA] px-5 py-10 text-center text-[13px] text-[#8A877F]">Loading…</td></tr>
              : prompts.length === 0 ? <tr><td colSpan={5} className="border-t border-[#F1EFEA] px-5 py-10 text-center text-[13px] text-[#8A877F]">No prompt templates yet. Templates people save in Copilot will appear here.</td></tr>
              : prompts.map((p: any) => (
                <tr key={p.id} className="border-t border-[#F1EFEA] hover:bg-[#FBFAF7]">
                  <td className="px-5 py-2.5 font-medium text-[#0E0D0A]">{p.title}</td>
                  <td className="px-3 py-2.5"><Badge variant={CAT_COLOR[p.category]||'gray'} className="capitalize">{p.category}</Badge></td>
                  <td className="px-3 py-2.5 text-[#5A5750]">{p.is_builtin ? 'Built-in' : 'Custom'}</td>
                  <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 tabular-nums text-[#2B2924]"><TrendingUp className="h-3.5 w-3.5 text-[#8A877F]" strokeWidth={1.75}/>{p.use_count}</span></td>
                  <td className="px-3 py-2.5"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { Shield, Download } from 'lucide-react'
import { auditApi } from '@/lib/api'
import type { AuditLog } from '@/types'
import { Card } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import { formatDateTime } from '@/lib/utils'

const ACTION_VARIANT: Record<string, any> = {
  upload:'green', download:'blue', delete:'red', login:'amber', search:'purple', view:'gray', logout:'gray'
}

export default function AuditLogsPage() {
  const [logs, setLogs]       = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')

  useEffect(() => {
    auditApi.getLogs(filter ? { action: filter } : {})
      .then(r => setLogs(r.data.results || []))
      .finally(() => setLoading(false))
  }, [filter])

  const filters = ['', 'upload', 'download', 'delete', 'login', 'search', 'view']

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">Audit Logs</h2>
          <p className="text-sm font-light text-[#9B9890]">Complete tamper-evident trail of your vault activity</p>
        </div>
        <button className="flex items-center gap-2 px-3.5 py-2 bg-white border border-[#DDD9D0] rounded-[7px] text-xs font-medium text-[#5A5750] hover:bg-[#F7F5F0] transition-colors">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${filter === f ? 'bg-[#0E0D0A] text-white border-[#0E0D0A]' : 'bg-white border-[#DDD9D0] text-[#5A5750] hover:border-[#0E0D0A]'}`}>
            {f === '' ? 'All Events' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#DDD9D0] bg-[#F7F5F0]">
                {['User','Action','Resource','Date & Time','IP Address'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-mono text-[10px] font-semibold text-[#9B9890] uppercase tracking-[0.6px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-[#9B9890]">Loading…</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#1A3DAF] flex items-center justify-center font-mono text-[9px] font-bold text-white">
                        {log.user_name?.slice(0,2).toUpperCase() || '?'}
                      </div>
                      <span className="text-[12.5px] font-medium text-[#0E0D0A] whitespace-nowrap">{log.user_name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge variant={ACTION_VARIANT[log.action] || 'gray'}>{log.action}</Badge></td>
                  <td className="px-4 py-3 text-[12.5px] text-[#5A5750] max-w-[180px] truncate">{log.resource || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[#9B9890] whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[#9B9890]">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

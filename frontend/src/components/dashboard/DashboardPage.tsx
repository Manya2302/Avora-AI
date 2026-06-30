'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Lock, ClipboardList, Upload, Search, Sparkles, Folder, Brain, Shield, AlertTriangle, FileSignature, CheckSquare } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import StatCard from '@/components/shared/StatCard'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Badge from '@/components/shared/Badge'
import { formatBytes, formatDateTime, truncate } from '@/lib/utils'
import { documentsApi, auditApi, aiApi, complianceApi, contractsApi } from '@/lib/api'

const FILE_COLORS: Record<string,string> = {
  pdf:'bg-red-50 text-red-600', docx:'bg-blue-50 text-blue-600',
  xlsx:'bg-green-50 text-green-600', png:'bg-purple-50 text-purple-600',
}
const ACTION_COLORS: Record<string,any> = { upload:'green', download:'blue', delete:'red', login:'amber', search:'purple' }

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [docs, setDocs]       = useState<any[]>([])
  const [logs, setLogs]       = useState<any[]>([])
  const [aiData, setAiData]   = useState<any>(null)
  const [cols, setCols]       = useState<any[]>([])
  const [compliance, setComp] = useState<any>(null)
  const [riskSum, setRisk]    = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      documentsApi.list({ page_size: 5 }).then(r => setDocs(r.data.results || [])),
      auditApi.getLogs({ page_size: 4 }).then(r => setLogs(r.data.results || [])),
      aiApi.aiDashboard().then(r => setAiData(r.data)).catch(() => {}),
      aiApi.collections().then(r => setCols((r.data.results || r.data || []).slice(0, 4))).catch(() => {}),
      complianceApi.dashboard().then(r => setComp(r.data)).catch(() => {}),
      contractsApi.riskSummary().then(r => setRisk(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const storageUsed = user?.profile?.storage_used || 0
  const storagePct  = Math.min((storageUsed / (500 * 1024 * 1024 * 1024)) * 100, 100)
  const sc = (s: number) => s >= 80 ? 'text-green-600' : s >= 60 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">
          Good morning, {user?.full_name?.split(' ')[0] || 'there'} 👋
        </h2>
        <p className="text-sm font-light text-[#9B9890] mt-0.5">Avora AI Phase 3 — Compliance & Contract Intelligence active</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard label="Total Documents"  value={loading ? '…' : docs.length.toLocaleString()} icon={<FileText/>} accent="blue" trend="+12 today" trendUp onClick={() => router.push('/documents')}/>
        <StatCard label="Compliance Score" value={loading||!compliance ? '…' : `${Math.round(compliance.score)}/100`} icon={<Shield/>} accent={compliance?.score>=80?'green':compliance?.score>=60?'amber':'red'} onClick={() => router.push('/compliance')}/>
        <StatCard label="AI Processed"     value={aiData?.total_processed?.toLocaleString() || '…'} icon={<Brain/>} accent="purple" onClick={() => router.push('/analytics')}/>
        <StatCard label="Contract Risks"   value={riskSum ? riskSum.critical + riskSum.high : '…'} icon={<AlertTriangle/>} accent="red" onClick={() => router.push('/risk')}/>
      </div>

      {/* Phase 3 alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {compliance?.critical_missing > 0 && (
          <button onClick={() => router.push('/compliance')}
            className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-[13px] text-left hover:shadow-md transition-all group">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0"/>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">{compliance.critical_missing} Critical Docs Missing</p>
              <p className="text-xs text-red-600/70">Upload now to improve compliance score</p>
            </div>
            <span className="text-red-500 text-xs group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        )}
        {riskSum?.expiring_30 > 0 && (
          <button onClick={() => router.push('/contracts')}
            className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-[13px] text-left hover:shadow-md transition-all group">
            <FileSignature className="w-5 h-5 text-amber-500 flex-shrink-0"/>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-700">{riskSum.expiring_30} Contracts Expiring in 30d</p>
              <p className="text-xs text-amber-600/70">Renewal action required</p>
            </div>
            <span className="text-amber-500 text-xs group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
        {[
          { label:'Upload',      icon:Upload,       href:'/upload',       color:'bg-[#EBF0FF] text-[#1A3DAF]' },
          { label:'AI Search',   icon:Search,       href:'/search',       color:'bg-[#EBF0FF] text-[#1A3DAF]' },
          { label:'Collections', icon:Folder,       href:'/collections',  color:'bg-purple-50 text-purple-600' },
          { label:'Compliance',  icon:CheckSquare,  href:'/compliance',   color:'bg-green-50 text-green-600' },
          { label:'Contracts',   icon:FileSignature,href:'/contracts',    color:'bg-amber-50 text-amber-600' },
          { label:'Risk',        icon:AlertTriangle,href:'/risk',         color:'bg-red-50 text-red-600' },
        ].map(qa => (
          <button key={qa.href} onClick={() => router.push(qa.href)}
            className="flex flex-col items-center gap-2 p-3.5 bg-white border border-[#DDD9D0] rounded-[12px] hover:border-[#1A3DAF]/25 hover:shadow-sm transition-all group">
            <div className={`w-9 h-9 rounded-[9px] flex items-center justify-center ${qa.color}`}>
              <qa.icon className="w-4 h-4"/>
            </div>
            <span className="text-[11.5px] font-medium text-[#5A5750] group-hover:text-[#0E0D0A] transition-colors">{qa.label}</span>
          </button>
        ))}
      </div>

      {/* Phase 4: Copilot CTA */}
      <button onClick={() => router.push('/copilot')}
        className="w-full flex items-center gap-4 p-5 bg-[#0C0B09] rounded-[14px] hover:shadow-lg transition-all group relative overflow-hidden text-left">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#1A3DAF]/15 rounded-full blur-3xl pointer-events-none"/>
        <div className="w-11 h-11 bg-gradient-to-br from-[#1A3DAF] to-[#7B9FE8] rounded-[11px] flex items-center justify-center flex-shrink-0 relative z-10">
          <Sparkles className="w-5 h-5 text-white"/>
        </div>
        <div className="flex-1 relative z-10">
          <p className="text-white/90 font-semibold text-sm">Ask Avora Copilot anything</p>
          <p className="text-white/40 text-xs mt-0.5">"Are we audit ready?" · "Show contracts expiring next quarter" · "Summarize vendor risks"</p>
        </div>
        <span className="text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all relative z-10">→</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Recent docs */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader title="Recent Uploads" action={<button onClick={() => router.push('/documents')} className="text-xs text-[#1A3DAF] hover:underline">View all →</button>}/>
            <div>
              {loading ? <div className="p-8 text-center text-sm text-[#9B9890]">Loading…</div>
              : docs.length === 0 ? <div className="p-8 text-center text-sm text-[#9B9890]">No documents. <button onClick={() => router.push('/upload')} className="text-[#1A3DAF] underline">Upload →</button></div>
              : docs.map(doc => {
                const ext = doc.file_extension?.replace('.','').toLowerCase()
                return (
                  <div key={doc.id} onClick={() => router.push(`/documents/${doc.id}`)}
                    className="flex items-center gap-3 px-5 py-3 border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0] cursor-pointer group">
                    <div className={`w-8 h-8 rounded-[7px] flex items-center justify-center font-mono text-[9px] font-bold flex-shrink-0 ${FILE_COLORS[ext] || 'bg-gray-50 text-gray-500'}`}>
                      {ext?.toUpperCase().slice(0,3) || 'FILE'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#0E0D0A] truncate">{doc.original_name}</p>
                      <p className="text-[11px] text-[#9B9890] font-mono">{doc.category || '—'} · {formatBytes(doc.original_size)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="blue">ENC</Badge>
                      {doc.status === 'ai_ready' && <Badge variant="purple">AI</Badge>}
                      <button onClick={e => { e.stopPropagation(); router.push(`/documents/${doc.id}/insights`) }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[#9B9890] hover:text-[#1A3DAF]">
                        <Sparkles className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Phase 3 widgets */}
          {compliance && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Compliance Health" action={<button onClick={() => router.push('/compliance')} className="text-xs text-[#1A3DAF] hover:underline">Details →</button>}/>
                <CardBody>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="relative w-14 h-14 flex-shrink-0">
                      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#ECEAE4" strokeWidth="6"/>
                        <circle cx="28" cy="28" r="22" fill="none"
                          stroke={compliance.score>=80?'#16A34A':compliance.score>=60?'#D97706':'#DC2626'}
                          strokeWidth="6" strokeLinecap="round" strokeDasharray="138"
                          strokeDashoffset={138-(138*compliance.score/100)} className="transition-all duration-1000"/>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`font-display text-xs font-bold ${sc(compliance.score)}`}>{Math.round(compliance.score)}</span>
                      </div>
                    </div>
                    <div>
                      <p className={`font-display text-2xl font-bold ${sc(compliance.score)}`}>Grade {compliance.grade}</p>
                      <p className="text-xs text-[#9B9890]">{compliance.compliant}/{compliance.total_checks} compliant</p>
                      <p className="text-xs text-red-500">{compliance.missing_count} missing</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <button onClick={() => router.push('/compliance/copilot')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-[#EBF0FF] border border-[#1A3DAF]/12 rounded-[9px] text-xs font-medium text-[#1A3DAF] hover:bg-[#1A3DAF] hover:text-white transition-all">
                      <Sparkles className="w-3.5 h-3.5"/> Ask Compliance Copilot
                    </button>
                    <button onClick={() => router.push('/compliance/audit-package')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[9px] text-xs font-medium text-[#5A5750] hover:bg-white transition-all">
                      <Shield className="w-3.5 h-3.5"/> Generate Audit Package
                    </button>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Contract Risk" action={<button onClick={() => router.push('/risk')} className="text-xs text-[#1A3DAF] hover:underline">Report →</button>}/>
                <CardBody className="space-y-2">
                  {riskSum ? (<>
                    {[['critical',riskSum.critical,'bg-red-500'],['high',riskSum.high,'bg-amber-400'],['medium',riskSum.medium,'bg-blue-400'],['low',riskSum.low,'bg-green-400']].map(([l,v,c]) => (
                      <div key={String(l)} className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full ${c} flex-shrink-0`}/>
                        <span className="text-xs text-[#5A5750] capitalize flex-1">{l}</span>
                        <span className="font-mono text-xs font-semibold">{v}</span>
                        <div className="w-16 h-1.5 bg-[#ECEAE4] rounded-full overflow-hidden">
                          <div className={`h-full ${c} rounded-full`} style={{width:`${riskSum.total>0?(Number(v)/riskSum.total)*100:0}%`}}/>
                        </div>
                      </div>
                    ))}
                    {riskSum.expiring_30 > 0 && (
                      <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-[8px] mt-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"/>
                        <p className="text-xs text-amber-700"><strong>{riskSum.expiring_30}</strong> expiring in 30d</p>
                      </div>
                    )}
                  </>) : <p className="text-sm text-center text-[#9B9890] py-4">No contracts yet.</p>}
                </CardBody>
              </Card>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Storage"/>
            <CardBody>
              <div className="font-display text-xl font-bold text-[#0E0D0A]">{formatBytes(storageUsed)}</div>
              <div className="text-xs text-[#9B9890] mb-3">of 500 GB used</div>
              <div className="h-1.5 bg-[#ECEAE4] rounded-full overflow-hidden">
                <div className="h-full bg-[#1A3DAF] rounded-full" style={{width:`${storagePct}%`}}/>
              </div>
            </CardBody>
          </Card>

          {cols.length > 0 && (
            <Card>
              <CardHeader title="Collections" action={<button onClick={() => router.push('/collections')} className="text-xs text-[#1A3DAF] hover:underline">All →</button>}/>
              <div className="p-3 grid grid-cols-2 gap-2">
                {cols.map(c => (
                  <button key={c.id} onClick={() => router.push(`/collections/${c.id}`)}
                    className="flex items-center gap-2 p-2.5 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[9px] hover:border-[#1A3DAF]/30 transition-all text-left">
                    <span className="text-base">{c.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-[#0E0D0A] truncate">{c.name}</p>
                      <p className="font-mono text-[9px] text-[#9B9890]">{c.document_count}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Recent Activity" action={<button onClick={() => router.push('/audit-logs')} className="text-xs text-[#1A3DAF] hover:underline">All →</button>}/>
            <div className="divide-y divide-[#ECEAE4]">
              {logs.slice(0, 4).map(log => (
                <div key={log.id} className="px-4 py-2.5 flex items-center gap-2.5">
                  <Badge variant={ACTION_COLORS[log.action] || 'gray'}>{log.action}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[#5A5750] truncate">{truncate(log.resource || '—', 26)}</p>
                    <p className="text-[10px] font-mono text-[#9B9890]">{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

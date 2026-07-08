'use client'
import { useState, useEffect } from 'react'
import { integrationsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import {
  Cloud, Lock, CheckCircle2, AlertCircle, RefreshCw, Folder,
  Unplug, Eye, EyeOff, ChevronRight, Zap, Shield, Database,
  ArrowRight, XCircle, Info, Github, Box, FileCode2,
  GitPullRequest, AlertTriangle, GitCommit, Search, Briefcase, Activity
} from 'lucide-react'

/* ── tiny local components ── */
const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    connected:    'bg-emerald-50 text-emerald-600 border-emerald-200',
    syncing:      'bg-blue-50 text-blue-600 border-blue-200',
    error:        'bg-red-50 text-red-600 border-red-200',
    disconnected: 'bg-white text-[#9B9890] border-[#ECEAE4]',
    pending:      'bg-amber-50 text-amber-600 border-amber-200',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${map[status] ?? map.pending}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

const SecureInput = ({ id, label, hint, value, onChange, placeholder }:
  { id: string; label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string }) => {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="block text-[11.5px] font-medium text-[#9B9890] mb-1.5">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full bg-white border border-[#ECEAE4] rounded-[10px] px-3.5 py-2.5 text-[13px] text-[#0E0D0A] placeholder-white/20 focus:outline-none focus:border-[#1A3DAF]/50 focus:ring-1 focus:ring-[#1A3DAF]/20 pr-10 font-mono"
        />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B9890] hover:text-[#0E0D0A]/60 transition-colors">
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-[10.5px] text-[#9B9890]">{hint}</p>}
    </div>
  )
}

/* ── Checkbox Row ── */
const CheckboxRow = ({ id, label, icon: Icon, selected, onToggle, isSmall }:
  { id: string; label: string; icon?: any; selected: boolean; onToggle: () => void; isSmall?: boolean }) => (
  <label className={`flex items-center gap-3 rounded-[10px] border cursor-pointer transition-all ${isSmall ? 'p-2' : 'p-3'} ${selected ? 'bg-[#EBF0FF] border-[#1A3DAF]/30' : 'border-[#ECEAE4] hover:bg-[#FBFBF9]'}`}>
    <input type="checkbox" checked={selected} onChange={onToggle} className="accent-[#1A3DAF]" />
    {Icon && <Icon className={`flex-shrink-0 ${isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${selected ? 'text-[#1A3DAF]' : 'text-[#9B9890]'}`} />}
    <span className={`${isSmall ? 'text-[12px]' : 'text-[13px]'} ${selected ? 'text-[#0E0D0A]' : 'text-[#9B9890]'}`}>{label}</span>
    {selected && <CheckCircle2 className={`${isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-[#1A3DAF] ml-auto`} />}
  </label>
)

/* ── GitHub Domains ── */
const GH_DOMAINS = [
  { id: 'source_code',   label: 'Source Code',   icon: FileCode2 },
  { id: 'pull_requests', label: 'Pull Requests', icon: GitPullRequest },
  { id: 'issues',        label: 'Issues & Tasks', icon: AlertCircle },
  { id: 'commits',       label: 'Commits',       icon: GitCommit },
  { id: 'documentation', label: 'Documentation', icon: Folder },
  { id: 'wiki',          label: 'Wikis',         icon: Search },
  { id: 'workflows',     label: 'Workflows & CI', icon: Activity },
  { id: 'releases',      label: 'Releases',      icon: Box },
  { id: 'security',      label: 'Security Alerts', icon: AlertTriangle },
]

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'gdrive'|'github'>('gdrive')

  /* ── Google Drive State ── */
  const [gdStep, setGdStep]                 = useState<'credentials'|'oauth'|'folders'|'done'>('credentials')
  const [gdStatus, setGdStatus]             = useState<any>(null)
  const [gdLoading, setGdLoading]           = useState(false)
  const [gdClientId, setGdClientId]         = useState('')
  const [gdClientSecret, setGdClientSecret] = useState('')
  const [gdFolders, setGdFolders]           = useState<any[]>([])
  const [gdSelected, setGdSelected]         = useState<string[]>([])

  /* ── GitHub State ── */
  const [ghStep, setGhStep]                 = useState<'credentials'|'oauth'|'repos'|'done'>('credentials')
  const [ghStatus, setGhStatus]             = useState<any>(null)
  const [ghLoading, setGhLoading]           = useState(false)
  const [ghClientId, setGhClientId]         = useState('')
  const [ghClientSecret, setGhClientSecret] = useState('')
  const [ghRepos, setGhRepos]               = useState<any[]>([])
  const [ghSelected, setGhSelected]         = useState<string[]>([])
  const [ghDomains, setGhDomains]           = useState<Record<string,boolean>>(
    Object.fromEntries(GH_DOMAINS.map(d => [d.id, true]))
  )

  /* fetch status on mount */
  useEffect(() => {
    // GD
    integrationsApi.gdStatus()
      .then(r => {
        setGdStatus(r.data)
        if (r.data.status === 'connected' || r.data.status === 'syncing') setGdStep('done')
        else if (r.data.configured) setGdStep('oauth')
      })
      .catch(() => {})

    // GH
    integrationsApi.ghStatus()
      .then(r => {
        setGhStatus(r.data)
        if (r.data.status === 'connected' || r.data.status === 'syncing') {
          setGhStep('done')
          if (r.data.active_domains) {
            const doms = { ...ghDomains }
            GH_DOMAINS.forEach(d => doms[d.id] = r.data.active_domains.includes(d.id))
            setGhDomains(doms)
          }
        }
        else if (r.data.configured) setGhStep('oauth')
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Google Drive Actions ── */
  const saveGdCredentials = async () => {
    if (!gdClientId.trim() || !gdClientSecret.trim()) return toast.error('Both fields required.')
    setGdLoading(true)
    try {
      await integrationsApi.gdSaveCredentials(gdClientId.trim(), gdClientSecret.trim())
      setGdClientId(''); setGdClientSecret('')
      toast.success('GDrive Credentials saved securely ✓')
      setGdStep('oauth')
      const r = await integrationsApi.gdStatus(); setGdStatus(r.data)
    } catch { toast.error('Failed to save credentials.') }
    finally { setGdLoading(false) }
  }

  const launchGdOAuth = async () => {
    setGdLoading(true)
    try {
      const r = await integrationsApi.gdOAuthUrl()
      window.open(r.data.oauth_url, '_blank', 'width=520,height=640')
    } catch { toast.error('Failed to get OAuth URL.') }
    finally { setGdLoading(false) }
  }

  const loadGdFolders = async () => {
    setGdLoading(true)
    try {
      const r = await integrationsApi.gdListFolders()
      setGdFolders(r.data.folders || [])
      setGdStep('folders')
    } catch { toast.error('Failed to load folders.') }
    finally { setGdLoading(false) }
  }

  const saveGdFolders = async () => {
    setGdLoading(true)
    const names: Record<string,string> = {}
    gdFolders.forEach((f:any) => { if (gdSelected.includes(f.id)) names[f.id] = f.name })
    try {
      await integrationsApi.gdSaveFolders(gdSelected, names)
      toast.success(`${gdSelected.length} folder(s) queued for sync ✓`)
      setGdStep('done')
      const r = await integrationsApi.gdStatus(); setGdStatus(r.data)
    } catch { toast.error('Failed to save folders.') }
    finally { setGdLoading(false) }
  }

  const disconnectGd = async () => {
    if (!confirm('Disconnect Google Drive?')) return
    setGdLoading(true)
    try {
      await integrationsApi.gdDisconnect()
      toast.success('Google Drive disconnected.')
      setGdStatus(null); setGdStep('credentials'); setGdFolders([]); setGdSelected([])
    } catch { toast.error('Failed to disconnect.') }
    finally { setGdLoading(false) }
  }


  /* ── GitHub Actions ── */
  const saveGhCredentials = async () => {
    if (!ghClientId.trim() || !ghClientSecret.trim()) return toast.error('Both fields required.')
    setGhLoading(true)
    try {
      await integrationsApi.ghSaveCredentials(ghClientId.trim(), ghClientSecret.trim())
      setGhClientId(''); setGhClientSecret('')
      toast.success('GitHub Credentials saved securely ✓')
      setGhStep('oauth')
      const r = await integrationsApi.ghStatus(); setGhStatus(r.data)
    } catch { toast.error('Failed to save credentials.') }
    finally { setGhLoading(false) }
  }

  const launchGhOAuth = async () => {
    setGhLoading(true)
    try {
      const r = await integrationsApi.ghOAuthUrl()
      window.open(r.data.oauth_url, '_blank', 'width=520,height=640')
    } catch { toast.error('Failed to get OAuth URL.') }
    finally { setGhLoading(false) }
  }

  const loadGhRepos = async () => {
    setGhLoading(true)
    try {
      const r = await integrationsApi.ghListRepos()
      setGhRepos(r.data.repos || [])
      setGhStep('repos')
    } catch { toast.error('Failed to load repos.') }
    finally { setGhLoading(false) }
  }

  const saveGhRepos = async () => {
    setGhLoading(true)
    const selectedRepoObjects = ghRepos.filter(r => ghSelected.includes(r.id))
    try {
      await integrationsApi.ghSaveRepos(selectedRepoObjects, ghDomains)
      toast.success(`${ghSelected.length} repo(s) queued for sync ✓`)
      setGhStep('done')
      const r = await integrationsApi.ghStatus(); setGhStatus(r.data)
    } catch { toast.error('Failed to save repositories.') }
    finally { setGhLoading(false) }
  }

  const disconnectGh = async () => {
    if (!confirm('Disconnect GitHub?')) return
    setGhLoading(true)
    try {
      await integrationsApi.ghDisconnect()
      toast.success('GitHub disconnected.')
      setGhStatus(null); setGhStep('credentials'); setGhRepos([]); setGhSelected([])
    } catch { toast.error('Failed to disconnect.') }
    finally { setGhLoading(false) }
  }

  /* ── RENDER ── */
  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">
          API Integrations
        </h2>
        <p className="text-[13px] text-[#9B9890] mt-1">
          Connect external data sources · Credentials encrypted at rest via AES-256-GCM + PBKDF2-SHA256
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#ECEAE4]">
        <button onClick={() => setActiveTab('gdrive')}
          className={`flex items-center gap-2 px-5 py-3 text-[13px] font-medium border-b-2 transition-colors ${activeTab === 'gdrive' ? 'border-[#7B9FE8] text-[#1A3DAF]' : 'border-transparent text-[#9B9890] hover:text-[#0E0D0A]'}`}>
          <Cloud className="w-4 h-4" /> Google Drive {gdStatus?.status === 'connected' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
        </button>
        <button onClick={() => setActiveTab('github')}
          className={`flex items-center gap-2 px-5 py-3 text-[13px] font-medium border-b-2 transition-colors ${activeTab === 'github' ? 'border-[#7B9FE8] text-[#1A3DAF]' : 'border-transparent text-[#9B9890] hover:text-[#0E0D0A]'}`}>
          <Github className="w-4 h-4" /> GitHub Knowledge {ghStatus?.status === 'connected' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
        </button>
      </div>


      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* GOOGLE DRIVE PANEL */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {activeTab === 'gdrive' && (
        <div className="bg-white border border-[#ECEAE4] shadow-sm rounded-[18px] overflow-hidden">
          {/* Card header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#ECEAE4] bg-[#FBFBF9]">
            <div className="w-9 h-9 rounded-[10px] bg-white border border-[#ECEAE4] flex items-center justify-center">
              <svg viewBox="0 0 87.3 78" className="w-5 h-5" fill="none">
                <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H4.1a7.3 7.3 0 000 6.65l2.5 7.2z" fill="#0066DA"/>
                <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.8 49.7a7.27 7.27 0 000 6.65h23.3L43.65 25z" fill="#00AC47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a7.27 7.27 0 000-6.65H63.1l4.9 9.4 5.55 16.55z" fill="#EA4335"/>
                <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z" fill="#00832D"/>
                <path d="M63.1 56.35H27.1L13.35 80.1c1.35.8 2.9 1.2 4.5 1.2h50.6c1.6 0 3.15-.45 4.5-1.2L63.1 56.35z" fill="#2684FC"/>
                <path d="M73.4 27.5l-12.85-22.25c-.8-1.4-1.95-2.5-3.3-3.3L43.5 25 63.1 56.35h23.1c0-2.35-.6-4.65-1.8-6.65L73.4 27.5z" fill="#FFBA00"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-[#0E0D0A]">Google Drive</p>
              <p className="text-[11px] text-[#9B9890]">Live-sync connector · Permission-aware RAG</p>
            </div>
            {(gdStep === 'done') && (
              <button onClick={disconnectGd} disabled={gdLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-red-200 text-red-600 text-[11.5px] hover:bg-red-500/10 transition-colors">
                <Unplug className="w-3.5 h-3.5" /> Disconnect
              </button>
            )}
          </div>

          {/* GDrive Step: Credentials */}
          {gdStep === 'credentials' && (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-2 text-[#9B9890] text-[12px]">
                <div className="w-5 h-5 rounded-full bg-[#EBF0FF] text-[#1A3DAF] flex items-center justify-center text-[10px] font-bold">1</div>
                Enter your Google Cloud OAuth App credentials
              </div>
              <div className="p-4 rounded-[12px] bg-blue-50 border border-blue-200 text-[11.5px] text-blue-700">
                <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
                  <li>Google Cloud Console → APIs &amp; Services → Credentials</li>
                  <li>Authorized JavaScript origins: <code className="bg-white px-1 rounded">http://localhost:3000</code> and <code className="bg-white px-1 rounded">http://localhost:8000</code></li>
                  <li>Authorized redirect URIs: <code className="bg-white px-1 rounded">http://localhost:8000/api/integrations/google-drive/callback/</code></li>
                </ol>
              </div>
              <div className="grid gap-4">
                <SecureInput id="gd-client-id" label="OAuth Client ID" placeholder="••••••••.apps.googleusercontent.com" value={gdClientId} onChange={setGdClientId} />
                <SecureInput id="gd-client-secret" label="OAuth Client Secret" placeholder="GOCSPX-••••••••••••••••••••••••••" value={gdClientSecret} onChange={setGdClientSecret} />
              </div>
              <button onClick={saveGdCredentials} disabled={gdLoading || !gdClientId || !gdClientSecret}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#1A3DAF] hover:bg-[#15308A] text-white text-[13px] font-medium disabled:opacity-40 transition-all">
                {gdLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Encrypt &amp; Save
              </button>
            </div>
          )}

          {/* GDrive Step: OAuth */}
          {gdStep === 'oauth' && (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-2 text-[#9B9890] text-[12px]">
                <div className="w-5 h-5 rounded-full bg-[#EBF0FF] text-[#1A3DAF] flex items-center justify-center text-[10px] font-bold">2</div>
                Authorize Avora AI to access Google Drive
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={launchGdOAuth} disabled={gdLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#1A3DAF] hover:bg-[#15308A] text-white text-[13px] font-medium disabled:opacity-40 transition-all">
                  {gdLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />} Connect (OAuth)
                </button>
                <button onClick={loadGdFolders} disabled={gdLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] border border-[#ECEAE4] text-[#9B9890] text-[13px] hover:bg-[#FBFBF9] transition-all">
                  <ChevronRight className="w-3.5 h-3.5" /> Already connected? Load Folders
                </button>
              </div>
            </div>
          )}

          {/* GDrive Step: Folders */}
          {gdStep === 'folders' && (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-[#9B9890] text-[12px]">
                <div className="w-5 h-5 rounded-full bg-[#EBF0FF] text-[#1A3DAF] flex items-center justify-center text-[10px] font-bold">3</div>
                Select folders to index
              </div>
              <div className="grid gap-1.5 max-h-64 overflow-y-auto pr-1">
                {gdFolders.map((f: any) => (
                  <CheckboxRow key={f.id} id={f.id} label={f.name} icon={Folder}
                    selected={gdSelected.includes(f.id)}
                    onToggle={() => setGdSelected(s => s.includes(f.id) ? s.filter(x => x !== f.id) : [...s, f.id])} />
                ))}
              </div>
              <button onClick={saveGdFolders} disabled={gdLoading || gdSelected.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#1A3DAF] hover:bg-[#15308A] text-white text-[13px] font-medium disabled:opacity-40 transition-all">
                {gdLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Sync {gdSelected.length} Folders
              </button>
            </div>
          )}

          {/* GDrive Step: Done */}
          {gdStep === 'done' && gdStatus && (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Status',        value: gdStatus.status, icon: CheckCircle2 },
                  { label: 'Connected As',  value: gdStatus.google_email || '—', icon: Cloud },
                  { label: 'Files Indexed', value: String(gdStatus.files_indexed ?? 0), icon: Database },
                  { label: 'Last Sync',     value: gdStatus.last_sync_at ? new Date(gdStatus.last_sync_at).toLocaleString() : 'Pending', icon: RefreshCw },
                ].map(m => (
                  <div key={m.label} className="p-3 rounded-[12px] bg-[#FBFBF9] border border-[#ECEAE4]">
                    <m.icon className="w-3.5 h-3.5 text-[#1A3DAF] mb-1.5" />
                    <p className="text-[10px] text-[#9B9890] uppercase font-mono tracking-wider">{m.label}</p>
                    <p className="text-[13px] font-medium text-[#0E0D0A] mt-0.5 truncate">{m.value}</p>
                  </div>
                ))}
              </div>
              <button onClick={loadGdFolders} disabled={gdLoading}
                className="text-[12px] text-[#1A3DAF] hover:underline">Change folder selection</button>
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* GITHUB PANEL */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {activeTab === 'github' && (
        <div className="bg-white border border-[#ECEAE4] shadow-sm rounded-[18px] overflow-hidden">
          {/* Card header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#ECEAE4] bg-[#FBFBF9]">
            <div className="w-9 h-9 rounded-[10px] bg-[#24292F] border border-[#ECEAE4] flex items-center justify-center">
              <Github className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-[#0E0D0A]">GitHub Engineering Intelligence</p>
              <p className="text-[11px] text-[#9B9890]">Index code, PRs, Issues, and workflows to build an Engineering Graph</p>
            </div>
            {(ghStep === 'done') && (
              <button onClick={disconnectGh} disabled={ghLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-red-200 text-red-600 text-[11.5px] hover:bg-red-500/10 transition-colors">
                <Unplug className="w-3.5 h-3.5" /> Disconnect
              </button>
            )}
          </div>

          {/* GitHub Step: Credentials */}
          {ghStep === 'credentials' && (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-2 text-[#9B9890] text-[12px]">
                <div className="w-5 h-5 rounded-full bg-[#EBF0FF] text-[#1A3DAF] flex items-center justify-center text-[10px] font-bold">1</div>
                Enter your GitHub OAuth App credentials
              </div>
              <div className="p-4 rounded-[12px] bg-amber-50 border border-amber-200 text-[11.5px] text-amber-700">
                <ol className="list-decimal list-inside space-y-0.5 text-amber-600">
                  <li>GitHub → Developer Settings → OAuth Apps</li>
                  <li>Homepage URL: <code className="bg-white px-1 rounded">http://localhost:3000</code></li>
                  <li>Callback URL: <code className="bg-white px-1 rounded">http://localhost:8000/api/integrations/github/callback/</code></li>
                </ol>
              </div>
              <div className="grid gap-4">
                <SecureInput id="gh-client-id" label="Client ID" placeholder="Iv1.••••••••••••••••" value={ghClientId} onChange={setGhClientId} />
                <SecureInput id="gh-client-secret" label="Client Secret" placeholder="••••••••••••••••••••••••••••••••" value={ghClientSecret} onChange={setGhClientSecret} />
              </div>
              <button onClick={saveGhCredentials} disabled={ghLoading || !ghClientId || !ghClientSecret}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#24292F] hover:bg-[#000] text-white text-[13px] font-medium disabled:opacity-40 transition-all">
                {ghLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Encrypt &amp; Save
              </button>
            </div>
          )}

          {/* GitHub Step: OAuth */}
          {ghStep === 'oauth' && (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-2 text-[#9B9890] text-[12px]">
                <div className="w-5 h-5 rounded-full bg-[#EBF0FF] text-[#1A3DAF] flex items-center justify-center text-[10px] font-bold">2</div>
                Authorize Avora AI to access GitHub
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={launchGhOAuth} disabled={ghLoading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#24292F] hover:bg-[#000] text-white text-[13px] font-medium disabled:opacity-40 transition-all">
                  {ghLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />} Connect GitHub
                </button>
                <button onClick={loadGhRepos} disabled={ghLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] border border-[#ECEAE4] text-[#9B9890] text-[13px] hover:bg-[#FBFBF9] transition-all">
                  <ChevronRight className="w-3.5 h-3.5" /> Already connected? Load Repositories
                </button>
              </div>
            </div>
          )}

          {/* GitHub Step: Repos & Domains */}
          {ghStep === 'repos' && (
            <div className="p-5 space-y-6">
              <div>
                <div className="flex items-center gap-2 text-[#9B9890] text-[12px] mb-3">
                  <div className="w-5 h-5 rounded-full bg-[#EBF0FF] text-[#1A3DAF] flex items-center justify-center text-[10px] font-bold">3</div>
                  Select Repositories
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {ghRepos.map((r: any) => (
                    <label key={r.id} className={`flex items-center gap-3 p-3 rounded-[10px] border cursor-pointer transition-all ${ghSelected.includes(r.id) ? 'bg-[#F4F5F7] border-[#ECEAE4]' : 'border-[#ECEAE4] hover:bg-[#FBFBF9]'}`}>
                      <input type="checkbox" checked={ghSelected.includes(r.id)}
                        onChange={() => setGhSelected(s => s.includes(r.id) ? s.filter(x => x !== r.id) : [...s, r.id])}
                        className="accent-[#1A3DAF]" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12.5px] truncate font-mono ${ghSelected.includes(r.id) ? 'text-[#0E0D0A]' : 'text-[#0E0D0A]'}`}>{r.full_name}</p>
                        <p className="text-[10px] text-[#9B9890]">{r.private ? 'Private' : 'Public'} · {r.language}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 text-[#9B9890] text-[12px] mb-3">
                  <div className="w-5 h-5 rounded-full bg-[#EBF0FF] text-[#1A3DAF] flex items-center justify-center text-[10px] font-bold">4</div>
                  Engineering Domains to Index
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {GH_DOMAINS.map(d => (
                    <CheckboxRow key={d.id} id={d.id} label={d.label} icon={d.icon} isSmall
                      selected={ghDomains[d.id] ?? false}
                      onToggle={() => setGhDomains(prev => ({...prev, [d.id]: !prev[d.id]}))} />
                  ))}
                </div>
              </div>

              <button onClick={saveGhRepos} disabled={ghLoading || ghSelected.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#1A3DAF] hover:bg-[#15308A] text-white text-[13px] font-medium disabled:opacity-40 transition-all">
                {ghLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Build Knowledge Graph
              </button>
            </div>
          )}

          {/* GitHub Step: Done */}
          {ghStep === 'done' && ghStatus && (
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-4 p-4 rounded-[14px] bg-[#FBFBF9] border border-[#ECEAE4]">
                {ghStatus.github_avatar_url ? (
                  <img src={ghStatus.github_avatar_url} alt="GitHub" className="w-12 h-12 rounded-full border-2 border-[#ECEAE4]" />
                ) : <Github className="w-10 h-10 text-[#9B9890]" />}
                <div>
                  <p className="text-[15px] font-semibold text-[#0E0D0A]">{ghStatus.github_name || ghStatus.github_login}</p>
                  <p className="text-[12px] text-[#9B9890]">@{ghStatus.github_login} · Connected</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Code Chunks', value: ghStatus.stats?.code_chunks, icon: FileCode2 },
                  { label: 'PRs',         value: ghStatus.stats?.prs_indexed, icon: GitPullRequest },
                  { label: 'Issues',      value: ghStatus.stats?.issues_indexed, icon: AlertCircle },
                  { label: 'Commits',     value: ghStatus.stats?.commits_indexed, icon: GitCommit },
                  { label: 'Docs',        value: ghStatus.stats?.docs_indexed, icon: Folder },
                ].map(m => (
                  <div key={m.label} className="p-3 rounded-[12px] bg-[#FBFBF9] border border-[#ECEAE4] flex flex-col items-center text-center">
                    <m.icon className="w-4 h-4 text-[#1A3DAF] mb-2" />
                    <p className="text-[14px] font-bold text-[#0E0D0A]">{m.value ?? 0}</p>
                    <p className="text-[9.5px] text-[#9B9890] uppercase font-mono mt-1">{m.label}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-[10px] text-[#9B9890] uppercase font-mono tracking-wider mb-2">Synced Repositories</p>
                <div className="flex flex-wrap gap-2">
                  {ghStatus.selected_repos?.map((repo: any) => (
                    <span key={repo.id ?? repo} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#ECEAE4] text-[11px] font-mono text-[#0E0D0A]">
                      <Briefcase className="w-3 h-3 text-[#1A3DAF]" />
                      {repo.full_name ?? repo}
                    </span>
                  ))}
                </div>
              </div>

              <button onClick={loadGhRepos} disabled={ghLoading}
                className="text-[12px] text-[#1A3DAF] hover:underline">Manage Repositories &amp; Domains</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

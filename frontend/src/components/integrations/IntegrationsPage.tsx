'use client'
import { useState, useEffect } from 'react'
import { integrationsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import {
  Cloud, Lock, CheckCircle2, AlertCircle, RefreshCw, Folder,
  Unplug, Eye, EyeOff, Zap, Database,
  Github, Box, FileCode2,
  GitPullRequest, AlertTriangle, GitCommit, Search, Briefcase, Activity,
  MessageSquare, BookOpen, FileText, Mail, Users
} from 'lucide-react'
import GDriveSyncModal from './GDriveSyncModal'
import GDriveSyncNotification from './GDriveSyncNotification'
import { cn } from '@/lib/utils'
import { Card, CardHeader } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'

const INTEGRATIONS = [
  { id: 'gdrive', name: 'Google Drive', icon: Cloud, available: true, color: '#0066DA', type: 'Sync documents from the Drive folders you choose' },
  { id: 'github', name: 'GitHub', icon: Github, available: true, color: '#24292F', type: 'Index code, pull requests, issues and workflows' },
  { id: 'slack', name: 'Slack', icon: MessageSquare, available: false, color: '#E01E5A', type: 'Communications' },
  { id: 'jira', name: 'Jira', icon: Briefcase, available: false, color: '#0052CC', type: 'Project management' },
  { id: 'onedrive', name: 'OneDrive', icon: Cloud, available: false, color: '#0078D4', type: 'Documents and files' },
  { id: 'sharepoint', name: 'SharePoint', icon: Database, available: false, color: '#0078D4', type: 'Documents and intranet' },
  { id: 'dropbox', name: 'Dropbox', icon: Box, available: false, color: '#0061FF', type: 'Documents and files' },
  { id: 'teams', name: 'Microsoft Teams', icon: Users, available: false, color: '#6264A7', type: 'Communications' },
  { id: 'confluence', name: 'Confluence', icon: BookOpen, available: false, color: '#172B4D', type: 'Wikis and docs' },
  { id: 'notion', name: 'Notion', icon: FileText, available: false, color: '#000000', type: 'Wikis and docs' },
  { id: 'sap', name: 'SAP', icon: Database, available: false, color: '#008FD3', type: 'ERP' },
  { id: 'salesforce', name: 'Salesforce', icon: Cloud, available: false, color: '#00A1E0', type: 'CRM' },
  { id: 'servicenow', name: 'ServiceNow', icon: Activity, available: false, color: '#81B5A1', type: 'IT service management' },
  { id: 'emails', name: 'Emails (IMAP)', icon: Mail, available: false, color: '#EA4335', type: 'Communications' },
]

/* ── tiny local components ── */
const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, 'green' | 'blue' | 'red' | 'gray' | 'amber'> = {
    connected:    'green',
    syncing:      'blue',
    error:        'red',
    disconnected: 'gray',
    pending:      'amber',
  }
  return (
    <Badge variant={map[status] ?? map.pending}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

const SecureInput = ({ id, label, hint, value, onChange, placeholder }:
  { id: string; label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string }) => {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#2B2924]">{label}</label>
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
          className="field pr-10 font-mono text-[13px]"
        />
        <button type="button" onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide value' : 'Show value'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] p-1 text-[#8A877F] transition-colors hover:bg-[#F1EFEA] hover:text-[#0E0D0A]">
          {show ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
        </button>
      </div>
      {hint && <p className="mt-1 text-[12.5px] text-[#8A877F]">{hint}</p>}
    </div>
  )
}

/* ── Checkbox Row ── */
const CheckboxRow = ({ id, label, icon: Icon, selected, onToggle, isSmall }:
  { id: string; label: string; icon?: any; selected: boolean; onToggle: () => void; isSmall?: boolean }) => (
  <label className={cn(
    'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[8px] border transition-colors',
    isSmall ? 'px-2.5 py-2' : 'px-3 py-2.5',
    selected ? 'border-[#1A3DAF]/40 bg-[#EEF2FC]' : 'border-[#DDD9D0] bg-white hover:bg-[#FBFAF7]'
  )}>
    <input type="checkbox" checked={selected} onChange={onToggle} className="accent-[#1A3DAF]" />
    {Icon && <Icon className={cn('h-4 w-4 flex-shrink-0', selected ? 'text-[#1A3DAF]' : 'text-[#8A877F]')} strokeWidth={1.75} />}
    <span className={cn('truncate', isSmall ? 'text-[13px]' : 'text-[14px]', selected ? 'text-[#0E0D0A]' : 'text-[#5A5750]')}>{label}</span>
    {selected && <CheckCircle2 className="ml-auto h-4 w-4 flex-shrink-0 text-[#1A3DAF]" strokeWidth={1.75} />}
  </label>
)

/* ── Step label ── */
const StepLabel = ({ n, total, children }: { n: number; total: number; children: React.ReactNode }) => (
  <div>
    <p className="text-[12.5px] text-[#8A877F]">Step {n} of {total}</p>
    <p className="mt-0.5 text-[14px] font-medium text-[#0E0D0A]">{children}</p>
  </div>
)

/* ── Google Drive logo ── */
const DriveLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 87.3 78" className={className} fill="none" aria-hidden="true">
    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H4.1a7.3 7.3 0 000 6.65l2.5 7.2z" fill="#0066DA"/>
    <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.8 49.7a7.27 7.27 0 000 6.65h23.3L43.65 25z" fill="#00AC47"/>
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a7.27 7.27 0 000-6.65H63.1l4.9 9.4 5.55 16.55z" fill="#EA4335"/>
    <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2L43.65 25z" fill="#00832D"/>
    <path d="M63.1 56.35H27.1L13.35 80.1c1.35.8 2.9 1.2 4.5 1.2h50.6c1.6 0 3.15-.45 4.5-1.2L63.1 56.35z" fill="#2684FC"/>
    <path d="M73.4 27.5l-12.85-22.25c-.8-1.4-1.95-2.5-3.3-3.3L43.5 25 63.1 56.35h23.1c0-2.35-.6-4.65-1.8-6.65L73.4 27.5z" fill="#FFBA00"/>
  </svg>
)

/* ── Code-like inline value ── */
const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="break-all rounded-[5px] border border-[#ECEAE4] bg-white px-1 py-px font-mono text-[12.5px] text-[#2B2924]">{children}</code>
)

/* ── GitHub Domains ── */
const GH_DOMAINS = [
  { id: 'source_code',   label: 'Source code',   icon: FileCode2 },
  { id: 'pull_requests', label: 'Pull requests', icon: GitPullRequest },
  { id: 'issues',        label: 'Issues and tasks', icon: AlertCircle },
  { id: 'commits',       label: 'Commits',       icon: GitCommit },
  { id: 'documentation', label: 'Documentation', icon: Folder },
  { id: 'wiki',          label: 'Wikis',         icon: Search },
  { id: 'workflows',     label: 'Workflows and CI', icon: Activity },
  { id: 'releases',      label: 'Releases',      icon: Box },
  { id: 'security',      label: 'Security alerts', icon: AlertTriangle },
]

/* The OAuth callbacks are served by the backend (the oauth-url endpoints build
   redirect_uri from the API host), so derive them from NEXT_PUBLIC_API_URL. */
function resolveOrigins() {
  const appOrigin = window.location.origin
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
  let apiOrigin = appOrigin
  try { apiOrigin = new URL(apiBase, appOrigin).origin } catch { /* keep app origin */ }
  return { appOrigin, apiOrigin }
}

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'gdrive'|'github'|string>('gdrive')
  const [origins, setOrigins] = useState<{ appOrigin: string; apiOrigin: string } | null>(null)
  useEffect(() => { setOrigins(resolveOrigins()) }, [])
  const appOrigin = origins?.appOrigin ?? '…'
  const apiOrigin = origins?.apiOrigin ?? '…'

  /* ── Google Drive State ── */
  const [gdStep, setGdStep]                 = useState<'credentials'|'oauth'|'folders'|'done'>('credentials')
  const [gdStatus, setGdStatus]             = useState<any>(null)
  const [gdLoading, setGdLoading]           = useState(false)
  const [gdClientId, setGdClientId]         = useState('')
  const [gdClientSecret, setGdClientSecret] = useState('')
  const [gdFolders, setGdFolders]           = useState<any[]>([])
  const [gdSelected, setGdSelected]         = useState<string[]>([])
  // Sync session state
  const [syncSessionId, setSyncSessionId]   = useState<string | null>(null)
  const [showSyncModal, setShowSyncModal]   = useState(false)
  const [showNotification, setShowNotification] = useState(false)
  const [syncFolderName, setSyncFolderName] = useState('')

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
      toast.success('Google Drive credentials saved')
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
    // Pick a display name for the notification
    const displayName = Object.values(names).join(', ') || 'Selected Folders'
    setSyncFolderName(displayName)
    try {
      // confirm=false → prescan only (shows confirmation dialog first)
      const r = await integrationsApi.gdSaveFolders(gdSelected, names, false)
      const sid = r.data.session_id as string
      setSyncSessionId(sid)
      setShowSyncModal(true)
      setShowNotification(false)   // modal takes priority
      setGdStep('done')
      const rs = await integrationsApi.gdStatus(); setGdStatus(rs.data)
    } catch { toast.error('Failed to start folder scan.') }
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
      toast.success('GitHub credentials saved')
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
      toast.success(`${ghSelected.length} ${ghSelected.length === 1 ? 'repository' : 'repositories'} queued for sync`)
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
    <div className="space-y-6">

      {/* ── GDrive Sync Modal (confirmation + progress) ── */}
      {showSyncModal && syncSessionId && (
        <GDriveSyncModal
          key={syncSessionId}
          sessionId={syncSessionId}
          folderName={syncFolderName}
          onClose={() => {
            // Finished import: nothing left to follow.
            setShowSyncModal(false)
            setShowNotification(false)
            integrationsApi.gdStatus().then(r => setGdStatus(r.data)).catch(() => {})
          }}
          onMinimize={() => {
            setShowSyncModal(false)
            setShowNotification(true)  // collapse to notification bar while it runs
          }}
          onCancel={() => {
            // Scan abandoned before import: drop the session entirely.
            setShowSyncModal(false)
            setShowNotification(false)
            setSyncSessionId(null)
          }}
        />
      )}

      {/* ── Chrome-style sync notification ── */}
      {showNotification && syncSessionId && (
        <GDriveSyncNotification
          key={syncSessionId}
          sessionId={syncSessionId}
          onOpen={() => { setShowNotification(false); setShowSyncModal(true) }}
          onDismiss={() => setShowNotification(false)}
        />
      )}

      <PageHeader
        title="Integrations"
        description="Connect the places your documents already live. Credentials are encrypted at rest with AES-256-GCM (keys derived with PBKDF2-SHA256)."
      />

      {/* Available connectors */}
      <Card>
        <CardHeader title="Connectors" subtitle="Pick one to set it up or change what it syncs." />
        <div>
          {INTEGRATIONS.filter(int => int.available).map(int => {
            const isConnected = int.id === 'gdrive' ? gdStatus?.status === 'connected' : (int.id === 'github' ? ghStatus?.status === 'connected' : false)
            const status = int.id === 'gdrive' ? gdStatus?.status : (int.id === 'github' ? ghStatus?.status : undefined)
            const isActive = activeTab === int.id
            return (
              <div key={int.id}
                className={cn(
                  'flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 first:border-0 transition-colors',
                  isActive ? 'bg-[#FBFAF7]' : 'hover:bg-[#FBFAF7]'
                )}>
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px] border border-[#ECEAE4] bg-white">
                  {int.id === 'gdrive'
                    ? <DriveLogo className="h-4 w-4" />
                    : <int.icon className="h-4 w-4 text-[#2B2924]" strokeWidth={1.75} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#0E0D0A]">{int.name}</p>
                  <p className="truncate text-[13px] text-[#8A877F]">{int.type}</p>
                </div>
                <div className="hidden sm:block">
                  {status ? <StatusBadge status={status} /> : <span className="text-[12.5px] text-[#8A877F]">Not connected</span>}
                </div>
                <Button
                  variant={isActive ? 'dark' : 'ghost'}
                  size="sm"
                  aria-pressed={isActive}
                  onClick={() => { if (int.available) setActiveTab(int.id as any) }}
                >
                  {isConnected ? 'Manage' : 'Set up'}
                </Button>
              </div>
            )
          })}
        </div>
      </Card>


      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* GOOGLE DRIVE PANEL */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {activeTab === 'gdrive' && (
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><DriveLogo className="h-4 w-4" /> Google Drive</span>}
            subtitle="Keeps the folders you pick in sync. Search only shows files each person can open in Drive."
            action={(gdStep === 'done') && (
              <Button variant="red" size="sm" onClick={disconnectGd} disabled={gdLoading}>
                <Unplug className="h-3.5 w-3.5" strokeWidth={1.75} /> Disconnect
              </Button>
            )}
          />

          {/* GDrive Step: Credentials */}
          {gdStep === 'credentials' && (
            <div className="space-y-5 p-5">
              <StepLabel n={1} total={3}>Enter your Google Cloud OAuth app credentials</StepLabel>
              <div className="rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7] px-4 py-3 text-[13px] text-[#5A5750]">
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>In Google Cloud Console, open APIs &amp; Services, then Credentials.</li>
                  <li>Authorized JavaScript origins: <Code>{appOrigin}</Code>{apiOrigin !== appOrigin && <> and <Code>{apiOrigin}</Code></>}</li>
                  <li>Authorized redirect URIs: <Code>{`${apiOrigin}/api/integrations/google-drive/callback/`}</Code></li>
                </ol>
              </div>
              <div className="grid gap-4 sm:max-w-lg">
                <SecureInput id="gd-client-id" label="OAuth client ID" placeholder="••••••••.apps.googleusercontent.com" value={gdClientId} onChange={setGdClientId} />
                <SecureInput id="gd-client-secret" label="OAuth client secret" placeholder="GOCSPX-••••••••••••••••••••••••••" value={gdClientSecret} onChange={setGdClientSecret} />
              </div>
              <Button onClick={saveGdCredentials} disabled={gdLoading || !gdClientId || !gdClientSecret}>
                {gdLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />} Encrypt and save
              </Button>
            </div>
          )}

          {/* GDrive Step: OAuth */}
          {gdStep === 'oauth' && (
            <div className="space-y-5 p-5">
              <StepLabel n={2} total={3}>Allow Avora to read your Google Drive</StepLabel>
              <div className="flex flex-wrap gap-2">
                <Button onClick={launchGdOAuth} disabled={gdLoading}>
                  {gdLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />} Connect with Google
                </Button>
                <Button variant="ghost" onClick={loadGdFolders} disabled={gdLoading}>
                  Already connected? Load folders
                </Button>
              </div>
            </div>
          )}

          {/* GDrive Step: Folders */}
          {gdStep === 'folders' && (
            <div className="space-y-4 p-5">
              <StepLabel n={3} total={3}>Choose the folders to sync</StepLabel>
              <div className="grid max-h-64 gap-1.5 overflow-y-auto pr-1">
                {gdFolders.map((f: any) => (
                  <CheckboxRow key={f.id} id={f.id} label={f.name} icon={Folder}
                    selected={gdSelected.includes(f.id)}
                    onToggle={() => setGdSelected(s => s.includes(f.id) ? s.filter(x => x !== f.id) : [...s, f.id])} />
                ))}
              </div>
              <Button onClick={saveGdFolders} disabled={gdLoading || gdSelected.length === 0}>
                {gdLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />} Sync {gdSelected.length} folders
              </Button>
            </div>
          )}

          {/* GDrive Step: Done */}
          {gdStep === 'done' && gdStatus && (
            <div className="space-y-4 p-5">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Status',        value: gdStatus.status, icon: CheckCircle2 },
                  { label: 'Connected as',  value: gdStatus.google_email || '—', icon: Cloud },
                  { label: 'Files indexed', value: String(gdStatus.files_indexed ?? 0), icon: Database },
                  { label: 'Last sync',     value: gdStatus.last_sync_at ? new Date(gdStatus.last_sync_at).toLocaleString() : 'Pending', icon: RefreshCw },
                ].map(m => (
                  <div key={m.label} className="min-w-0">
                    <dt className="text-[12.5px] text-[#8A877F]">{m.label}</dt>
                    <dd className="mt-0.5 truncate text-[14px] font-medium text-[#0E0D0A]">
                      {m.label === 'Status' ? (m.value ? <StatusBadge status={String(m.value)} /> : '—') : m.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <button onClick={loadGdFolders} disabled={gdLoading}
                className="link text-[13px] disabled:opacity-55">Change folder selection</button>
            </div>
          )}
        </Card>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* GITHUB PANEL */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {activeTab === 'github' && (
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Github className="h-4 w-4" strokeWidth={1.75} /> GitHub</span>}
            subtitle="Index code, pull requests, issues and workflows so Avora can answer engineering questions."
            action={(ghStep === 'done') && (
              <Button variant="red" size="sm" onClick={disconnectGh} disabled={ghLoading}>
                <Unplug className="h-3.5 w-3.5" strokeWidth={1.75} /> Disconnect
              </Button>
            )}
          />

          {/* GitHub Step: Credentials */}
          {ghStep === 'credentials' && (
            <div className="space-y-5 p-5">
              <StepLabel n={1} total={3}>Enter your GitHub OAuth app credentials</StepLabel>
              <div className="rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7] px-4 py-3 text-[13px] text-[#5A5750]">
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>In GitHub, open Developer settings, then OAuth Apps.</li>
                  <li>Homepage URL: <Code>{appOrigin}</Code></li>
                  <li>Callback URL: <Code>{`${apiOrigin}/api/integrations/github/callback/`}</Code></li>
                </ol>
              </div>
              <div className="grid gap-4 sm:max-w-lg">
                <SecureInput id="gh-client-id" label="Client ID" placeholder="Iv1.••••••••••••••••" value={ghClientId} onChange={setGhClientId} />
                <SecureInput id="gh-client-secret" label="Client secret" placeholder="••••••••••••••••••••••••••••••••" value={ghClientSecret} onChange={setGhClientSecret} />
              </div>
              <Button onClick={saveGhCredentials} disabled={ghLoading || !ghClientId || !ghClientSecret}>
                {ghLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />} Encrypt and save
              </Button>
            </div>
          )}

          {/* GitHub Step: OAuth */}
          {ghStep === 'oauth' && (
            <div className="space-y-5 p-5">
              <StepLabel n={2} total={3}>Allow Avora to read your GitHub account</StepLabel>
              <div className="flex flex-wrap gap-2">
                <Button onClick={launchGhOAuth} disabled={ghLoading}>
                  {ghLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" strokeWidth={1.75} />} Connect GitHub
                </Button>
                <Button variant="ghost" onClick={loadGhRepos} disabled={ghLoading}>
                  Already connected? Load repositories
                </Button>
              </div>
            </div>
          )}

          {/* GitHub Step: Repos & Domains */}
          {ghStep === 'repos' && (
            <div className="space-y-6 p-5">
              <div className="space-y-3">
                <StepLabel n={3} total={3}>Choose repositories</StepLabel>
                <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {ghRepos.map((r: any) => (
                    <label key={r.id} className={cn(
                      'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[8px] border px-3 py-2.5 transition-colors',
                      ghSelected.includes(r.id) ? 'border-[#1A3DAF]/40 bg-[#EEF2FC]' : 'border-[#DDD9D0] bg-white hover:bg-[#FBFAF7]'
                    )}>
                      <input type="checkbox" checked={ghSelected.includes(r.id)}
                        onChange={() => setGhSelected(s => s.includes(r.id) ? s.filter(x => x !== r.id) : [...s, r.id])}
                        className="accent-[#1A3DAF]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[13px] text-[#0E0D0A]">{r.full_name}</p>
                        <p className="text-[12px] text-[#8A877F]">{r.private ? 'Private' : 'Public'} · {r.language}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[14px] font-medium text-[#0E0D0A]">What to index</p>
                  <p className="mt-0.5 text-[12.5px] text-[#8A877F]">Applies to every repository you selected.</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {GH_DOMAINS.map(d => (
                    <CheckboxRow key={d.id} id={d.id} label={d.label} icon={d.icon} isSmall
                      selected={ghDomains[d.id] ?? false}
                      onToggle={() => setGhDomains(prev => ({...prev, [d.id]: !prev[d.id]}))} />
                  ))}
                </div>
              </div>

              <Button onClick={saveGhRepos} disabled={ghLoading || ghSelected.length === 0}>
                {ghLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" strokeWidth={1.75} />} Start indexing
              </Button>
            </div>
          )}

          {/* GitHub Step: Done */}
          {ghStep === 'done' && ghStatus && (
            <div className="space-y-5 p-5">
              <div className="flex items-center gap-3">
                {ghStatus.github_avatar_url ? (
                  <img src={ghStatus.github_avatar_url} alt="GitHub" className="h-10 w-10 rounded-full border border-[#DDD9D0]" />
                ) : <Github className="h-8 w-8 text-[#8A877F]" strokeWidth={1.75} />}
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#0E0D0A]">{ghStatus.github_name || ghStatus.github_login}</p>
                  <p className="truncate text-[13px] text-[#8A877F]">@{ghStatus.github_login} · Connected</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-[#F1EFEA] py-4 sm:grid-cols-5">
                {[
                  { label: 'Code chunks', value: ghStatus.stats?.code_chunks, icon: FileCode2 },
                  { label: 'Pull requests', value: ghStatus.stats?.prs_indexed, icon: GitPullRequest },
                  { label: 'Issues',      value: ghStatus.stats?.issues_indexed, icon: AlertCircle },
                  { label: 'Commits',     value: ghStatus.stats?.commits_indexed, icon: GitCommit },
                  { label: 'Docs',        value: ghStatus.stats?.docs_indexed, icon: Folder },
                ].map(m => (
                  <div key={m.label} className="flex flex-col-reverse">
                    <dt className="mt-1.5 text-[12.5px] text-[#8A877F]">{m.label}</dt>
                    <dd className="font-display text-[28px] font-semibold leading-none tabular-nums text-[#0E0D0A]">{m.value ?? 0}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <p className="mb-2 text-[12.5px] text-[#8A877F]">Synced repositories</p>
                <div className="flex flex-wrap gap-1.5">
                  {ghStatus.selected_repos?.map((repo: any) => (
                    <span key={repo.id ?? repo} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-[6px] border border-[#ECEAE4] bg-[#FBFAF7] px-2 py-1 font-mono text-[12.5px] text-[#2B2924]">
                      <Briefcase className="h-3.5 w-3.5 flex-shrink-0 text-[#8A877F]" strokeWidth={1.75} />
                      {repo.full_name ?? repo}
                    </span>
                  ))}
                </div>
              </div>

              <button onClick={loadGhRepos} disabled={ghLoading}
                className="link text-[13px] disabled:opacity-55">Change repositories and what to index</button>
            </div>
          )}
        </Card>
      )}

      {/* Connectors that aren't available yet */}
      <Card>
        <CardHeader title="Coming soon" subtitle="These connectors aren't available yet." />
        <ul className="grid grid-cols-1 sm:grid-cols-2">
          {INTEGRATIONS.filter(int => !int.available).map(int => (
            <li key={int.id} className="flex min-w-0 items-center gap-3 border-t border-[#F1EFEA] px-5 py-3 sm:[&:nth-child(2)]:border-t-0 first:border-t-0">
              <int.icon className="h-4 w-4 flex-shrink-0 text-[#8A877F]" strokeWidth={1.75} />
              <div className="min-w-0">
                <p className="truncate text-[14px] text-[#2B2924]">{int.name}</p>
                <p className="truncate text-[12.5px] text-[#8A877F]">{int.type}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

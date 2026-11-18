'use client'
import { useCallback, useEffect, useState } from 'react'
import { Bell, Shield, Monitor, AlertTriangle } from 'lucide-react'
import { usersApi, documentsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { Card, CardHeader } from '@/components/shared/Card'
import PageHeader from '@/components/shared/PageHeader'
import Badge from '@/components/shared/Badge'
import Button from '@/components/shared/Button'
import Modal from '@/components/shared/Modal'
import { formatDateTime } from '@/lib/utils'

const Toggle = ({ on, onToggle, label, disabled }: { on: boolean; onToggle: () => void; label?: string; disabled?: boolean }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} disabled={disabled} className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 ${on ? 'bg-[#1A3DAF]' : 'bg-[#DDD9D0]'}`}>
    <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
  </button>
)

type Prefs = Record<string, boolean>
interface SettingDef { key: string; label: string; desc: string }

// Keys must match PREFERENCE_DEFAULTS in backend/apps/users/serializers.py
const NOTIF_SETTINGS: SettingDef[] = [
  { key: 'upload_complete', label: 'Upload finished', desc: 'When a document has been encrypted and processed.' },
  { key: 'audit_digest',    label: 'Weekly activity summary', desc: 'A digest of everything that happened in your workspace.' },
]
const SEC_SETTINGS: SettingDef[] = [
  { key: 'login_notif', label: 'Sign-in emails', desc: 'Email me when my account is signed in to from a new device or IP address.' },
]

interface Session {
  id: number
  ip_address: string
  user_agent: string
  device_name: string
  location: string
  created_at: string
  last_active_at: string
  is_current: boolean
}

const CONFIRM_WORD = 'DELETE'

/** "Chrome on Windows" from a user-agent string. */
function describeDevice(ua: string): string {
  if (!ua) return 'Unknown browser'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null
  if (browser && os) return `${browser} on ${os}`
  return browser || os || ua.slice(0, 40)
}

function errorMessage(err: any, fallback: string): string {
  const d = err?.response?.data
  if (typeof d?.detail === 'string') return d.detail
  if (typeof d?.message === 'string') return d.message
  return fallback
}

export default function SettingsPage() {
  const [panel, setPanel] = useState('notifications')

  // ── preferences ──
  const [saved, setSaved]   = useState<Prefs | null>(null)   // last values confirmed by the server
  const [prefs, setPrefs]   = useState<Prefs | null>(null)   // what the toggles show
  const [prefsError, setPrefsError] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const loadPrefs = useCallback(async () => {
    setPrefsError(false)
    try {
      const { data } = await usersApi.getPreferences()
      setSaved(data); setPrefs(data)
    } catch {
      setPrefsError(true)
    }
  }, [])
  useEffect(() => { loadPrefs() }, [loadPrefs])

  const savePanel = async (panelKey: string, defs: SettingDef[]) => {
    if (!prefs) return
    setSaving(panelKey)
    try {
      const { data } = await usersApi.updatePreferences(Object.fromEntries(defs.map(d => [d.key, prefs[d.key]])))
      setSaved(data)
      setPrefs(p => ({ ...(p || {}), ...Object.fromEntries(defs.map(d => [d.key, data[d.key]])) }))
      toast.success('Settings saved.')
    } catch (err) {
      toast.error(errorMessage(err, 'Your settings couldn’t be saved. Please try again.'))
    } finally {
      setSaving(null)
    }
  }
  const resetPanel = (defs: SettingDef[]) => {
    if (!saved) return
    setPrefs(p => ({ ...(p || {}), ...Object.fromEntries(defs.map(d => [d.key, saved[d.key]])) }))
  }
  const isDirty = (defs: SettingDef[]) => !!prefs && !!saved && defs.some(d => prefs[d.key] !== saved[d.key])

  // ── sessions ──
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [sessionsError, setSessionsError] = useState(false)
  const [revoking, setRevoking] = useState<number | 'others' | null>(null)

  const loadSessions = useCallback(async () => {
    setSessionsError(false)
    try {
      const { data } = await usersApi.getSessions()
      setSessions(Array.isArray(data) ? data : data.results || [])
    } catch {
      setSessionsError(true)
    }
  }, [])
  useEffect(() => { if (panel === 'sessions') loadSessions() }, [panel, loadSessions])

  const revokeOne = async (id: number) => {
    setRevoking(id)
    try {
      await usersApi.revokeSession(id)
      setSessions(s => (s || []).filter(x => x.id !== id))
      toast.success('That device has been signed out.')
    } catch (err) {
      toast.error(errorMessage(err, 'That session couldn’t be signed out. Please try again.'))
    } finally {
      setRevoking(null)
    }
  }
  const revokeOthers = async () => {
    setRevoking('others')
    try {
      const { data } = await usersApi.revokeOtherSessions()
      const n = data?.revoked ?? 0
      toast.success(n === 1 ? 'Signed out of 1 other session.' : `Signed out of ${n} other sessions.`)
      await loadSessions()
    } catch (err) {
      toast.error(errorMessage(err, 'Other sessions couldn’t be signed out. Please try again.'))
    } finally {
      setRevoking(null)
    }
  }
  const otherCount = (sessions || []).filter(s => !s.is_current).length

  // ── delete all documents ──
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deletedCount, setDeletedCount] = useState(0)

  const deleteAllDocuments = async () => {
    setDeleting(true); setDeletedCount(0)
    let deleted = 0, failed = 0
    try {
      // Always re-read page 1: deleted documents drop out of the list. Stop if a page makes no progress.
      for (;;) {
        const { data } = await documentsApi.list({ page: 1 })
        const items: { id: string }[] = Array.isArray(data) ? data : data.results || []
        if (!items.length) break
        let progressed = false
        for (const doc of items) {
          try {
            await documentsApi.delete(doc.id)
            deleted += 1; progressed = true
            setDeletedCount(deleted)
          } catch {
            failed += 1
          }
        }
        if (!progressed) break
      }
      if (failed) toast.error(`Deleted ${deleted} document${deleted === 1 ? '' : 's'}; ${failed} couldn’t be deleted.`)
      else toast.success(deleted ? `Deleted ${deleted} document${deleted === 1 ? '' : 's'}.` : 'You have no documents to delete.')
      setConfirmOpen(false); setConfirmText('')
    } catch (err) {
      toast.error(errorMessage(err, `Stopped after deleting ${deleted} document${deleted === 1 ? '' : 's'}. Please try again.`))
    } finally {
      setDeleting(false)
    }
  }

  const panelNav = [
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'security',      label: 'Security',      icon: Shield },
    { key: 'sessions',      label: 'Sessions',      icon: Monitor },
    { key: 'danger',        label: 'Data',          icon: AlertTriangle },
  ]

  const prefList = (defs: SettingDef[]) => (
    <ul>
      {defs.map(s => (
        <li key={s.key} className="flex items-start justify-between gap-4 border-t border-[#F1EFEA] px-5 py-4 first:border-0">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[#0E0D0A]">{s.label}</p>
            <p className="mt-0.5 text-[13px] text-[#8A877F]">{s.desc}</p>
          </div>
          <Toggle label={s.label} on={!!prefs?.[s.key]} disabled={!prefs || !!saving}
            onToggle={() => setPrefs(p => p && ({ ...p, [s.key]: !p[s.key] }))} />
        </li>
      ))}
    </ul>
  )

  const prefFooter = (panelKey: string, defs: SettingDef[], label: string) => (
    <div className="flex items-center justify-end gap-2 border-t border-[#ECEAE4] bg-[#FBFAF7] px-5 py-3">
      {prefsError && (
        <span className="mr-auto text-[12.5px] text-[#B91C1C]">
          Your settings couldn’t be loaded. <button type="button" className="underline" onClick={loadPrefs}>Try again</button>
        </span>
      )}
      <Button variant="ghost" size="sm" disabled={!isDirty(defs) || !!saving} onClick={() => resetPanel(defs)}>Cancel</Button>
      <Button size="sm" loading={saving === panelKey} disabled={!isDirty(defs) || (!!saving && saving !== panelKey)} onClick={() => savePanel(panelKey, defs)}>{label}</Button>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Notifications, sign-in security and your data." />

      {/* tabs */}
      <div className="-mx-1 overflow-x-auto border-b border-[#DDD9D0]">
        <div className="flex min-w-max gap-5 px-1" role="tablist">
          {panelNav.map(p => (
            <button key={p.key} onClick={() => setPanel(p.key)} role="tab" aria-selected={panel === p.key}
              className={`-mb-px flex items-center gap-2 border-b-2 pb-2.5 pt-1 text-[14px] transition-colors ${panel === p.key ? 'border-[#0E0D0A] font-medium text-[#0E0D0A]' : 'border-transparent text-[#8A877F] hover:text-[#2B2924]'}`}>
              <p.icon className="h-4 w-4" strokeWidth={1.75} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {panel === 'notifications' && (
        <Card>
          <CardHeader title="Email notifications" subtitle="Your choices are saved to your account. Avora doesn’t send these emails yet; they’ll follow these choices once it does." />
          {prefList(NOTIF_SETTINGS)}
          {prefFooter('notifications', NOTIF_SETTINGS, 'Save preferences')}
        </Card>
      )}

      {panel === 'security' && (
        <Card>
          <CardHeader title="Sign-in and security" subtitle="Applies to your account on every device." />
          {prefList(SEC_SETTINGS)}
          {prefFooter('security', SEC_SETTINGS, 'Save settings')}
        </Card>
      )}

      {panel === 'sessions' && (
        <Card>
          <CardHeader
            title="Where you’re signed in"
            subtitle="Sign out of any device you don’t recognise."
            action={<Button variant="red" size="sm" loading={revoking === 'others'} disabled={!sessions || otherCount === 0 || revoking !== null} onClick={revokeOthers}>Sign out all others</Button>}
          />
          {sessionsError ? (
            <div className="px-5 py-6 text-[13px] text-[#8A877F]">
              Your sessions couldn’t be loaded. <button type="button" className="underline" onClick={loadSessions}>Try again</button>
            </div>
          ) : sessions === null ? (
            <div className="px-5 py-6 text-[13px] text-[#8A877F]">Loading sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="px-5 py-6 text-[13px] text-[#8A877F]">No active sessions.</div>
          ) : (
            <ul>
              {sessions.map(s => (
                <li key={s.id} className="flex items-center gap-3 border-t border-[#F1EFEA] px-5 py-3.5 first:border-0 hover:bg-[#FBFAF7]">
                  <Monitor className={`h-4 w-4 shrink-0 ${s.is_current ? 'text-[#1A3DAF]' : 'text-[#8A877F]'}`} strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[#0E0D0A]">
                      <span className="truncate">{s.device_name || describeDevice(s.user_agent)}</span>
                      {s.is_current && <Badge variant="green">This device</Badge>}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[#8A877F]">
                      {s.location && <>{s.location} · </>}
                      <span className="font-mono text-[12px]">{s.ip_address}</span>
                      {' · '}{s.is_current ? 'Active now' : `Last active ${formatDateTime(s.last_active_at)}`}
                    </div>
                  </div>
                  {!s.is_current && (
                    <Button variant="red" size="sm" loading={revoking === s.id} disabled={revoking !== null && revoking !== s.id} onClick={() => revokeOne(s.id)}>Sign out</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {panel === 'danger' && (
        <Card className="border-[#F1C6C6]">
          <CardHeader title="Your data" subtitle="This can’t be undone. Read it carefully." />
          <ul>
            <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[#B91C1C]">Delete all documents</p>
                <p className="mt-0.5 text-[13px] text-[#8A877F]">Permanently delete every document you own, with its search index and analysis. Your account stays open.</p>
              </div>
              <Button variant="red" size="sm" className="self-start sm:self-auto" onClick={() => { setConfirmText(''); setConfirmOpen(true) }}>Delete documents</Button>
            </li>
          </ul>
        </Card>
      )}

      <Modal
        open={confirmOpen}
        onOpenChange={o => { if (!deleting) setConfirmOpen(o) }}
        title="Delete all documents?"
        description="Every document you own will be permanently deleted. This can’t be undone."
        footer={<>
          <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="red" size="sm" loading={deleting} disabled={confirmText !== CONFIRM_WORD} onClick={deleteAllDocuments}>Delete everything</Button>
        </>}
      >
        <label htmlFor="confirm-delete" className="text-[13px] text-[#2B2924]">
          Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm.
        </label>
        <input id="confirm-delete" value={confirmText} onChange={e => setConfirmText(e.target.value)} disabled={deleting}
          autoComplete="off" className="field mt-1.5 h-10 w-full" />
        {deleting && <p className="mt-2 text-[12.5px] text-[#8A877F]">Deleted {deletedCount} so far…</p>}
      </Modal>
    </div>
  )
}

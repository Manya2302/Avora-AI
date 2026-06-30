'use client'
import { useState } from 'react'
import { Bell, Shield, Monitor, AlertTriangle, Trash2 } from 'lucide-react'
import { usersApi } from '@/lib/api'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'

const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
  <button onClick={onToggle} className={`w-9 h-5 rounded-full relative transition-all duration-200 ${on ? 'bg-[#1A3DAF]' : 'bg-[#DDD9D0]'}`}>
    <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
)

const NOTIF_SETTINGS = [
  { key: 'upload_complete', label: 'Upload Complete', desc: 'Confirm when a document finishes encrypting and processing.', default: true },
  { key: 'security_alert',  label: 'Security Alert',  desc: 'Immediate alert for login from new device or failed attempts.', default: true },
  { key: 'audit_digest',    label: 'Weekly Audit Digest', desc: 'Weekly summary of all vault activity.', default: false },
  { key: 'storage_warning', label: 'Storage Threshold', desc: 'Alert when usage reaches 75% or 90% of plan limit.', default: true },
]
const SEC_SETTINGS = [
  { key: '2fa',             label: 'Two-Factor Authentication', desc: 'Require a verification code on every login.', default: false },
  { key: 'login_notif',     label: 'Login Notifications',       desc: 'Email on login from new device or location.', default: true },
  { key: 'session_timeout', label: 'Auto Session Timeout',      desc: 'Sign out after 60 minutes of inactivity.', default: true },
  { key: 'sha256_verify',   label: 'SHA-256 Download Check',    desc: 'Verify document integrity on every download.', default: true },
]

export default function SettingsPage() {
  const [panel, setPanel]   = useState('notifications')
  const [notif, setNotif]   = useState<Record<string, boolean>>(Object.fromEntries(NOTIF_SETTINGS.map(s => [s.key, s.default])))
  const [sec, setSec]       = useState<Record<string, boolean>>(Object.fromEntries(SEC_SETTINGS.map(s => [s.key, s.default])))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true); await new Promise(r => setTimeout(r, 800))
    setSaving(false); toast.success('Settings saved.')
  }

  const panelNav = [
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'security',      label: 'Security',      icon: Shield },
    { key: 'sessions',      label: 'Sessions',      icon: Monitor },
    { key: 'danger',        label: 'Account Deletion', icon: AlertTriangle },
  ]

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A]">Account Settings</h2>
        <p className="text-sm font-light text-[#9B9890]">Manage notifications, security, and account preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Nav */}
        <div className="bg-white border border-[#DDD9D0] rounded-[16px] p-3 h-fit">
          {panelNav.map(p => (
            <button key={p.key} onClick={() => setPanel(p.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] mb-0.5 transition-all ${panel === p.key ? 'bg-[#EBF0FF] text-[#1A3DAF]' : 'text-[#5A5750] hover:bg-[#F7F5F0]'}`}>
              <p.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{p.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-4">
          {panel === 'notifications' && (
            <Card>
              <CardHeader title="Notification Settings" />
              <CardBody className="space-y-3">
                {NOTIF_SETTINGS.map(s => (
                  <div key={s.key} className="flex items-start justify-between gap-4 p-3.5 border border-[#ECEAE4] rounded-[11px]">
                    <div>
                      <p className="text-sm font-semibold text-[#0E0D0A]">{s.label}</p>
                      <p className="text-xs font-light text-[#9B9890] mt-0.5">{s.desc}</p>
                    </div>
                    <Toggle on={notif[s.key]} onToggle={() => setNotif(p => ({ ...p, [s.key]: !p[s.key] }))} />
                  </div>
                ))}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm">Cancel</Button>
                  <Button size="sm" loading={saving} onClick={save}>Save Preferences</Button>
                </div>
              </CardBody>
            </Card>
          )}
          {panel === 'security' && (
            <Card>
              <CardHeader title="Security Settings" />
              <CardBody className="space-y-3">
                {SEC_SETTINGS.map(s => (
                  <div key={s.key} className="flex items-start justify-between gap-4 p-3.5 border border-[#ECEAE4] rounded-[11px]">
                    <div>
                      <p className="text-sm font-semibold text-[#0E0D0A]">{s.label}</p>
                      <p className="text-xs font-light text-[#9B9890] mt-0.5">{s.desc}</p>
                    </div>
                    <Toggle on={sec[s.key]} onToggle={() => setSec(p => ({ ...p, [s.key]: !p[s.key] }))} />
                  </div>
                ))}
                <div className="flex justify-end gap-2 pt-2">
                  <Button size="sm" loading={saving} onClick={save}>Save Settings</Button>
                </div>
              </CardBody>
            </Card>
          )}
          {panel === 'sessions' && (
            <Card>
              <CardHeader title="Active Sessions" action={<Button variant="red" size="sm" onClick={async () => { await usersApi.revokeAllSessions(); toast.success('All sessions revoked.') }}>Revoke All Others</Button>} />
              <CardBody className="space-y-3">
                {[
                  { name: 'Chrome on macOS', ip: '103.21.45.67', loc: 'Bengaluru, IN', time: 'Active now', current: true },
                  { name: 'Mobile App · iPhone 15', ip: '103.21.45.69', loc: 'Bengaluru, IN', time: '2 hours ago', current: false },
                  { name: 'Firefox on Windows 11', ip: '182.68.22.14', loc: 'Delhi, IN', time: 'Yesterday', current: false },
                ].map(s => (
                  <div key={s.ip} className={`flex items-center gap-3 p-3.5 border rounded-[11px] ${s.current ? 'border-[#1A3DAF] bg-[#EBF0FF]' : 'border-[#ECEAE4]'}`}>
                    <Monitor className={`w-4 h-4 flex-shrink-0 ${s.current ? 'text-[#1A3DAF]' : 'text-[#9B9890]'}`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[#0E0D0A]">{s.name}{s.current && <span className="ml-2 font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Current</span>}</div>
                      <div className="font-mono text-[10.5px] text-[#9B9890]">{s.loc} · {s.ip} · {s.time}</div>
                    </div>
                    {!s.current && <Button variant="ghost" size="sm" className="text-red-500 border-red-100 hover:bg-red-50">Revoke</Button>}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
          {panel === 'danger' && (
            <div className="border border-red-200 rounded-[16px] overflow-hidden">
              <div className="px-5 py-4 bg-red-50 border-b border-red-100">
                <p className="text-sm font-semibold text-red-700">⚠ Danger Zone</p>
                <p className="text-xs font-light text-red-600/70 mt-0.5">Permanent, irreversible account actions</p>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { label: 'Export All Data', desc: 'Download a complete encrypted archive of all documents and metadata.', btn: 'Export ZIP', variant: 'ghost' as const },
                  { label: 'Delete All Documents', desc: 'Permanently delete all 1,284 documents. Account remains active.', btn: 'Delete Documents', variant: 'red' as const },
                  { label: 'Delete Account Permanently', desc: 'Close account and destroy all data forever. This cannot be undone.', btn: 'Delete Account', variant: 'red' as const, danger: true },
                ].map(a => (
                  <div key={a.label} className={`flex items-center justify-between gap-4 p-4 border rounded-[11px] ${a.danger ? 'border-red-200 bg-red-50/40' : 'border-[#ECEAE4]'}`}>
                    <div>
                      <p className={`text-sm font-semibold ${a.danger ? 'text-red-600' : 'text-[#0E0D0A]'}`}>{a.label}</p>
                      <p className="text-xs font-light text-[#9B9890] mt-0.5">{a.desc}</p>
                    </div>
                    <Button variant={a.variant} size="sm" className="flex-shrink-0">{a.btn}</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

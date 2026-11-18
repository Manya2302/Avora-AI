'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { adminApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const titles: Record<string, string> = {
  '/securevault-admin/dashboard':         'Overview',
  '/securevault-admin/users':             'Users',
  '/securevault-admin/documents':         'Documents',
  '/securevault-admin/security':          'Security',
  '/securevault-admin/storage':           'Storage',
  '/securevault-admin/audits':            'Audit log',
  '/securevault-admin/settings':          'System',
  '/securevault-admin/ai-monitor':        'AI health',
  '/securevault-admin/compliance':        'Compliance',
  '/securevault-admin/ai-governance':     'AI governance',
  '/securevault-admin/prompt-management': 'Prompts',
}

const ACTION_LABEL: Record<string, string> = {
  login: 'Sign-in', login_failed: 'Failed sign-in', logout: 'Sign-out', upload: 'Upload', download: 'Download', delete: 'Deletion',
  view: 'Document viewed', search: 'Search', share: 'Sharing change', settings: 'Settings change',
}

/** Plain-language title/meta for a flagged audit-log entry (GET /admin-panel/security/). */
export function describeSecurityEvent(e: any): { title: string; meta: string } {
  const resource = String(e?.resource || '')
  let title: string
  if (resource.startsWith('admin:deactivate_user')) title = 'User account deactivated by an admin'
  else if (resource.startsWith('admin:reactivate_user')) title = 'User account reactivated by an admin'
  else if (resource.startsWith('admin:change_role')) title = 'User role changed by an admin'
  else {
    const label = ACTION_LABEL[e?.action] || String(e?.action || 'Event')
    title = resource ? `${label} · ${resource}` : label
  }
  const who = e?.user_name && e.user_name !== '—' ? e.user_name : (e?.user_email && e.user_email !== '—' ? e.user_email : '')
  const meta = [who, e?.ip_address].filter(Boolean).join(' · ')
  return { title, meta }
}

const SEEN_KEY = 'avora:admin-security-seen-at'
function readSeen(): number {
  try { return Number(localStorage.getItem(SEEN_KEY)) || 0 } catch { return 0 }
}
function writeSeen(t: number) {
  try { localStorage.setItem(SEEN_KEY, String(t)) } catch { /* private mode */ }
}

export default function AdminTopbar() {
  const pathname = usePathname()
  const [time, setTime] = useState('')
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<any[]>([])
  const [failed, setFailed] = useState(false)
  const [seenAt, setSeenAt] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-IN', { hour12: false }) + ' IST')
    update(); const t = setInterval(update, 1000); return () => clearInterval(t)
  }, [])

  useEffect(() => { setSeenAt(readSeen()) }, [])

  useEffect(() => {
    const load = () => adminApi.security()
      .then(res => { setEvents((res.data?.results ?? res.data ?? []).slice(0, 6)); setFailed(false) })
      .catch(() => setFailed(true))
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [])

  const unread = events.filter(e => new Date(e.created_at).getTime() > seenAt).length

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) { const now = Date.now(); writeSeen(now); setSeenAt(now) }
  }

  return (
    <header className="z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[#DDD9D0] bg-[#F7F5F0]/95 px-4 backdrop-blur sm:px-6">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13.5px]">
        <span className="hidden truncate text-[#8A877F] sm:inline">Admin console</span>
        <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-[#BDB8AC] sm:block" />
        <span className="truncate font-medium text-[#0E0D0A]">{titles[pathname] || 'Admin console'}</span>
      </nav>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <span className="hidden text-[12.5px] tabular-nums text-[#8A877F] md:inline">{time}</span>
        <div className="relative" ref={panelRef}>
          <button
            onClick={toggle}
            aria-label={unread ? `Security events, ${unread} new` : 'Security events'}
            aria-expanded={open}
            className={cn('relative rounded-[8px] p-2 text-[#5A5750] transition-colors hover:bg-[#ECEAE4]', open && 'bg-[#ECEAE4]')}
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-[#F7F5F0] bg-[#DC2626]" />}
          </button>

          {open && (
            <div className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-[10px] border border-[#DDD9D0] bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-[#ECEAE4] px-4 py-3">
                <span className="text-[14px] font-semibold">Security events</span>
                <Link href="/securevault-admin/security" onClick={() => setOpen(false)} className="link text-[13px]">View all</Link>
              </div>
              <ul className="max-h-[320px] overflow-y-auto">
                {failed ? (
                  <li className="px-4 py-10 text-center text-[13px] text-[#8A877F]">Couldn't load security events.</li>
                ) : events.length ? events.map(e => {
                  const d = describeSecurityEvent(e)
                  return (
                    <li key={e.id} className="flex gap-3 border-b border-[#F1EFEA] px-4 py-3 last:border-0">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] text-[#0E0D0A]">{d.title}</p>
                        <p className="mt-0.5 truncate text-[12px] text-[#8A877F]">
                          {[d.meta, formatDistanceToNow(new Date(e.created_at), { addSuffix: true })].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </li>
                  )
                }) : (
                  <li className="px-4 py-10 text-center text-[13px] text-[#8A877F]">No flagged security events.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

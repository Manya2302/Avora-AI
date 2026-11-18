'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Upload, Menu, Search, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { auditApi } from '@/lib/api'
import { crumbsFor } from './nav'

const SEEN_KEY = 'avora:activity-seen-at'

function readSeen(): number {
  try { return Number(localStorage.getItem(SEEN_KEY)) || 0 } catch { return 0 }
}
function writeSeen(t: number) {
  try { localStorage.setItem(SEEN_KEY, String(t)) } catch { /* private mode */ }
}

function describe(log: any): string {
  const action = String(log.action || '').replace(/_/g, ' ')
  const file = log.details?.file_name || log.resource
  return file ? `${action[0]?.toUpperCase()}${action.slice(1)} · ${file}` : `${action[0]?.toUpperCase()}${action.slice(1)}`
}

function dotColor(action: string) {
  if (action.includes('delete') || action.includes('fail')) return 'bg-[#DC2626]'
  if (action.includes('upload') || action.includes('create')) return 'bg-[#16A34A]'
  return 'bg-[#9B9890]'
}

export default function Topbar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const crumbs = crumbsFor(pathname)

  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [seenAt, setSeenAt] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSeenAt(readSeen()) }, [])

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); router.push('/search') }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [router])

  useEffect(() => {
    const load = () => auditApi.getLogs({ limit: 6 })
      .then(res => setLogs(res.data?.results || []))
      .catch(() => {})
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  const unread = logs.filter(l => new Date(l.created_at).getTime() > seenAt).length

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) { const now = Date.now(); writeSeen(now); setSeenAt(now) }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#DDD9D0] bg-[#F7F5F0]/95 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="-ml-1 rounded-[6px] p-1.5 text-[#5A5750] hover:bg-[#ECEAE4] lg:hidden" aria-label="Open menu">
        <Menu className="h-[18px] w-[18px]" />
      </button>

      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-[13.5px] sm:flex">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#BDB8AC]" />}
            <span className={cn('truncate', i === crumbs.length - 1 ? 'font-medium text-[#0E0D0A]' : 'text-[#8A877F]')}>{c}</span>
          </span>
        ))}
      </nav>

      <button
        onClick={() => router.push('/search')}
        className="ml-auto flex h-9 w-full max-w-[300px] items-center gap-2 rounded-[8px] border border-[#DDD9D0] bg-white px-3 text-left text-[13.5px] text-[#8A877F] transition-colors hover:border-[#BDB8AC] sm:ml-6 sm:mr-auto"
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 truncate">Search your documents</span>
        <span className="kbd hidden sm:inline">Ctrl K</span>
      </button>

      <div className="relative flex items-center gap-1.5" ref={panelRef}>
        <button
          onClick={toggle}
          aria-label={unread ? `Activity, ${unread} new` : 'Activity'}
          aria-expanded={open}
          className={cn('relative rounded-[8px] p-2 text-[#5A5750] transition-colors hover:bg-[#ECEAE4]', open && 'bg-[#ECEAE4]')}
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-[#F7F5F0] bg-[#DC2626]" />}
        </button>

        {open && (
          <div className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-[10px] border border-[#DDD9D0] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#ECEAE4] px-4 py-3">
              <span className="text-[14px] font-semibold">Recent activity</span>
              <Link href="/audit-logs" onClick={() => setOpen(false)} className="link text-[13px]">Full audit log</Link>
            </div>
            <ul className="max-h-[320px] overflow-y-auto">
              {logs.length ? logs.map(log => (
                <li key={log.id} className="flex gap-3 border-b border-[#F1EFEA] px-4 py-3 last:border-0">
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', dotColor(String(log.action)))} />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] text-[#0E0D0A]">{describe(log)}</p>
                    <p className="mt-0.5 text-[12px] text-[#8A877F]">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </li>
              )) : (
                <li className="px-4 py-10 text-center text-[13px] text-[#8A877F]">Nothing has happened yet.</li>
              )}
            </ul>
          </div>
        )}

        <button
          onClick={() => router.push('/upload')}
          className="hidden h-9 items-center gap-1.5 rounded-[8px] bg-[#0E0D0A] px-3.5 text-[13.5px] font-medium text-[#F7F5F0] transition-colors hover:bg-[#2B2924] sm:flex"
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
      </div>
    </header>
  )
}

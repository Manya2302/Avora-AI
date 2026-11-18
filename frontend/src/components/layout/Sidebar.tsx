'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { LogOut, Settings, User as UserIcon, ShieldCheck, ChevronsUpDown, X } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { documentsApi, complianceApi, contractsApi } from '@/lib/api'
import Logo from '@/components/shared/Logo'
import { NAV, isActive } from './nav'

type Counts = Partial<Record<'documents' | 'compliance' | 'contracts' | 'risks', number>>

function useNavCounts(enabled: boolean) {
  const [counts, setCounts] = useState<Counts>({})
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = async () => {
      const [docs, comp, con] = await Promise.all([
        documentsApi.list({ limit: '1' }).catch(() => null),
        complianceApi.dashboard().catch(() => null),
        contractsApi.list({ limit: '1' }).catch(() => null),
      ])
      if (!alive) return
      const next: Counts = {}
      if (docs?.data) next.documents = docs.data.count ?? docs.data.length ?? 0
      if (comp?.data) {
        next.risks = comp.data.recent_risks?.length || 0
        next.compliance = comp.data.missing_docs || 0
      }
      if (con?.data) next.contracts = con.data.count ?? con.data.length ?? 0
      setCounts(next)
    }
    load()
    // Counts change when uploads finish processing; a minute is plenty.
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [enabled])
  return counts
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const counts = useNavCounts(!!user)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { onClose() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* mobile backdrop */}
      <div
        onClick={onClose}
        className={cn('fixed inset-0 z-30 bg-[#0E0D0A]/30 transition-opacity lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[#DDD9D0] bg-[#FBFAF7] transition-transform duration-200',
          'lg:static lg:z-auto lg:translate-x-0',
          open ? 'translate-x-0 shadow-lg' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/dashboard" aria-label="Avora home"><Logo size="sm" /></Link>
          <button onClick={onClose} className="rounded-[6px] p-1 text-[#8A877F] hover:bg-[#ECEAE4] lg:hidden" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
          {NAV.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
              {group.label && <div className="mb-1 px-2 text-[11.5px] font-medium text-[#8A877F]">{group.label}</div>}
              <ul className="space-y-px">
                {group.items.map(item => {
                  const active = isActive(pathname, item.href)
                  const count = item.countKey ? counts[item.countKey] : undefined
                  const showCount = count !== undefined && (item.countKey === 'documents' || count > 0)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex h-8 items-center gap-2.5 rounded-[6px] px-2 text-[13.5px] transition-colors',
                          active ? 'bg-[#ECEAE4] font-medium text-[#0E0D0A]' : 'text-[#5A5750] hover:bg-[#F1EFEA] hover:text-[#0E0D0A]'
                        )}
                      >
                        <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#1A3DAF]' : 'text-[#8A877F]')} strokeWidth={1.75} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {showCount && (
                          <span className={cn(
                            'text-[11.5px] tabular-nums',
                            item.countKey === 'risks' ? 'font-medium text-[#B91C1C]' : 'text-[#8A877F]'
                          )}>
                            {count}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <UserMenu />
      </aside>
    </>
  )
}

function UserMenu() {
  const { user, logout } = useAuthStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [])

  const name = user?.full_name || user?.email || ''
  return (
    <div ref={ref} className="relative border-t border-[#DDD9D0] p-2">
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 overflow-hidden rounded-[8px] border border-[#DDD9D0] bg-white py-1 shadow-lg">
          <MenuLink href="/profile" icon={UserIcon}>Profile</MenuLink>
          <MenuLink href="/settings" icon={Settings}>Settings</MenuLink>
          {user?.role === 'admin' && <MenuLink href="/securevault-admin/dashboard" icon={ShieldCheck}>Admin console</MenuLink>}
          <div className="my-1 h-px bg-[#ECEAE4]" />
          <button onClick={logout} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px] text-[#B91C1C] hover:bg-[#FCEFEF]">
            <LogOut className="h-4 w-4" strokeWidth={1.75} /> Sign out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-[8px] p-2 text-left hover:bg-[#F1EFEA]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1A3DAF] text-[12px] font-medium text-white">
          {name ? getInitials(name) : '·'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-[#0E0D0A]">{user?.full_name || 'Your account'}</span>
          <span className="block truncate text-[12px] text-[#8A877F]">{user?.email}</span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[#8A877F]" />
      </button>
    </div>
  )
}

function MenuLink({ href, icon: Icon, children }: { href: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-3 py-2 text-[13.5px] text-[#2B2924] hover:bg-[#F7F5F0]">
      <Icon className="h-4 w-4 text-[#8A877F]" strokeWidth={1.75} /> {children}
    </Link>
  )
}

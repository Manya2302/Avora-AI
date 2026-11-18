'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LayoutDashboard, Users, FileText, Shield, Database, ClipboardList, Settings, LogOut, Brain, CheckSquare, Sparkles, BookOpen, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { adminApi } from '@/lib/api'
import Logo from '@/components/shared/Logo'

const nav = [
  { href:'/securevault-admin/dashboard',        label:'Dashboard',        icon:LayoutDashboard, group:'overview' },
  { href:'/securevault-admin/users',            label:'Users',            icon:Users,           group:'management', countKey:'total_users' },
  { href:'/securevault-admin/documents',        label:'Documents',        icon:FileText,        group:'management', countKey:'total_documents' },
  { href:'/securevault-admin/security',         label:'Security',         icon:Shield,          group:'security',   countKey:'security_alerts', badgeRed:true },
  { href:'/securevault-admin/audits',           label:'Audit log',        icon:ClipboardList,   group:'security' },
  { href:'/securevault-admin/ai-monitor',       label:'AI health',        icon:Brain,           group:'ai' },
  { href:'/securevault-admin/compliance',       label:'Compliance',       icon:CheckSquare,     group:'compliance' },
  { href:'/securevault-admin/ai-governance',    label:'AI governance',    icon:Sparkles,         group:'copilot' },
  { href:'/securevault-admin/prompt-management',label:'Prompts',          icon:BookOpen,        group:'copilot' },
  { href:'/securevault-admin/storage',          label:'Storage',          icon:Database,        group:'infra' },
  { href:'/securevault-admin/settings',         label:'System',           icon:Settings,        group:'infra' },
]
const groups: Array<{key:string;label:string}> = [
  { key:'overview',    label:'Overview' },
  { key:'management',  label:'Management' },
  { key:'security',    label:'Security' },
  { key:'ai',          label:'AI' },
  { key:'compliance',  label:'Compliance' },
  { key:'copilot',     label:'Copilot' },
  { key:'infra',       label:'Infrastructure' },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const { logout, user } = useAuthStore()
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  useEffect(() => { adminApi.dashboard().then(r => setCounts(r.data)).catch(() => setCounts(null)) }, [])
  const badgeFor = (item: any): string | null => {
    const n = item.countKey && counts ? counts[item.countKey] : undefined
    if (typeof n !== 'number') return null
    if (item.badgeRed && n === 0) return null
    return n.toLocaleString('en-IN')
  }
  const name = user?.full_name || user?.email || 'Admin'
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('') || 'A'
  return (
    <aside className="flex shrink-0 flex-col border-b border-[#DDD9D0] bg-[#FBFAF7] lg:w-[248px] lg:border-b-0 lg:border-r">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link href="/securevault-admin/dashboard" aria-label="Avora admin home"><Logo size="sm" /></Link>
        <span className="rounded-[5px] bg-[#0E0D0A] px-1.5 py-0.5 text-[11px] font-medium leading-none text-[#F7F5F0]">Admin</span>
        <Link href="/dashboard" className="ml-auto text-[12.5px] text-[#8A877F] hover:text-[#0E0D0A] lg:hidden">Back to Avora</Link>
        <button onClick={logout} aria-label="Sign out" title="Sign out" className="rounded-[6px] p-1.5 text-[#8A877F] transition-colors hover:bg-[#FCEFEF] hover:text-[#B91C1C] lg:hidden">
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      {/* phone / tablet: one scrollable row of links */}
      <nav className="overflow-x-auto px-3 pb-2 lg:hidden" aria-label="Admin">
        <ul className="flex min-w-max gap-1">
          {nav.map(item => {
            const active = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-[6px] px-2.5 text-[13px] transition-colors',
                    active ? 'bg-[#ECEAE4] font-medium text-[#0E0D0A]' : 'text-[#5A5750] hover:bg-[#F1EFEA] hover:text-[#0E0D0A]'
                  )}
                >
                  <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#1A3DAF]' : 'text-[#8A877F]')} strokeWidth={1.75} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* desktop: grouped list */}
      <nav className="hidden flex-1 overflow-y-auto px-3 pb-4 pt-1 lg:block" aria-label="Admin">
        {groups.map((group, gi) => {
          const items = nav.filter(n => n.group === group.key)
          if (!items.length) return null
          return (
            <div key={group.key} className={gi > 0 ? 'mt-5' : ''}>
              <div className="mb-1 px-2 text-[11.5px] font-medium text-[#8A877F]">{group.label}</div>
              <ul className="space-y-px">
                {items.map(item => {
                  const active = pathname === item.href
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
                        {badgeFor(item) && (
                          <span className={cn('text-[11.5px] tabular-nums', (item as any).badgeRed ? 'font-medium text-[#B91C1C]' : 'text-[#8A877F]')}>
                            {badgeFor(item)}
                          </span>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="hidden border-t border-[#DDD9D0] p-2 lg:block">
        <Link href="/dashboard" className="mb-1 flex h-8 items-center gap-2.5 rounded-[6px] px-2 text-[13.5px] text-[#5A5750] hover:bg-[#F1EFEA] hover:text-[#0E0D0A]">
          <ArrowLeft className="h-4 w-4 text-[#8A877F]" strokeWidth={1.75} /> Back to Avora
        </Link>
        <div className="flex items-center gap-2.5 rounded-[8px] p-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0E0D0A] text-[12px] font-medium text-[#F7F5F0]">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium text-[#0E0D0A]" title={name}>{name}</span>
            <span className="block truncate text-[12px] text-[#8A877F]" title={user?.email}>{user?.full_name && user?.email ? user.email : 'Admin console'}</span>
          </span>
          <button onClick={logout} aria-label="Sign out" title="Sign out" className="rounded-[6px] p-1.5 text-[#8A877F] transition-colors hover:bg-[#FCEFEF] hover:text-[#B91C1C]">
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  )
}

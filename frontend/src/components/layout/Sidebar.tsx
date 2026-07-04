'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Upload, Search, ClipboardList, User, Settings, Shield, LogOut, Folder, Sparkles, CheckSquare, FileSignature, AlertTriangle, MessageSquare, Network, LayoutGrid } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const nav = [
  { href:'/dashboard',    label:'Dashboard',          icon:LayoutDashboard, group:'main' },
  { href:'/documents',    label:'Documents',           icon:FileText,        group:'main', badge:'1,284' },
  { href:'/upload',       label:'Upload',              icon:Upload,          group:'main' },
  { href:'/search',       label:'AI Search',           icon:Search,          group:'main' },
  { href:'/collections',  label:'Smart Collections',   icon:Folder,          group:'ai',  tag:'P2' },
  { href:'/analytics',    label:'AI Activity',         icon:Sparkles,        group:'ai',  tag:'P2' },
  { href:'/compliance',   label:'Compliance',          icon:CheckSquare,     group:'compliance', tag:'P3' },
  { href:'/contracts',    label:'Contracts',           icon:FileSignature,   group:'compliance', tag:'P3' },
  { href:'/risk',         label:'Risk Dashboard',      icon:AlertTriangle,   group:'compliance', tag:'P3' },
  { href:'/copilot',      label:'Avora Copilot',       icon:Sparkles,        group:'copilot', tag:'P4' },
  { href:'/copilot/workspace', label:'AI Workspace',   icon:LayoutGrid,      group:'copilot', tag:'P4' },
  { href:'/knowledge',    label:'Knowledge Explorer',  icon:Network,         group:'copilot', tag:'P4' },
  { href:'/audit-logs',   label:'Audit Logs',          icon:ClipboardList,   group:'security' },
  { href:'/profile',      label:'Profile',             icon:User,            group:'account' },
  { href:'/settings',     label:'Settings',            icon:Settings,        group:'account' },
]
const groups = [
  { key:'main',       label:'Main' },
  { key:'ai',         label:'AI · Phase 2' },
  { key:'compliance', label:'Compliance · Phase 3' },
  { key:'copilot',    label:'Copilot · Phase 4' },
  { key:'security',   label:'Security' },
  { key:'account',    label:'Account' },
]
const TAG_COLORS: Record<string,string> = {
  P2:'bg-purple-500/25 text-purple-400 border border-purple-500/20',
  P3:'bg-green-500/25 text-green-400 border border-green-500/20',
  P4:'bg-[#7B9FE8]/25 text-[#7B9FE8] border border-[#7B9FE8]/30',
}

export default function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  return (
    <aside className="w-[228px] min-w-[228px] bg-[#0C0B09] flex flex-col overflow-hidden">
      <div className="px-4 py-4 flex items-center gap-2.5 border-b border-white/5">
        <div className="w-7 h-7 bg-white/7 rounded-[7px] flex items-center justify-center border border-white/10"><Shield className="w-3.5 h-3.5 text-white/70"/></div>
        <span className="font-display font-bold text-[15px] text-white/85">Avora <span className="text-[#7B9FE8]">AI</span></span>
        <span className="font-mono text-[8px] text-[#7B9FE8] bg-[#7B9FE8]/15 px-1.5 py-0.5 rounded-full border border-[#7B9FE8]/20 ml-auto">Phase 4</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-3">
        {groups.map(group => {
          const items = nav.filter(n => n.group === group.key)
          if (!items.length) return null
          return (
            <div key={group.key}>
              <div className="font-mono text-[8.5px] font-medium tracking-[2.2px] uppercase text-white/20 px-2 mb-1">{group.label}</div>
              {items.map(item => {
                const active = item.href==='/dashboard' ? pathname==='/dashboard' : pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href}
                    className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] mb-0.5 border transition-all',
                      active?'bg-[#1A3DAF]/18 border-[#1A3DAF]/25':'border-transparent hover:bg-white/4')}>
                    <item.icon className={cn('w-3.5 h-3.5 flex-shrink-0', active?'text-white/80':'text-white/30')}/>
                    <span className={cn('text-[12.5px] font-normal flex-1', active?'text-white/88':'text-white/40')}>{item.label}</span>
                    {(item as any).badge && <span className="font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#1A3DAF]/30 text-[#7B9FE8]">{(item as any).badge}</span>}
                    {(item as any).tag && <span className={cn('font-mono text-[7.5px] font-bold px-1.5 py-0.5 rounded-full', TAG_COLORS[(item as any).tag])}>{(item as any).tag}</span>}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="p-2.5 border-t border-white/5">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] hover:bg-white/4 cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-[#1A3DAF] flex items-center justify-center text-white font-display font-bold text-[11px]">
            {user ? getInitials(user.full_name || user.email) : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-medium text-white/75 truncate">{user?.full_name || user?.email || 'Loading…'}</div>
            <div className="font-mono text-[9px] text-white/28 capitalize">{user?.profile?.plan||'free'} · P4</div>
          </div>
          <button onClick={logout} className="text-white/20 hover:text-red-400 transition-colors p-0.5"><LogOut className="w-3.5 h-3.5"/></button>
        </div>
      </div>
    </aside>
  )
}

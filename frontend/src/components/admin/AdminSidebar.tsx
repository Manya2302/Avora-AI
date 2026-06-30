'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, FileText, Shield, Database, ClipboardList, Settings, LogOut, Brain, CheckSquare, Sparkles, BookOpen, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const nav = [
  { href:'/securevault-admin/dashboard',        label:'Dashboard',        icon:LayoutDashboard, group:'overview' },
  { href:'/securevault-admin/users',            label:'User Management',  icon:Users,           group:'management', badge:'2,841' },
  { href:'/securevault-admin/documents',        label:'Documents',        icon:FileText,        group:'management', badge:'148K' },
  { href:'/securevault-admin/security',         label:'Security Monitor', icon:Shield,          group:'security',   badge:'3', badgeRed:true },
  { href:'/securevault-admin/audits',           label:'Audit Monitor',    icon:ClipboardList,   group:'security' },
  { href:'/securevault-admin/ai-monitor',       label:'AI Health',        icon:Brain,           group:'ai',        tag:'P2' },
  { href:'/securevault-admin/compliance',       label:'Compliance',       icon:CheckSquare,     group:'compliance', tag:'P3' },
  { href:'/securevault-admin/ai-governance',    label:'AI Governance',    icon:Sparkles,         group:'copilot',   tag:'P4' },
  { href:'/securevault-admin/prompt-management',label:'Prompt Management',icon:BookOpen,        group:'copilot',   tag:'P4' },
  { href:'/securevault-admin/storage',          label:'Storage Monitor',  icon:Database,        group:'infra' },
  { href:'/securevault-admin/settings',         label:'System Settings',  icon:Settings,        group:'infra' },
]
const groups: Array<{key:string;label:string}> = [
  { key:'overview',    label:'Overview' },
  { key:'management',  label:'Management' },
  { key:'security',    label:'Security' },
  { key:'ai',          label:'Avora AI · P2' },
  { key:'compliance',  label:'Compliance · P3' },
  { key:'copilot',     label:'Copilot · P4' },
  { key:'infra',       label:'Infrastructure' },
]
const TAG_COLORS: Record<string,string> = {
  P2:'bg-purple-500/25 text-purple-400 border border-purple-500/20',
  P3:'bg-green-500/25 text-green-400 border border-green-500/20',
  P4:'bg-[#7B9FE8]/25 text-[#7B9FE8] border border-[#7B9FE8]/30',
}

export default function AdminSidebar() {
  const pathname = usePathname()
  const { logout } = useAuthStore()
  return (
    <aside className="w-[228px] min-w-[228px] bg-[#0A0F1E] flex flex-col overflow-hidden relative">
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#3B5BDB]/8 rounded-full blur-3xl pointer-events-none"/>
      <div className="px-4 py-4 flex items-center gap-2.5 border-b border-white/5">
        <div className="w-7 h-7 bg-white/7 rounded-[7px] flex items-center justify-center border border-white/10"><Shield className="w-3.5 h-3.5 text-white/70"/></div>
        <span className="font-display font-bold text-[14px] text-white/85">Avora <span className="text-[#7B9FE8]">AI</span></span>
        <span className="font-mono text-[8px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full border border-amber-400/20 ml-auto">Admin</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-3 relative z-10 space-y-3">
        {groups.map(group => {
          const items = nav.filter(n => n.group === group.key)
          if (!items.length) return null
          return (
            <div key={group.key}>
              <div className="font-mono text-[8.5px] font-medium tracking-[2.2px] uppercase text-white/20 px-2 mb-1">{group.label}</div>
              {items.map(item => {
                const active = pathname === item.href
                return (
                  <Link key={item.href} href={item.href}
                    className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] mb-0.5 border transition-all',
                      active ? 'bg-[#3B5BDB]/20 border-[#3B5BDB]/28' : 'border-transparent hover:bg-white/4')}>
                    <item.icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white/80' : 'text-white/30')}/>
                    <span className={cn('text-[12.5px] flex-1', active ? 'text-white/88' : 'text-white/40')}>{item.label}</span>
                    {(item as any).badge && <span className={cn('font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded-full', (item as any).badgeRed ? 'bg-red-500/25 text-red-400' : 'bg-[#3B5BDB]/30 text-[#7B9FE8]')}>{(item as any).badge}</span>}
                    {(item as any).tag && <span className={cn('font-mono text-[7.5px] font-bold px-1.5 py-0.5 rounded-full', TAG_COLORS[(item as any).tag])}>{(item as any).tag}</span>}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
      <div className="p-2.5 border-t border-white/5 relative z-10">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] hover:bg-white/4 cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-[#3B5BDB] flex items-center justify-center font-display font-bold text-[10px] text-white">SA</div>
          <div className="flex-1"><div className="text-[12px] font-medium text-white/75">Super Admin</div><div className="font-mono text-[9px] text-white/28">avora-admin · P4</div></div>
          <button onClick={logout} className="text-white/20 hover:text-red-400 transition-colors"><LogOut className="w-3.5 h-3.5"/></button>
        </div>
      </div>
    </aside>
  )
}

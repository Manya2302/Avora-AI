'use client'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, HelpCircle, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

const titles: Record<string, { title: string; crumb: string }> = {
  '/dashboard':    { title: 'Dashboard',          crumb: 'Overview' },
  '/documents':    { title: 'Document Library',   crumb: 'All Documents' },
  '/upload':       { title: 'Upload Files',        crumb: 'New Upload' },
  '/search':       { title: 'Orivo Search',        crumb: 'AI Search' },
  '/audit-logs':   { title: 'Audit Logs',          crumb: 'Security Logs' },
  '/profile':      { title: 'User Profile',        crumb: 'My Profile' },
  '/settings':     { title: 'Account Settings',    crumb: 'Settings' },
}

export default function Topbar() {
  const router   = useRouter()
  const pathname = usePathname()
  const meta     = titles[pathname] || { title: 'SecureVault AI', crumb: '' }

  return (
    <header className="h-14 bg-white border-b border-[#DDD9D0] flex items-center px-5 gap-4 z-10">
      <div>
        <div className="font-display text-[15.5px] font-semibold tracking-tight text-[#0E0D0A]">{meta.title}</div>
        <div className="text-[11.5px] text-[#9B9890]">SecureVault › <span className="text-[#0E0D0A] font-medium">{meta.crumb}</span></div>
      </div>

      <div className="flex-1 max-w-xs ml-6">
        <div
          onClick={() => router.push('/search')}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#F7F5F0] border border-[#DDD9D0] rounded-[7px] cursor-pointer hover:border-[#1A3DAF]/40 transition-colors">
          <svg className="w-3.5 h-3.5 text-[#9B9890]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <span className="text-[13px] text-[#9B9890] font-light">Ask Orivo anything…</span>
          <span className="font-mono text-[9px] text-[#9B9890] bg-[#ECEAE4] px-1.5 py-0.5 rounded ml-auto">⌘K</span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="w-8 h-8 rounded-[7px] flex items-center justify-center hover:bg-[#F7F5F0] transition-colors relative">
          <Bell className="w-4 h-4 text-[#9B9890]" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white" />
        </button>
        <button className="w-8 h-8 rounded-[7px] flex items-center justify-center hover:bg-[#F7F5F0] transition-colors">
          <HelpCircle className="w-4 h-4 text-[#9B9890]" />
        </button>
        <button onClick={() => router.push('/upload')}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0E0D0A] text-[#F7F5F0] rounded-[7px] text-[12.5px] font-medium hover:bg-[#252318] transition-colors">
          <Upload className="w-3 h-3" /> Upload
        </button>
      </div>
    </header>
  )
}

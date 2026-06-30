'use client'
import { usePathname } from 'next/navigation'
import { Bell, AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'

const titles: Record<string, string> = {
  '/securevault-admin/dashboard': 'Admin Dashboard',
  '/securevault-admin/users':     'User Management',
  '/securevault-admin/documents': 'Document Management',
  '/securevault-admin/security':  'Security Monitor',
  '/securevault-admin/storage':   'Storage Monitor',
  '/securevault-admin/audits':    'Audit Monitor',
  '/securevault-admin/settings':  'System Settings',
}

export default function AdminTopbar() {
  const pathname = usePathname()
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-IN', { hour12: false }) + ' IST')
    update(); const t = setInterval(update, 1000); return () => clearInterval(t)
  }, [])

  return (
    <header className="h-14 bg-white border-b border-[#DDD9D0] flex items-center px-5 gap-4 z-10">
      <div>
        <div className="font-display text-[15px] font-semibold tracking-tight text-[#0E0D0A]">{titles[pathname] || 'Admin Panel'}</div>
        <div className="text-[11px] text-[#9B9890]">Admin › <span className="text-[#0E0D0A] font-medium">{titles[pathname]?.split(' ').pop()}</span></div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="font-mono text-[11px] text-[#9B9890] px-2.5 py-1 bg-[#F7F5F0] border border-[#ECEAE4] rounded-full">{time}</span>
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] font-semibold px-2.5 py-1 rounded-full bg-red-50 border border-red-100 text-red-600">
          <AlertTriangle className="w-3 h-3" /> 3 Security Alerts
        </span>
        <button className="w-8 h-8 rounded-[7px] flex items-center justify-center hover:bg-[#F7F5F0] relative">
          <Bell className="w-4 h-4 text-[#9B9890]" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white" />
        </button>
      </div>
    </header>
  )
}

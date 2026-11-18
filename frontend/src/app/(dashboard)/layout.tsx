'use client'
import { useCallback, useState } from 'react'
import { useRequireAuth } from '@/hooks/useAuth'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useRequireAuth()
  const [navOpen, setNavOpen] = useState(false)
  const closeNav = useCallback(() => setNavOpen(false), [])

  if (!isLoggedIn) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F5F0] text-[13px] text-[#8A877F]">
        Loading your workspace…
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F5F0]">
      <Sidebar open={navOpen} onClose={closeNav} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  )
}

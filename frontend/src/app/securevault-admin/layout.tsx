'use client'
import { useRequireAdmin } from '@/hooks/useAuth'
import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminTopbar from '@/components/admin/AdminTopbar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useRequireAdmin()
  if (!isAdmin) return null
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F7F5F0] lg:flex-row">
      <AdminSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  )
}

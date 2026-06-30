'use client'
import { useRequireAdmin } from '@/hooks/useAuth'
import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminTopbar from '@/components/admin/AdminTopbar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useRequireAdmin()
  if (!isAdmin) return null
  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F5F0]">
      <AdminSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { isAuthenticated } from '@/lib/auth'

export function useRequireAuth() {
  const router = useRouter()
  const { user, fetchMe } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login')
      return
    }
    if (!user) fetchMe()
  }, [user, router, fetchMe])

  return { user, isLoggedIn: !!user }
}

export function useRequireAdmin() {
  const router = useRouter()
  const { user, fetchMe } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/securevault-admin/login'); return }
    if (!user) { fetchMe(); return }
    if (user.role !== 'admin') router.replace('/dashboard')
  }, [user, router, fetchMe])

  return { user, isAdmin: user?.role === 'admin' }
}

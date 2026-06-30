import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '@/types'
import { setTokens, clearTokens } from '@/lib/auth'
import { authApi, usersApi } from '@/lib/api'

interface AuthState {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  setUser: (user: User | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const { data } = await authApi.login({ email, password })
          setTokens(data.access, data.refresh)
          const { data: me } = await usersApi.me()
          set({ user: me, isLoading: false })
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      logout: async () => {
        try {
          const { data } = await usersApi.getSessions().catch(() => ({ data: { results: [] } }))
        } catch {}
        clearTokens()
        set({ user: null })
        window.location.href = '/login'
      },

      fetchMe: async () => {
        try {
          const { data } = await usersApi.me()
          set({ user: data })
        } catch {
          clearTokens()
          set({ user: null })
        }
      },

      setUser: (user) => set({ user }),
    }),
    { name: 'sv-auth', partialize: (state) => ({ user: state.user }) }
  )
)

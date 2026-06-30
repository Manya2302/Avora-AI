'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Shield, AlertTriangle } from 'lucide-react'
import { authApi } from '@/lib/api'
import { setTokens } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'

export default function AdminLoginPage() {
  const router = useRouter()
  const { fetchMe } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit } = useForm<{ email: string; password: string }>()

  const onSubmit = async (data: { email: string; password: string }) => {
    setLoading(true)
    try {
      const { data: res } = await authApi.login(data)
      setTokens(res.access, res.refresh)
      await fetchMe()
      router.push('/securevault-admin/dashboard')
    } catch { toast.error('Invalid admin credentials.') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#3B5BDB]/12 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="w-full max-w-sm relative z-10">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-white/6 rounded-[11px] flex items-center justify-center border border-white/10"><Shield className="w-5 h-5 text-white/75" /></div>
          <span className="font-display font-bold text-xl text-white/88">SecureVault <span className="text-[#7B9FE8]">AI</span></span>
          <span className="font-mono text-[9px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">Admin</span>
        </div>
        <h1 className="font-display text-3xl font-bold text-white/92 text-center mb-2">Admin Portal</h1>
        <p className="text-sm font-light text-white/38 text-center mb-8">Restricted access — authorised personnel only</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="font-mono text-[10px] font-medium tracking-[1.5px] uppercase text-white/30 mb-1.5 block">Admin Username</label>
            <input {...register('email')} type="email" placeholder="admin@securevault.ai"
              className="w-full px-3 py-3 bg-white/4 border border-white/10 rounded-[7px] text-sm font-light text-white/88 outline-none focus:border-[#3B5BDB]/60 focus:bg-[#3B5BDB]/5 placeholder:text-white/20" />
          </div>
          <div>
            <label className="font-mono text-[10px] font-medium tracking-[1.5px] uppercase text-white/30 mb-1.5 block">Admin Password</label>
            <input {...register('password')} type="password" placeholder="••••••••••••"
              className="w-full px-3 py-3 bg-white/4 border border-white/10 rounded-[7px] text-sm font-light text-white/88 outline-none focus:border-[#3B5BDB]/60 focus:bg-[#3B5BDB]/5 placeholder:text-white/20" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-[#3B5BDB] text-white font-medium text-sm rounded-[7px] hover:bg-[#2d4fc9] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
            {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Authenticating…</> : <><Shield className="w-4 h-4" />Access Admin Panel</>}
          </button>
        </form>
        <div className="flex items-start gap-2 mt-5 p-3 bg-amber-500/8 border border-amber-500/18 rounded-[9px]">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400/80 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] font-light text-amber-400/75">All admin activity is logged and monitored. Unauthorised access is a criminal offence.</p>
        </div>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { authApi } from '@/lib/api'
import { setTokens } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'
import Logo from '@/components/shared/Logo'

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
    } catch { toast.error('That email and password don’t match an admin account.') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F5F0] px-6 py-8 sm:px-12">
      <Link href="/" className="inline-flex items-center gap-2 self-start" aria-label="Avora home">
        <Logo />
        <span className="rounded-[5px] bg-[#0E0D0A] px-1.5 py-0.5 text-[11px] font-medium leading-none text-[#F7F5F0]">Admin</span>
      </Link>

      <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
        <h1 className="font-display text-[30px] font-semibold leading-tight text-[#0E0D0A]">Admin console</h1>
        <p className="mt-2 text-[14.5px] text-[#5A5750]">Sign in with an administrator account to manage this Avora workspace.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
          <Input label="Admin email" type="email" autoComplete="username" placeholder="admin@yourfirm.com" {...register('email')} />
          <Input label="Password" type="password" autoComplete="current-password" {...register('password')} />
          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
            {loading ? 'Signing in…' : 'Sign in to admin console'}
          </Button>
        </form>

        <div className="mt-6 flex items-start gap-2.5 rounded-[8px] border border-[#ECEAE4] bg-white p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#A35A04]" strokeWidth={1.75} />
          <p className="text-[12.5px] text-[#5A5750]">Every admin action is recorded in the audit log. Access is limited to authorised staff.</p>
        </div>

        <p className="mt-8 text-[14px] text-[#5A5750]">
          Not an admin? <Link href="/login" className="link font-medium">Go to the regular sign-in</Link>
        </p>
      </div>
    </div>
  )
}

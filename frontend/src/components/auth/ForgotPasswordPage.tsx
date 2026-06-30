'use client'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { authApi } from '@/lib/api'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit } = useForm<{ email: string }>()

  const onSubmit = async ({ email }: { email: string }) => {
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      toast.success('OTP sent! Check your inbox.')
      router.push(`/verify-otp?email=${encodeURIComponent(email)}`)
    } catch { toast.error('Something went wrong.') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] p-6">
      <div className="w-full max-w-sm bg-white border border-[#DDD9D0] rounded-[16px] p-8">
        <p className="font-mono text-[10px] tracking-[2px] uppercase text-[#1A3DAF] mb-3">Account recovery</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#0E0D0A] mb-2">Forgot password?</h1>
        <p className="text-sm font-light text-[#5A5750] mb-7">Enter your registered email and we'll send a one-time password.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Registered Email" type="email" placeholder="you@company.com" hint="We'll send a 6-digit OTP to this address." {...register('email', { required: true })} />
          <Button type="submit" loading={loading} className="w-full justify-center py-3">Send OTP →</Button>
        </form>
      </div>
    </div>
  )
}

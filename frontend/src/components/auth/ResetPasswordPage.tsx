'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
import { authApi } from '@/lib/api'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'

const schema = z.object({
  new_password: z.string().min(8),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, { message: "Passwords don't match", path: ['confirm_password'] })

export default function ResetPasswordPage() {
  const router = useRouter()
  const params = useSearchParams()
  const email  = params.get('email') || ''
  const otp    = params.get('otp') || ''
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async (data: any) => {
    setLoading(true)
    try {
      await authApi.resetPassword({ email, otp_code: otp, ...data })
      toast.success('Password reset! Signing you in…')
      router.push('/login')
    } catch { toast.error('Reset failed. Try again.') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] p-6">
      <div className="w-full max-w-sm bg-white border border-[#DDD9D0] rounded-[16px] p-8">
        <p className="font-mono text-[10px] tracking-[2px] uppercase text-[#1A3DAF] mb-3">New password</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#0E0D0A] mb-2">Create new password</h1>
        <p className="text-sm font-light text-[#5A5750] mb-7">Choose a strong password you haven't used before.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="relative">
            <Input label="New Password" type={showPw ? 'text' : 'password'} placeholder="Min 8 characters" error={errors.new_password?.message} {...register('new_password')} className="pr-10" />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-[30px] text-[#9B9890]">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Input label="Confirm Password" type="password" placeholder="Repeat new password" error={errors.confirm_password?.message} {...register('confirm_password')} />
          <Button type="submit" loading={loading} className="w-full justify-center py-3">Update Password & Sign In 🔒</Button>
        </form>
      </div>
    </div>
  )
}

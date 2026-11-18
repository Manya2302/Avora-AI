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
import Logo from '@/components/shared/Logo'
import Link from 'next/link'

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
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: any) => {
    setLoading(true)
    try {
      await authApi.resetPassword({ email, otp_code: otp, ...data })
      toast.success('Password updated. Sign in with your new password.')
      router.push('/login')
    } catch { toast.error('Reset failed. Try again.') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F5F0] px-6 py-8 sm:px-12">
      <Link href="/" className="inline-flex self-start" aria-label="Avora home"><Logo /></Link>

      <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
        <h1 className="font-display text-[30px] font-semibold leading-tight text-[#0E0D0A]">Choose a new password</h1>
        <p className="mt-2 text-[14.5px] text-[#5A5750]">Use at least 8 characters, and something you haven’t used here before.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
          <div className="relative">
            <Input label="New password" type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" error={errors.new_password?.message} {...register('new_password')} className="pr-10" />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-[37px] text-[#8A877F] hover:text-[#0E0D0A]"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Input label="Confirm password" type="password" autoComplete="new-password" placeholder="Type it again" error={errors.confirm_password?.message} {...register('confirm_password')} />
          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">Update password</Button>
        </form>

        <p className="mt-8 text-[14px] text-[#5A5750]">
          <Link href="/login" className="link font-medium">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}

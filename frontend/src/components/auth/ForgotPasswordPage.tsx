'use client'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { authApi } from '@/lib/api'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'
import Logo from '@/components/shared/Logo'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit } = useForm<{ email: string }>()

  const onSubmit = async ({ email }: { email: string }) => {
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      toast.success('Code sent. Check your inbox.')
      router.push(`/verify-otp?email=${encodeURIComponent(email)}`)
    } catch { toast.error('Something went wrong.') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F5F0] px-6 py-8 sm:px-12">
      <Link href="/" className="inline-flex self-start" aria-label="Avora home"><Logo /></Link>

      <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
        <h1 className="font-display text-[30px] font-semibold leading-tight text-[#0E0D0A]">Reset your password</h1>
        <p className="mt-2 text-[14.5px] text-[#5A5750]">Enter the email you signed up with and we’ll send you a 6-digit code.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
          <Input label="Email" type="email" autoComplete="email" placeholder="you@yourfirm.com" hint="The code expires after 10 minutes." {...register('email', { required: true })} />
          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">Send code</Button>
        </form>

        <p className="mt-8 text-[14px] text-[#5A5750]">
          Remembered it? <Link href="/login" className="link font-medium">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}

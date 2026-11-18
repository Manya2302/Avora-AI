'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'
import Logo from '@/components/shared/Logo'

const schema = z.object({
  email: z.string().email('Enter the email you signed up with'),
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuthStore()
  const [showPw, setShowPw] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    try {
      await login(data.email, data.password)
      router.push('/dashboard')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'That email and password don’t match.')
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(440px,0.9fr)]">
      {/* form side */}
      <div className="flex flex-col bg-[#F7F5F0] px-6 py-8 sm:px-12">
        <Link href="/" className="inline-flex self-start" aria-label="Avora home"><Logo /></Link>

        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-[30px] font-semibold leading-tight">Sign in</h1>
          <p className="mt-2 text-[14.5px] text-[#5A5750]">Welcome back. Your documents are where you left them.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4" noValidate>
            <Input label="Email" type="email" autoComplete="email" placeholder="you@yourfirm.com" error={errors.email?.message} {...register('email')} />
            <div className="relative">
              <Input
                label="Password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                error={errors.password?.message}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-[37px] text-[#8A877F] hover:text-[#0E0D0A]"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between pt-1 text-[13.5px]">
              <label className="flex cursor-pointer items-center gap-2 text-[#5A5750]">
                <input type="checkbox" className="h-4 w-4 accent-[#1A3DAF]" {...register('remember')} /> Keep me signed in
              </label>
              <Link href="/forgot-password" className="link">Forgot password?</Link>
            </div>
            <Button type="submit" size="lg" loading={isLoading} className="mt-2 w-full">Sign in</Button>
          </form>

          <p className="mt-8 text-[14px] text-[#5A5750]">
            New to Avora? <Link href="/register" className="link font-medium">Create an account</Link>
          </p>
        </div>

        <p className="text-[12.5px] text-[#8A877F]">Every sign-in is recorded in your organisation’s audit log.</p>
      </div>

      {/* context side */}
      <aside className="hidden flex-col justify-between bg-[#0E0D0A] p-12 text-[#F7F5F0] lg:flex">
        <div />
        <div className="max-w-[400px]">
          <p className="font-display text-[26px] leading-snug">
            “Which client engagement letters haven’t been countersigned yet?”
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-[#F7F5F0]/60">
            The kind of question you can ask once your files are in Avora. It reads the documents themselves, so you
            don’t need to remember what anything was called or where it was saved.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-6 border-t border-white/10 pt-6 text-[13px]">
          <div><dt className="text-[#F7F5F0]/50">Encryption</dt><dd className="mt-1">AES-256, per file</dd></div>
          <div><dt className="text-[#F7F5F0]/50">AI model</dt><dd className="mt-1">Runs on your servers</dd></div>
          <div><dt className="text-[#F7F5F0]/50">Access</dt><dd className="mt-1">By team and role</dd></div>
        </dl>
      </aside>
    </div>
  )
}

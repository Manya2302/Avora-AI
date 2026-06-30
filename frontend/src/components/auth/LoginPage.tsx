'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'

const schema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
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
      toast.success('Welcome back!')
      router.push('/dashboard')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Invalid credentials.')
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left panel */}
      <div className="hidden lg:flex bg-[#0C0B09] flex-col p-12 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#1A3DAF]/15 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
        <div className="flex items-center gap-3 mb-auto">
          <div className="w-8 h-8 bg-white/7 rounded-[8px] flex items-center justify-center border border-white/10">
            <Shield className="w-4 h-4 text-white/70" />
          </div>
          <span className="font-display font-bold text-lg text-white/85">SecureVault <span className="text-[#7B9FE8]">AI</span></span>
          <span className="font-mono text-[8px] text-[#7B9FE8] bg-[#1A3DAF]/20 px-2 py-0.5 rounded-full border border-[#7B9FE8]/20">Orivo</span>
        </div>
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <p className="font-mono text-[10px] tracking-[2px] uppercase text-[#7B9FE8] mb-4">Welcome back</p>
          <h2 className="font-display text-4xl font-bold leading-tight text-white/92 mb-4">
            Your most sensitive<br/>documents,<br/><em className="text-[#7B9FE8]">finally</em> under control.
          </h2>
          <p className="text-sm font-light text-white/45 leading-relaxed max-w-sm">
            Sign in to access your encrypted vault. Every session is authenticated, encrypted, and audit-logged.
          </p>
          <div className="mt-10 space-y-3">
            {['AES-256-GCM Encryption','RSA-4096 Key Wrapping','Orivo Semantic Search','Full Audit Logging'].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-[7px] bg-white/5 border border-white/8 flex items-center justify-center">
                  <svg className="w-3 h-3 text-[#7B9FE8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                </div>
                <span className="text-[13px] text-white/55">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs font-light text-white/25 italic relative z-10">
          "SecureVault AI transformed how our firm handles client documents." — Priya Mehra, Managing Partner
        </p>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-8 bg-[#F7F5F0]">
        <div className="w-full max-w-sm">
          <div className="mb-7">
            <p className="font-mono text-[10px] tracking-[1.8px] uppercase text-[#1A3DAF] mb-2">Sign In</p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[#0E0D0A] mb-1.5">Sign in to your vault</h1>
            <p className="text-sm font-light text-[#5A5750]">Enter your credentials to access your secure documents.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label="Email address" type="email" placeholder="you@company.com" error={errors.email?.message} {...register('email')} />
            <div className="relative">
              <Input label="Password" type={showPw ? 'text' : 'password'} placeholder="Your password" error={errors.password?.message} {...register('password')} className="pr-10" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-[30px] text-[#9B9890] hover:text-[#0E0D0A]">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-[#5A5750] cursor-pointer">
                <input type="checkbox" className="accent-[#1A3DAF]" {...register('remember')} /> Remember me
              </label>
              <Link href="/forgot-password" className="text-sm font-medium text-[#1A3DAF] hover:underline">Forgot password?</Link>
            </div>
            <Button type="submit" loading={isLoading} className="w-full justify-center py-3 text-[14.5px]">Sign In →</Button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-[#9B9890]">
            <div className="flex-1 h-px bg-[#DDD9D0]" /><span>or</span><div className="flex-1 h-px bg-[#DDD9D0]" />
          </div>
          <Button variant="ghost" className="w-full justify-center" onClick={() => router.push('/register')}>Create a new account</Button>
          <div className="mt-5 flex items-center gap-2.5 p-3 bg-white border border-[#ECEAE4] rounded-[11px]">
            <div className="w-7 h-7 bg-green-50 border border-green-200 rounded-[7px] flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#0E0D0A]">Secured by SecureVault AI</p>
              <p className="text-[11px] font-light text-[#9B9890]">256-bit encrypted · JWT · Audit logged</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

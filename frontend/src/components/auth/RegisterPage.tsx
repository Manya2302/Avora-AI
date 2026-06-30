'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { authApi } from '@/lib/api'
import { setTokens } from '@/lib/auth'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'

const schema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  confirm_password: z.string(),
  company_name: z.string().optional(),
  industry: z.string().optional(),
  terms: z.literal(true, { errorMap: () => ({ message: 'You must accept terms' }) }),
}).refine(d => d.password === d.confirm_password, { message: "Passwords don't match", path: ['confirm_password'] })

type FormData = z.infer<typeof schema>

const INDUSTRIES = ['Law Firm','CA / Accounting','Healthcare','Consulting','Startup','Other']

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const { register, handleSubmit, formState: { errors }, trigger, getValues } = useForm<FormData>({ resolver: zodResolver(schema) })

  const nextStep = async () => {
    const fields = step === 1 ? ['full_name','email','password','confirm_password'] : ['company_name','industry']
    const ok = await trigger(fields as any)
    if (ok) setStep(s => s + 1)
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const { data: res } = await authApi.register(data)
      setTokens(res.tokens.access, res.tokens.refresh)
      toast.success('Account created! Welcome to SecureVault AI.')
      router.push('/dashboard')
    } catch (e: any) {
      toast.error(e?.response?.data?.email?.[0] || 'Registration failed.')
    } finally { setLoading(false) }
  }

  const steps = ['Account','Company','Security']

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <Shield className="w-5 h-5 text-[#1A3DAF]" />
          <span className="font-display font-bold text-lg text-[#0E0D0A]">SecureVault <span className="text-[#1A3DAF]">AI</span></span>
        </div>

        {/* Progress */}
        <div className="flex items-center mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border transition-all
                  ${step > i+1 ? 'bg-green-600 border-green-600 text-white' : step === i+1 ? 'bg-[#0E0D0A] border-[#0E0D0A] text-white' : 'border-[#DDD9D0] text-[#9B9890]'}`}>{i+1}</div>
                <span className={`text-xs font-medium ${step === i+1 ? 'text-[#0E0D0A]' : 'text-[#9B9890]'}`}>{s}</span>
              </div>
              {i < steps.length - 1 && <div className="flex-1 h-px bg-[#DDD9D0] mx-3" />}
            </div>
          ))}
        </div>

        <div className="bg-white border border-[#DDD9D0] rounded-[16px] p-7">
          <p className="font-mono text-[10px] tracking-[1.8px] uppercase text-[#1A3DAF] mb-2">Step {step} of 3</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0E0D0A] mb-5">
            {step === 1 ? 'Create your account' : step === 2 ? 'Company details' : 'Security & consent'}
          </h1>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {step === 1 && <>
              <div className="grid grid-cols-2 gap-3">
                <Input label="First Name" placeholder="Rahul" error={errors.full_name?.message} {...register('full_name')} />
                <Input label="Last Name" placeholder="Sharma" />
              </div>
              <Input label="Work Email" type="email" placeholder="rahul@firm.com" error={errors.email?.message} {...register('email')} />
              <div className="relative">
                <Input label="Password" type={showPw ? 'text' : 'password'} placeholder="Min 8 characters" error={errors.password?.message} {...register('password')} className="pr-10" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-[30px] text-[#9B9890]">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Input label="Confirm Password" type="password" placeholder="Repeat password" error={errors.confirm_password?.message} {...register('confirm_password')} />
              <Button type="button" className="w-full justify-center" onClick={nextStep}>Continue to Company Info →</Button>
            </>}
            {step === 2 && <>
              <Input label="Company / Firm Name" placeholder="Sharma & Associates LLP" {...register('company_name')} />
              <div>
                <label className="text-xs font-semibold text-[#0E0D0A] mb-2 block">Industry</label>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRIES.map(ind => (
                    <label key={ind} className="cursor-pointer">
                      <input type="radio" value={ind} className="sr-only peer" {...register('industry')} />
                      <span className="peer-checked:bg-[#EBF0FF] peer-checked:border-[#1A3DAF] peer-checked:text-[#1A3DAF] px-3 py-1.5 rounded-full border border-[#DDD9D0] text-xs text-[#5A5750] hover:border-[#1A3DAF]/50 transition-all">
                        {ind}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" type="button" className="flex-1 justify-center" onClick={() => setStep(1)}>← Back</Button>
                <Button type="button" className="flex-1 justify-center" onClick={nextStep}>Continue →</Button>
              </div>
            </>}
            {step === 3 && <>
              <div className="p-3.5 bg-[#EBF0FF] border border-[#1A3DAF]/15 rounded-[11px]">
                <p className="text-[11px] font-semibold text-[#1A3DAF] mb-1">Your data is protected from day one</p>
                <p className="text-[11px] font-light text-[#1A3DAF]/70">AES-256-GCM · RSA-4096 · Zero-knowledge · Full audit logging</p>
              </div>
              <label className="flex gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5 accent-[#1A3DAF]" {...register('terms')} />
                <span className="text-sm font-light text-[#5A5750]">I agree to the <Link href="#" className="text-[#1A3DAF] underline">Terms of Service</Link> and <Link href="#" className="text-[#1A3DAF] underline">Privacy Policy</Link>. I understand my documents will be encrypted.</span>
              </label>
              {errors.terms && <p className="text-xs text-red-500">{errors.terms.message}</p>}
              <Button type="submit" loading={loading} className="w-full justify-center py-3">Create My Secure Vault 🔒</Button>
              <Button variant="ghost" type="button" className="w-full justify-center" onClick={() => setStep(2)}>← Back</Button>
            </>}
          </form>
        </div>
        <p className="text-center text-sm text-[#9B9890] mt-4">
          Already have an account? <Link href="/login" className="text-[#1A3DAF] font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

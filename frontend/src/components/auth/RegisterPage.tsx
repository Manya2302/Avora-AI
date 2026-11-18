'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
import { authApi } from '@/lib/api'
import { setTokens } from '@/lib/auth'
import Input from '@/components/shared/Input'
import Button from '@/components/shared/Button'
import Logo from '@/components/shared/Logo'

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
      const { data: res } = await authApi.register(data as unknown as Record<string, string>)
      setTokens(res.tokens.access, res.tokens.refresh)
      toast.success('Your account is ready.')
      router.push('/dashboard')
    } catch (e: any) {
      toast.error(e?.response?.data?.email?.[0] || 'Registration failed.')
    } finally { setLoading(false) }
  }

  const steps = ['Account','Company','Security']

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] p-6">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 inline-flex" aria-label="Avora home"><Logo /></Link>

        {/* Progress */}
        <div className="mb-8 flex items-center" aria-label={`Step ${step} of 3`}>
          {steps.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11.5px] font-medium tabular-nums transition-colors
                  ${step > i+1 ? 'border-[#1A3DAF] bg-[#1A3DAF] text-white' : step === i+1 ? 'border-[#0E0D0A] bg-[#0E0D0A] text-white' : 'border-[#DDD9D0] bg-white text-[#8A877F]'}`}>{i+1}</div>
                <span className={`text-[13px] ${step === i+1 ? 'font-medium text-[#0E0D0A]' : 'text-[#8A877F]'}`}>{s}</span>
              </div>
              {i < steps.length - 1 && <div className="mx-3 h-px flex-1 bg-[#DDD9D0]" />}
            </div>
          ))}
        </div>

        <div className="bg-white border border-[#DDD9D0] rounded-[12px] p-7">
          <p className="text-[13px] text-[#8A877F] mb-1">Step {step} of 3</p>
          <h1 className="font-display text-[24px] font-semibold text-[#0E0D0A] mb-5">
            {step === 1 ? 'Create your account' : step === 2 ? 'Company details' : 'Security & consent'}
          </h1>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {step === 1 && <>
              <Input label="Full name" placeholder="Rahul Sharma" autoComplete="name" error={errors.full_name?.message} {...register('full_name')} />
              <Input label="Work email" type="email" placeholder="rahul@firm.com" error={errors.email?.message} {...register('email')} />
              <div className="relative">
                <Input label="Password" type={showPw ? 'text' : 'password'} placeholder="Min 8 characters" error={errors.password?.message} {...register('password')} className="pr-10" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-[37px] text-[#8A877F] hover:text-[#0E0D0A]" aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Input label="Confirm password" type="password" placeholder="Repeat password" error={errors.confirm_password?.message} {...register('confirm_password')} />
              <Button type="button" className="w-full justify-center" onClick={nextStep}>Continue</Button>
            </>}
            {step === 2 && <>
              <Input label="Company or firm name" placeholder="Sharma & Associates LLP" {...register('company_name')} />
              <div>
                <label className="text-[13px] font-medium text-[#2B2924] mb-2 block">Industry</label>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRIES.map(ind => (
                    <label key={ind} className="cursor-pointer">
                      <input type="radio" value={ind} className="sr-only peer" {...register('industry')} />
                      <span className="inline-flex h-8 items-center rounded-[6px] border border-[#DDD9D0] bg-white px-3 text-[13px] text-[#5A5750] transition-colors hover:border-[#BDB8AC] peer-checked:border-[#1A3DAF] peer-checked:bg-[#EEF2FC] peer-checked:text-[#1A3DAF] peer-focus-visible:ring-2 peer-focus-visible:ring-[#1A3DAF]/30">
                        {ind}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" type="button" className="flex-1 justify-center" onClick={() => setStep(1)}>Back</Button>
                <Button type="button" className="flex-1 justify-center" onClick={nextStep}>Continue</Button>
              </div>
            </>}
            {step === 3 && <>
              <p className="text-[14px] leading-relaxed text-[#5A5750]">
                Everything you upload is encrypted with its own key before it is stored, and every access is written to an audit log you can review at any time.
              </p>
              <label className="flex gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#1A3DAF]" {...register('terms')} />
                <span className="text-[14px] text-[#5A5750]">I agree to the <Link href="#" className="link">Terms of Service</Link> and <Link href="#" className="link">Privacy Policy</Link>. I understand my documents will be encrypted.</span>
              </label>
              {errors.terms && <p className="text-[12.5px] text-[#B91C1C]">{errors.terms.message}</p>}
              <Button type="submit" size="lg" loading={loading} className="w-full">Create my account</Button>
              <Button variant="ghost" type="button" className="w-full justify-center" onClick={() => setStep(2)}>Back</Button>
            </>}
          </form>
        </div>
        <p className="mt-6 text-center text-[14px] text-[#5A5750]">
          Already have an account? <Link href="/login" className="link font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

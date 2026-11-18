'use client'
import { useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'
import Button from '@/components/shared/Button'
import Logo from '@/components/shared/Logo'
import Link from 'next/link'

export default function VerifyOtpPage() {
  const router = useRouter()
  const email  = useSearchParams().get('email') || ''
  const [otp, setOtp] = useState(['','','','','',''])
  const [loading, setLoading] = useState(false)
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null))

  const handleInput = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return
    const next = [...otp]; next[i] = val; setOtp(next)
    if (val && i < 5) refs[i+1].current?.focus()
  }
  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs[i-1].current?.focus()
  }

  const verify = async () => {
    const code = otp.join('')
    if (code.length < 6) { toast.error('Enter all 6 digits.'); return }
    setLoading(true)
    try {
      await authApi.verifyOtp({ email, otp_code: code })
      toast.success('Code verified.')
      router.push(`/reset-password?email=${encodeURIComponent(email)}&otp=${code}`)
    } catch { toast.error('That code is wrong or has expired.') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F5F0] px-6 py-8 sm:px-12">
      <Link href="/" className="inline-flex self-start" aria-label="Avora home"><Logo /></Link>

      <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
        <h1 className="font-display text-[30px] font-semibold leading-tight text-[#0E0D0A]">Check your inbox</h1>
        <p className="mt-2 text-[14.5px] text-[#5A5750]">
          We sent a 6-digit code to <span className="font-medium text-[#0E0D0A] break-all">{email}</span>.
        </p>

        <div className="mt-8 flex justify-between gap-2" role="group" aria-label="6-digit code">
          {otp.map((v, i) => (
            <input key={i} ref={refs[i]} maxLength={1} value={v}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${i + 1}`}
              onChange={e => handleInput(i, e.target.value)}
              onKeyDown={e => handleKey(i, e)}
              className="h-12 w-11 min-w-0 rounded-[8px] border border-[#DDD9D0] bg-white text-center text-[20px] font-medium tabular-nums text-[#0E0D0A] outline-none transition-colors hover:border-[#C9C4B9] focus:border-[#1A3DAF] focus:ring-[3px] focus:ring-[#1A3DAF]/10 sm:w-12"
            />
          ))}
        </div>
        <Button onClick={verify} size="lg" loading={loading} className="mt-6 w-full">Verify code</Button>
        <p className="mt-3 text-[12.5px] text-[#8A877F]">The code expires after 10 minutes and works once.</p>

        <p className="mt-8 text-[14px] text-[#5A5750]">
          Didn’t get it? <Link href="/forgot-password" className="link font-medium">Send a new code</Link>
        </p>
      </div>
    </div>
  )
}

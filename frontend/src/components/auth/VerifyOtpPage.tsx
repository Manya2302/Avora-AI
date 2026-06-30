'use client'
import { useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'
import Button from '@/components/shared/Button'

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
      toast.success('OTP verified!')
      router.push(`/reset-password?email=${encodeURIComponent(email)}&otp=${code}`)
    } catch { toast.error('Invalid or expired OTP.') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] p-6">
      <div className="w-full max-w-sm bg-white border border-[#DDD9D0] rounded-[16px] p-8">
        <p className="font-mono text-[10px] tracking-[2px] uppercase text-[#1A3DAF] mb-3">Verification</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#0E0D0A] mb-2">Check your inbox</h1>
        <p className="text-sm font-light text-[#5A5750] mb-8">6-digit OTP sent to <strong className="text-[#0E0D0A]">{email}</strong></p>
        <div className="flex gap-2.5 justify-center mb-6">
          {otp.map((v, i) => (
            <input key={i} ref={refs[i]} maxLength={1} value={v}
              onChange={e => handleInput(i, e.target.value)}
              onKeyDown={e => handleKey(i, e)}
              className="w-12 h-14 text-center font-display text-2xl font-bold bg-[#F7F5F0] border border-[#DDD9D0] rounded-[11px] outline-none focus:border-[#1A3DAF] focus:ring-2 focus:ring-[#1A3DAF]/10 transition-all"
            />
          ))}
        </div>
        <Button onClick={verify} loading={loading} className="w-full justify-center py-3">Verify OTP →</Button>
        <p className="text-center text-xs text-[#9B9890] mt-4">Expires in 10 minutes · One-time use only</p>
      </div>
    </div>
  )
}

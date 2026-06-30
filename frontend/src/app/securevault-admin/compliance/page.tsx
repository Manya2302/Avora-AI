'use client'
import { Shield } from 'lucide-react'
export default function AdminCompliancePage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><Shield className="w-5 h-5 text-[#1A3DAF]"/></div>
        <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Compliance Overview</h2><p className="text-sm text-[#9B9890]">Platform-wide compliance — Phase 3</p></div>
      </div>
      <div className="text-center py-20 bg-white border border-[#DDD9D0] rounded-[16px] text-sm text-[#9B9890]">Start Docker stack to see live compliance metrics.</div>
    </div>
  )
}

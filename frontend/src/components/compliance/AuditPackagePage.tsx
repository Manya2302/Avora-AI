'use client'
import { useEffect, useState } from 'react'
import { Package, CheckCircle2, AlertTriangle, Download, Plus } from 'lucide-react'
import { complianceApi } from '@/lib/api'
import { Card, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import toast from 'react-hot-toast'
import type { AuditPackage } from '@/types'

export default function AuditPackagePage() {
  const [packages, setPackages] = useState<AuditPackage[]>([])
  const [loading, setLoading]   = useState(true)
  const [gen, setGen]           = useState(false)
  const load = () => { complianceApi.auditPackages().then(r=>setPackages(r.data.results||[])).catch(()=>{}).finally(()=>setLoading(false)) }
  useEffect(()=>{ load() },[])
  const generate = async () => {
    setGen(true)
    try { await complianceApi.generatePackage(); toast.success('Audit package generated!'); load() }
    catch { toast.error('Generation failed.') } finally { setGen(false) }
  }
  const rc = (s:number) => s>=80?'text-green-600':s>=60?'text-amber-600':'text-red-600'
  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><Package className="w-5 h-5 text-[#1A3DAF]"/></div>
          <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Audit Packages</h2>
            <p className="text-sm text-[#9B9890]">Generate audit-ready bundles in one click</p></div>
        </div>
        <Button loading={gen} onClick={generate}><Plus className="w-3.5 h-3.5"/> Generate Package</Button>
      </div>
      <div className="flex items-start gap-4 p-5 bg-[#EBF0FF] border border-[#1A3DAF]/12 rounded-[14px]">
        <Package className="w-7 h-7 text-[#1A3DAF] flex-shrink-0"/>
        <div><h3 className="font-semibold text-[#1A3DAF] mb-1">What's included?</h3>
          <p className="text-sm text-[#1A3DAF]/75">Avora AI collects all compliance documents — tax filings, certificates, contracts, audit reports — and bundles them with a readiness score and gap analysis. Ready for auditors in one click.</p></div>
      </div>
      {loading ? <div className="h-32 bg-white border border-[#DDD9D0] rounded-[14px] animate-pulse"/>
      : packages.length === 0 ? (
        <div className="text-center py-20 bg-white border border-[#DDD9D0] rounded-[16px]">
          <Package className="w-12 h-12 text-[#DDD9D0] mx-auto mb-4"/>
          <p className="font-display text-lg font-semibold text-[#0E0D0A] mb-2">No packages yet</p>
          <p className="text-sm text-[#9B9890] mb-5">Generate your first audit package from vault documents.</p>
          <Button loading={gen} onClick={generate}><Plus className="w-4 h-4"/> Generate Now</Button>
        </div>
      ) : packages.map(pkg => (
        <Card key={pkg.id}>
          <CardBody>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-[11px] flex items-center justify-center flex-shrink-0 ${pkg.status==='ready'?'bg-green-50 border border-green-100':pkg.status==='failed'?'bg-red-50 border border-red-100':'bg-[#EBF0FF] border border-[#1A3DAF]/15'}`}>
                  {pkg.status==='ready'?<CheckCircle2 className="w-6 h-6 text-green-600"/>:<AlertTriangle className="w-6 h-6 text-red-500"/>}
                </div>
                <div>
                  <h3 className="font-semibold text-[#0E0D0A] mb-1">{pkg.name}</h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-xs text-[#9B9890]">{pkg.doc_count} docs</span>
                    <span className={`font-display text-lg font-bold ${rc(pkg.readiness_score)}`}>{Math.round(pkg.readiness_score)}% ready</span>
                    <Badge variant={pkg.status==='ready'?'green':pkg.status==='failed'?'red':'blue'}>{pkg.status}</Badge>
                  </div>
                  {pkg.generated_at && <p className="font-mono text-[11px] text-[#9B9890] mt-1">Generated: {new Date(pkg.generated_at).toLocaleString()}</p>}
                </div>
              </div>
              {pkg.status==='ready' && <Button variant="dark" size="sm"><Download className="w-3.5 h-3.5"/> Download ZIP</Button>}
            </div>
            {pkg.gaps?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#ECEAE4]">
                <p className="text-xs font-semibold text-red-600 mb-2">Gaps ({pkg.gaps.length}):</p>
                <div className="flex flex-wrap gap-2">
                  {pkg.gaps.map((g,i)=><span key={i} className="font-mono text-[10px] px-2 py-1 bg-red-50 border border-red-100 text-red-600 rounded-full">{g}</span>)}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

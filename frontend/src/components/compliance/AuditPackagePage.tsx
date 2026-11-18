'use client'
import { useEffect, useState } from 'react'
import { Package, Download, Plus } from 'lucide-react'
import { complianceApi } from '@/lib/api'
import { Card, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import Badge from '@/components/shared/Badge'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
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
    try { await complianceApi.generatePackage(); toast.success('Audit package generated.'); load() }
    catch { toast.error('Couldn’t generate the package. Try again.') } finally { setGen(false) }
  }
  const [downloading, setDownloading] = useState<string | null>(null)
  const download = async (pkg: AuditPackage) => {
    setDownloading(pkg.id)
    try {
      const { data } = await complianceApi.downloadPackage(pkg.id)
      const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${(pkg.name || 'audit-package').replace(/[\\/:*?"<>|]+/g, '_')}.zip`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast.error('Couldn’t download the package. Try again.')
    } finally { setDownloading(null) }
  }
  const rc = (s:number) => s>=80?'bg-[#16A34A]':s>=60?'bg-[#D97706]':'bg-[#DC2626]'
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit packages"
        description="Bundle your compliance documents for an auditor, with a readiness score and a list of gaps."
        actions={<Button size="sm" loading={gen} onClick={generate}><Plus className="h-3.5 w-3.5"/> Generate package</Button>}
      />

      <div className="rounded-[12px] border border-[#DDD9D0] bg-[#FBFAF7] px-5 py-4">
        <h3 className="text-[14px] font-semibold text-[#0E0D0A]">What goes into a package</h3>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#5A5750]">
          Avora gathers your compliance documents — tax filings, certificates, contracts and audit reports — and bundles
          them with a readiness score and a gap analysis, so you can hand them straight to an auditor.
        </p>
      </div>

      {loading ? (
        <Card><div className="space-y-3 p-5">{[0,1].map(i=><div key={i} className="h-12 animate-pulse rounded-[6px] bg-[#F1EFEA]"/>)}</div></Card>
      ) : packages.length === 0 ? (
        <Card>
          <EmptyState icon={<Package/>} title="No packages yet"
            action={<Button size="sm" loading={gen} onClick={generate}><Plus className="h-3.5 w-3.5"/> Generate package</Button>}>
            Generate one from the documents already in your vault. It takes a moment.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => (
            <Card key={pkg.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[14px] font-semibold text-[#0E0D0A]">{pkg.name}</h3>
                      <Badge variant={pkg.status==='ready'?'green':pkg.status==='failed'?'red':'blue'}><span className="capitalize">{pkg.status}</span></Badge>
                    </div>
                    <p className="mt-1 text-[12.5px] text-[#8A877F]">
                      {pkg.doc_count} documents
                      {pkg.generated_at && <> · Generated {new Date(pkg.generated_at).toLocaleString()}</>}
                    </p>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="w-36">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-[28px] font-semibold leading-none tabular-nums text-[#0E0D0A]">{Math.round(pkg.readiness_score)}%</span>
                        <span className="text-[12.5px] text-[#8A877F]">ready</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]">
                        <div className={`h-full rounded-full ${rc(pkg.readiness_score)}`} style={{width:`${Math.min(100, Math.max(0, pkg.readiness_score))}%`}}/>
                      </div>
                    </div>
                    {pkg.status==='ready' && <Button variant="ghost" size="sm" loading={downloading===pkg.id} onClick={() => download(pkg)}
                      title="Documents in this package, plus a manifest and gap summary"><Download className="h-3.5 w-3.5"/> Download ZIP</Button>}
                  </div>
                </div>

                {pkg.gaps?.length > 0 && (
                  <div className="mt-4 border-t border-[#ECEAE4] pt-4">
                    <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-[#5A5750]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]"/>
                      {pkg.gaps.length} gap{pkg.gaps.length>1?'s':''} to close
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {pkg.gaps.map((g,i)=><span key={i} className="rounded-[5px] bg-[#F1EFEA] px-2 py-1 text-[12px] text-[#5A5750]">{g}</span>)}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Folder, ArrowLeft, FileText } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { Card } from '@/components/shared/Card'

export default function CollectionPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [col, setCol] = useState<any>(null)
  const [docs, setDocs] = useState<any[]>([])
  useEffect(() => {
    aiApi.collectionDocs(params.id).then(r => { setCol(r.data.collection); setDocs(r.data.documents || []) }).catch(() => {})
  }, [params.id])
  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-[#9B9890] hover:text-[#0E0D0A]"><ArrowLeft className="w-4 h-4" /> Collections</button>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-[11px] flex items-center justify-center text-xl"><Folder /></div>
        <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">{col || 'Collection'}</h2><p className="text-sm text-[#9B9890]">{docs.length} documents</p></div>
      </div>
      <Card>
        {docs.length === 0 ? <div className="p-12 text-center text-sm text-[#9B9890]">No documents in this collection yet.</div>
        : docs.map(d => (
          <div key={String(d.document_id)} onClick={() => router.push(`/documents/${d.document_id}`)}
            className="flex items-center gap-3 px-5 py-3 border-b border-[#ECEAE4] last:border-0 hover:bg-[#F7F5F0] cursor-pointer">
            <FileText className="w-4 h-4 text-[#9B9890]" />
            <span className="text-sm font-medium text-[#0E0D0A] font-mono">{String(d.document_id).slice(0,12)}…</span>
            <span className="text-xs text-[#9B9890] ml-auto font-mono">{new Date(d.added_at).toLocaleDateString()}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}

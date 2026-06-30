'use client'
import { useEffect, useState, useRef } from 'react'
import { Network, RefreshCw, Search, Building2, FileText, Users, FolderOpen } from 'lucide-react'
import { knowledgeApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import type { KnowledgeGraphData } from '@/types'
import toast from 'react-hot-toast'

const TYPE_COLOR: Record<string,string> = {
  vendor:'#D97706', customer:'#1A3DAF', employee:'#9333EA', contract:'#16A34A',
  invoice:'#DC2626', certificate:'#0891B2', policy:'#7C3AED', department:'#65A30D',
  project:'#EA580C', document:'#6B7280',
}
const TYPE_ICON: Record<string,any> = { vendor:Building2, customer:Users, document:FileText, department:FolderOpen }

export default function KnowledgeExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [data, setData]       = useState<KnowledgeGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [search, setSearch]   = useState('')
  const [selectedNode, setSelected] = useState<any>(null)

  const load = () => { knowledgeApi.graph().then(r => setData(r.data)).catch(()=>{}).finally(()=>setLoading(false)) }
  useEffect(() => { load() }, [])

  const build = async () => {
    setBuilding(true)
    try { await knowledgeApi.build(); toast.success('Knowledge graph rebuilt!'); load() }
    catch { toast.error('Build failed.') } finally { setBuilding(false) }
  }

  // Simple force-directed-ish layout drawn on canvas
  useEffect(() => {
    if (!data || !canvasRef.current || data.nodes.length === 0) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = canvas.width = canvas.offsetWidth
    const H = canvas.height = 420

    // Position nodes in a circle grouped by type
    const types = Array.from(new Set(data.nodes.map(n => n.type)))
    const positions: Record<string, {x:number,y:number}> = {}
    const centerX = W/2, centerY = H/2, R = Math.min(W,H)/2 - 60

    data.nodes.slice(0, 80).forEach((n, i) => {
      const angle = (i / Math.min(data.nodes.length,80)) * Math.PI * 2
      positions[n.id] = { x: centerX + R * Math.cos(angle), y: centerY + R * Math.sin(angle) }
    })

    ctx.clearRect(0,0,W,H)
    // Draw edges
    ctx.strokeStyle = 'rgba(26,61,175,0.15)'
    ctx.lineWidth = 1
    data.edges.slice(0, 150).forEach(e => {
      const s = positions[e.source], t = positions[e.target]
      if (s && t) { ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(t.x,t.y); ctx.stroke() }
    })
    // Draw nodes
    data.nodes.slice(0, 80).forEach(n => {
      const p = positions[n.id]
      if (!p) return
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI*2)
      ctx.fillStyle = TYPE_COLOR[n.type] || '#9B9890'
      ctx.fill()
    })
  }, [data])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#EBF0FF] rounded-[11px] flex items-center justify-center"><Network className="w-5 h-5 text-[#1A3DAF]"/></div>
          <div><h2 className="font-display text-2xl font-bold text-[#0E0D0A]">Knowledge Explorer</h2>
            <p className="text-sm text-[#9B9890]">Organizational knowledge graph — vendors, contracts, invoices, and how they connect</p></div>
        </div>
        <Button size="sm" loading={building} onClick={build}><RefreshCw className="w-3.5 h-3.5"/> Rebuild Graph</Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-white border border-[#DDD9D0] rounded-[11px] text-center">
            <p className="font-display text-2xl font-bold text-[#0E0D0A]">{data.stats.total_nodes}</p>
            <p className="text-xs text-[#9B9890]">Total Entities</p>
          </div>
          <div className="p-3.5 bg-white border border-[#DDD9D0] rounded-[11px] text-center">
            <p className="font-display text-2xl font-bold text-[#0E0D0A]">{data.stats.total_edges}</p>
            <p className="text-xs text-[#9B9890]">Relationships</p>
          </div>
          <div className="p-3.5 bg-white border border-[#DDD9D0] rounded-[11px] text-center">
            <p className="font-display text-2xl font-bold text-amber-600">{data.stats.by_type?.vendor||0}</p>
            <p className="text-xs text-[#9B9890]">Vendors</p>
          </div>
          <div className="p-3.5 bg-white border border-[#DDD9D0] rounded-[11px] text-center">
            <p className="font-display text-2xl font-bold text-[#1A3DAF]">{data.stats.by_type?.customer||0}</p>
            <p className="text-xs text-[#9B9890]">Customers</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader title="Graph Visualization" action={
          <div className="flex gap-2 flex-wrap">
            {Object.entries(TYPE_COLOR).slice(0,6).map(([t,c]) => (
              <span key={t} className="flex items-center gap-1.5 text-[10px] font-mono text-[#9B9890]">
                <span className="w-2 h-2 rounded-full" style={{background:c}}/>{t}
              </span>
            ))}
          </div>
        }/>
        <CardBody>
          {loading ? <div className="h-96 bg-[#F7F5F0] rounded-[11px] animate-pulse"/>
          : !data || data.nodes.length === 0 ? (
            <div className="text-center py-20">
              <Network className="w-12 h-12 text-[#DDD9D0] mx-auto mb-4"/>
              <p className="font-medium text-[#5A5750] mb-2">No knowledge graph yet</p>
              <p className="text-sm text-[#9B9890] mb-5">Build the graph to visualize relationships between vendors, contracts, and documents.</p>
              <Button onClick={build} loading={building}><RefreshCw className="w-4 h-4"/> Build Knowledge Graph</Button>
            </div>
          ) : (
            <canvas ref={canvasRef} className="w-full" style={{height:420}}/>
          )}
        </CardBody>
      </Card>

      {data && data.nodes.length > 0 && (
        <Card>
          <CardHeader title="Entities by Type"/>
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {Object.entries(data.stats.by_type).filter(([,c]) => c>0).map(([type, count]) => (
                <div key={type} className="flex items-center gap-2.5 p-2.5 bg-[#F7F5F0] border border-[#ECEAE4] rounded-[9px]">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:TYPE_COLOR[type]}}/>
                  <span className="text-xs text-[#5A5750] capitalize flex-1">{type}</span>
                  <span className="font-mono text-xs font-semibold text-[#0E0D0A]">{count}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
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

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

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

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] }
    return {
      nodes: data.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, val: n.type === 'document' ? 4 : 6 })),
      links: data.edges.map(e => ({ source: e.source, target: e.target, name: e.type }))
    }
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
            <div className="w-full h-[450px] bg-[#FAFAF8] rounded-[11px] overflow-hidden border border-[#ECEAE4]">
              <ForceGraph2D
                ref={(fg: any) => {
                  if (fg) {
                    fg.d3Force('charge').strength(-400)
                    fg.d3Force('link').distance(120)
                  }
                }}
                graphData={graphData}
                nodeLabel={() => ''} // disable default tooltip
                linkColor={() => 'rgba(26,61,175,0.2)'}
                linkWidth={1.5}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                onNodeClick={(node: any) => setSelected(node)}
                nodeCanvasObjectMode={() => 'replace'}
                nodeCanvasObject={(node, ctx, globalScale) => {
                  const label = node.name.length > 30 ? node.name.substring(0,27) + '...' : node.name
                  const fontSize = 12 / globalScale
                  ctx.font = `${fontSize}px Inter, sans-serif`
                  
                  const textWidth = ctx.measureText(label).width
                  const height = fontSize + (10 / globalScale)
                  const r = height / 2
                  // width = radius (left curve) + space + dot + space + textWidth + space + radius (right curve)
                  const dotRadius = 3 / globalScale
                  const padding = 8 / globalScale
                  const width = r + padding + (dotRadius * 2) + padding + textWidth + r
                  
                  const bckgDimensions = [width, height]
                  const nodeColor = TYPE_COLOR[node.type] || '#9B9890'

                  // Draw pill background
                  ctx.fillStyle = '#FFFFFF'
                  ctx.beginPath()
                  const x = node.x! - bckgDimensions[0]/2
                  const y = node.y! - bckgDimensions[1]/2
                  const w = bckgDimensions[0]
                  const h = bckgDimensions[1]
                  
                  ctx.moveTo(x + r, y)
                  ctx.lineTo(x + w - r, y)
                  ctx.arcTo(x + w, y, x + w, y + r, r)
                  ctx.lineTo(x + w, y + h - r)
                  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
                  ctx.lineTo(x + r, y + h)
                  ctx.arcTo(x, y + h, x, y + h - r, r)
                  ctx.lineTo(x, y + r)
                  ctx.arcTo(x, y, x + r, y, r)
                  ctx.fill()
                  
                  // Draw pill border
                  ctx.lineWidth = 1 / globalScale
                  ctx.strokeStyle = nodeColor
                  ctx.stroke()
                  
                  // Draw color dot indicator
                  ctx.fillStyle = nodeColor
                  ctx.beginPath()
                  // Dot is placed after the left curve (r) and a small padding
                  const dotX = x + r + (4 / globalScale)
                  ctx.arc(dotX, node.y!, dotRadius, 0, 2 * Math.PI, false)
                  ctx.fill()

                  // Draw text
                  ctx.textAlign = 'left'
                  ctx.textBaseline = 'middle'
                  ctx.fillStyle = '#0E0D0A'
                  // Text is placed after the dot and its padding
                  const textX = dotX + dotRadius + (6 / globalScale)
                  ctx.fillText(label, textX, node.y!)
                }}
              />
            </div>
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

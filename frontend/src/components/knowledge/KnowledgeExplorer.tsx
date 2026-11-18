'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Network, RefreshCw, Search, Building2, FileText, Users, FolderOpen, Link2 } from 'lucide-react'
import { knowledgeApi } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/shared/Card'
import Button from '@/components/shared/Button'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import StatCard from '@/components/shared/StatCard'
import type { KnowledgeGraphData } from '@/types'
import toast from 'react-hot-toast'

const TYPE_COLOR: Record<string,string> = {
  vendor:'#B45309', customer:'#1A3DAF', employee:'#7E22CE', contract:'#15803D',
  invoice:'#B91C1C', certificate:'#0E7490', policy:'#2B2924', department:'#4D7C0F',
  project:'#C2410C', document:'#8A877F',
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
    try { await knowledgeApi.build(); toast.success('Knowledge map rebuilt.'); load() }
    catch { toast.error('Couldn’t rebuild the map. Try again.') } finally { setBuilding(false) }
  }

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] }
    return {
      nodes: data.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, val: n.type === 'document' ? 4 : 6 })),
      links: data.edges.map(e => ({ source: e.source, target: e.target, name: e.type }))
    }
  }, [data])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge map"
        description="The vendors, customers, contracts and invoices Avora has found in your documents, and how they connect."
        actions={<Button variant="ghost" size="sm" loading={building} onClick={build}><RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75}/> Rebuild map</Button>}
      />

      {data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Entities" value={data.stats.total_nodes} icon={<Network strokeWidth={1.75}/>} />
          <StatCard label="Connections" value={data.stats.total_edges} icon={<Link2 strokeWidth={1.75}/>} />
          <StatCard label="Vendors" value={data.stats.by_type?.vendor||0} icon={<Building2 strokeWidth={1.75}/>} accent="amber" />
          <StatCard label="Customers" value={data.stats.by_type?.customer||0} icon={<Users strokeWidth={1.75}/>} />
        </div>
      )}

      <Card>
        <CardHeader title="Map" subtitle="Drag to move around, scroll to zoom." action={
          <div className="hidden flex-wrap justify-end gap-x-3 gap-y-1 md:flex">
            {Object.entries(TYPE_COLOR).slice(0,6).map(([t,c]) => (
              <span key={t} className="flex items-center gap-1.5 text-[12px] capitalize text-[#5A5750]">
                <span className="h-1.5 w-1.5 rounded-full" style={{background:c}}/>{t}
              </span>
            ))}
          </div>
        }/>
        <CardBody>
          {loading ? <div className="h-96 animate-pulse rounded-[8px] bg-[#F1EFEA]"/>
          : !data || data.nodes.length === 0 ? (
            <EmptyState icon={<Network />} title="Nothing on the map yet"
              action={<Button size="sm" onClick={build} loading={building}>Build the map</Button>}>
              Avora reads your documents and links the vendors, customers and contracts it finds. Build the map to see them.
            </EmptyState>
          ) : (
            <div className="h-[450px] w-full overflow-hidden rounded-[8px] border border-[#ECEAE4] bg-[#FBFAF7]">
              <ForceGraph2D
                ref={((fg: any) => {
                  if (fg) {
                    fg.d3Force('charge').strength(-400)
                    fg.d3Force('link').distance(120)
                  }
                }) as any}
                graphData={graphData}
                nodeLabel={() => ''} // disable default tooltip
                linkColor={() => 'rgba(14,13,10,0.14)'}
                linkWidth={1.5}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                onNodeClick={(node: any) => setSelected(node)}
                nodeCanvasObjectMode={() => 'replace'}
                nodeCanvasObject={(node, ctx, globalScale) => {
                  const label = node.name.length > 30 ? node.name.substring(0,27) + '...' : node.name
                  const fontSize = 12 / globalScale
                  ctx.font = `${fontSize}px 'IBM Plex Sans', sans-serif`
                  
                  const textWidth = ctx.measureText(label).width
                  const height = fontSize + (10 / globalScale)
                  const r = height / 2
                  // width = radius (left curve) + space + dot + space + textWidth + space + radius (right curve)
                  const dotRadius = 3 / globalScale
                  const padding = 8 / globalScale
                  const width = r + padding + (dotRadius * 2) + padding + textWidth + r
                  
                  const bckgDimensions = [width, height]
                  const nodeColor = TYPE_COLOR[node.type] || '#8A877F'

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
          <CardHeader title="Entities by type"/>
          <div className="-mb-px grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
            {Object.entries(data.stats.by_type).filter(([,c]) => c>0).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2.5 border-b border-[#F1EFEA] px-5 py-3">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{background:TYPE_COLOR[type]}}/>
                <span className="flex-1 text-[13.5px] capitalize text-[#2B2924]">{type}</span>
                <span className="text-[13.5px] font-medium tabular-nums text-[#0E0D0A]">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

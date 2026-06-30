import { cn } from '@/lib/utils'
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white border border-[#DDD9D0] rounded-[16px] overflow-hidden', className)}>{children}</div>
}
export function CardHeader({ title, action, className }: { title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-5 py-4 border-b border-[#ECEAE4] flex items-center justify-between', className)}>
      <span className="text-sm font-semibold text-[#0E0D0A]">{title}</span>
      {action}
    </div>
  )
}
export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

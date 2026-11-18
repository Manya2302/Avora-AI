import { cn } from '@/lib/utils'

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-[12px] border border-[#DDD9D0] bg-white', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, className }: {
  title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-[#ECEAE4] px-5 py-3.5', className)}>
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold text-[#0E0D0A]">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-[#8A877F]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

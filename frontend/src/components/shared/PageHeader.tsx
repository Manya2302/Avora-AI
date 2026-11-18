import { cn } from '@/lib/utils'

/** Title block for the top of an app screen. Keeps every page's heading the same size and spacing. */
export default function PageHeader({ title, description, actions, className }: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-subtitle max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

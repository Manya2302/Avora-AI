'use client'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Modal({ open, onOpenChange, title, description, children, footer, className }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#0E0D0A]/35" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-[460px] -translate-x-1/2 rounded-[12px] border border-[#DDD9D0] bg-white shadow-lg outline-none',
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
            <div>
              <Dialog.Title className="text-[16px] font-semibold text-[#0E0D0A]">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-[13px] text-[#8A877F]">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="-mr-1 -mt-1 rounded-[6px] p-1 text-[#8A877F] hover:bg-[#F1EFEA] hover:text-[#0E0D0A]" aria-label="Close">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="px-5 py-3">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-[#ECEAE4] px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

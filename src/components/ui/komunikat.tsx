import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Rodzaj = 'blad' | 'sukces' | 'info' | 'ostrzezenie'

const style: Record<Rodzaj, string> = {
  blad: 'bg-red-50 text-red-700',
  sukces: 'bg-limonka-jasna text-limonka-ciemna',
  info: 'bg-blekit-jasny text-blekit-ciemny',
  ostrzezenie: 'bg-amber-50 text-amber-800',
}

export function Komunikat({ rodzaj, children, className }: { rodzaj: Rodzaj; children: ReactNode; className?: string }) {
  return (
    <div role={rodzaj === 'blad' ? 'alert' : 'status'} className={cn('rounded-md px-4 py-3 text-sm', style[rodzaj], className)}>
      {children}
    </div>
  )
}

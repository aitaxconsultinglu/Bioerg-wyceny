import { useEffect, useState } from 'react'
import { parsujLiczbe } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  wartosc: number | null
  zmien: (n: number | null) => void
  disabled?: boolean
  className?: string
  placeholder?: string
  /** Pozwala zostawić pole puste (null) zamiast 0. */
  puste?: boolean
  ujemne?: boolean
  autoFocus?: boolean
  'aria-label'?: string
}

function naTekst(n: number | null) {
  return n === null || n === undefined ? '' : String(n).replace('.', ',')
}

/**
 * Pole liczbowe przyjmujące przecinek i kropkę. Trzyma własny tekst podczas pisania
 * ("12," nie jest jeszcze liczbą), a do rodzica oddaje liczbę dopiero, gdy jest poprawna.
 * Niepoprawny wpis podświetla się na czerwono i nie zmienia zapisanej wartości.
 */
export function PoleLiczby({ wartosc, zmien, disabled, className, placeholder, puste, ujemne, autoFocus, ...reszta }: Props) {
  const [tekst, setTekst] = useState(naTekst(wartosc))
  const [zle, setZle] = useState(false)

  useEffect(() => {
    // Zmiana z zewnątrz (np. wczytanie z bazy) - nadpisz tekst, jeśli się rozjechał.
    const obecna = tekst.trim() === '' && puste ? null : parsujLiczbe(tekst)
    if (obecna !== wartosc && !(Number.isNaN(obecna) && zle)) {
      setTekst(naTekst(wartosc))
      setZle(false)
    }
  }, [wartosc]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      inputMode="decimal"
      value={tekst}
      disabled={disabled}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={reszta['aria-label']}
      aria-invalid={zle}
      onChange={(e) => {
        setTekst(e.target.value)
        if (puste && e.target.value.trim() === '') { setZle(false); zmien(null); return }
        const n = parsujLiczbe(e.target.value)
        if (Number.isNaN(n) || (!ujemne && n < 0)) { setZle(true); return }
        setZle(false)
        zmien(n)
      }}
      className={cn('pole-komorki liczba', zle && 'bg-red-100 text-red-800', className)}
    />
  )
}

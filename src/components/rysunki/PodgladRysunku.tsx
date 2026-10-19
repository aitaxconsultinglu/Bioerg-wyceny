import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { X } from 'lucide-react'
import { ETYKIETY_OBSZARU, KOLORY_OBSZARU, type Obszar, type Prostokat, type RodzajObszaru } from '@/lib/rysunki'

interface Props {
  dataUrl: string
  obszary: Obszar[]
  rodzajNowego: RodzajObszaru
  zoom: number
  wybrany: string | null
  podswietlony: Prostokat | null
  tylkoOdczyt: boolean
  wybierz: (id: string | null) => void
  dodaj: (o: Obszar) => void
  usun: (id: string) => void
}

const proc = (v: number) => `${(v * 100).toFixed(3)}%`

/**
 * Podgląd strony rysunku z zaznaczaniem obszarów: przeciągnij myszą, żeby zaznaczyć tabelę.
 * Współrzędne obszarów są względne (0..1), więc nie zależą od powiększenia ani rozdzielczości podglądu.
 */
export function PodgladRysunku({ dataUrl, obszary, rodzajNowego, zoom, wybrany, podswietlony, tylkoOdczyt, wybierz, dodaj, usun }: Props) {
  const warstwa = useRef<HTMLDivElement>(null)
  const swiatlo = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [biezacy, setBiezacy] = useState<Prostokat | null>(null)

  useEffect(() => {
    if (podswietlony) swiatlo.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [podswietlony])

  function punkt(e: PointerEvent) {
    const r = warstwa.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const prostokat = (a: { x: number; y: number }, b: { x: number; y: number }): Prostokat =>
    ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })

  function wcisniety(e: PointerEvent<HTMLDivElement>) {
    if (tylkoOdczyt || e.button !== 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pióro / zdarzenie syntetyczne - bez przechwycenia */ }
    const p = punkt(e)
    setStart(p)
    setBiezacy({ ...p, w: 0, h: 0 })
    wybierz(null)
  }
  function ruch(e: PointerEvent<HTMLDivElement>) {
    if (start) setBiezacy(prostokat(start, punkt(e)))
  }
  function puszczony(e: PointerEvent<HTMLDivElement>) {
    if (!start) return
    const p = prostokat(start, punkt(e))
    setStart(null); setBiezacy(null)
    if (p.w > 0.008 && p.h > 0.008) {
      const id = crypto.randomUUID()
      dodaj({ id, rodzaj: rodzajNowego, ...p })
      wybierz(id)
    }
  }

  return (
    <div className="relative select-none" style={{ width: `${zoom * 100}%` }}>
      <img src={dataUrl} alt="Strona rysunku" className="block w-full" draggable={false} />
      <div
        ref={warstwa}
        className={tylkoOdczyt ? 'absolute inset-0' : 'absolute inset-0 cursor-crosshair'}
        onPointerDown={wcisniety} onPointerMove={ruch} onPointerUp={puszczony}
      >
        {obszary.map((o) => (
          <div
            key={o.id}
            className="absolute border-2"
            style={{
              left: proc(o.x), top: proc(o.y), width: proc(o.w), height: proc(o.h), borderColor: KOLORY_OBSZARU[o.rodzaj],
              background: o.id === wybrany ? `${KOLORY_OBSZARU[o.rodzaj]}22` : 'transparent',
            }}
            onPointerDown={(e) => { e.stopPropagation(); wybierz(o.id) }}
          >
            <span className="absolute -top-5 left-0 flex items-center gap-1 whitespace-nowrap rounded px-1 text-[11px] font-medium text-white" style={{ background: KOLORY_OBSZARU[o.rodzaj] }}>
              {ETYKIETY_OBSZARU[o.rodzaj]}
              {!tylkoOdczyt && o.id === wybrany && (
                <button title="Usuń obszar" className="hover:text-red-200" onPointerDown={(e) => e.stopPropagation()} onClick={() => usun(o.id)}><X className="h-3 w-3" /></button>
              )}
            </span>
          </div>
        ))}
        {biezacy && (
          <div className="pointer-events-none absolute border-2 border-dashed" style={{ left: proc(biezacy.x), top: proc(biezacy.y), width: proc(biezacy.w), height: proc(biezacy.h), borderColor: KOLORY_OBSZARU[rodzajNowego] }} />
        )}
        {podswietlony && (
          <div ref={swiatlo} className="pointer-events-none absolute animate-pulse border-2 border-red-500 bg-red-500/10"
            style={{ left: proc(podswietlony.x), top: proc(podswietlony.y), width: proc(podswietlony.w), height: proc(podswietlony.h) }} />
        )}
      </div>
    </div>
  )
}

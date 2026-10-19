import { useEffect, useMemo, useState } from 'react'
import { useSlowniki } from '@/lib/slowniki'
import { dataPL, liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { cenaZWiersza, filtrujCeny, PUSTY_FILTR, wczytajCeny, wiekMiesiecy, type WierszCeny, type WybranaCena } from '@/lib/bazaCen'
import type { PozycjaWyceny } from '@/lib/wyceny'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { KolumnaWymagan, opisWymiarow } from '../oferty/Porownywarka'

export type { WybranaCena }

let cache: Promise<{ wiersze: WierszCeny[]; blad: string | null }> | null = null
/** Ceny z bazy wczytywane raz na sesję edytora (odświeżenie strony pobiera nowe). */
export function cenyZBazy(odswiez = false) {
  if (!cache || odswiez) cache = wczytajCeny({ zakupy: true })
  return cache
}

/**
 * "Znajdź cenę": dopasowane pozycje z ofert i zakupów (kategoria + gatunek z równoważnikami +
 * zbliżone wymiary). Klik kopiuje cenę i źródło do wiersza wyceny - kopia, nie referencja.
 */
export function ZnajdzCene({ pozycja, uslugi, zamknij, wybierz }: {
  pozycja: PozycjaWyceny | null
  uslugi?: boolean
  zamknij: () => void
  wybierz: (c: WybranaCena) => void
}) {
  const s = useSlowniki()
  const [wiersze, setWiersze] = useState<WierszCeny[]>([])
  const [tylkoKategoria, setTylkoKategoria] = useState(true)
  const [tolerancja, setTolerancja] = useState(15)
  const [tekst, setTekst] = useState('')

  useEffect(() => { if (pozycja) void cenyZBazy().then((r) => setWiersze(r.wiersze)) }, [pozycja])
  useEffect(() => { setTekst('') }, [pozycja])

  const miara: 'cena_pln_kg' | 'cena_pln_m' | 'cena_pln_szt' | 'cena_pln_odniesienia' =
    uslugi ? 'cena_pln_odniesienia' : pozycja?.jednostka_ceny === 'kg' ? 'cena_pln_kg' : pozycja?.jednostka_ceny === 'm' ? 'cena_pln_m' : 'cena_pln_szt'

  const wynik = useMemo(() => {
    if (!pozycja) return []
    const kat = uslugi ? (pozycja.sekcja ? `u:${pozycja.sekcja}` : '') : pozycja.sekcja ? `m:${pozycja.sekcja}` : ''
    const zakres = uslugi ? wiersze.filter((w) => w.kategoria_uslugi) : wiersze.filter((w) => !w.kategoria_uslugi)
    return filtrujCeny(zakres, {
      ...PUSTY_FILTR, tekst, kategoria: tylkoKategoria ? kat : '', gatunek: uslugi ? '' : pozycja.gatunek ?? '',
      d_zew: uslugi ? null : pozycja.d_zew ?? null, grubosc: uslugi ? null : pozycja.grubosc ?? null, tolerancja_proc: tolerancja,
    }, s.gatunki).sort((a, b) => {
      // Najpierw pozycje z ceną w potrzebnej mierze, potem najtańsze.
      const x = a[miara] ?? (uslugi ? a.wartosc_pln : null); const y = b[miara] ?? (uslugi ? b.wartosc_pln : null)
      if (x === null && y === null) return 0
      if (x === null) return 1
      if (y === null) return -1
      return x - y
    }).slice(0, 200)
  }, [pozycja, wiersze, tylkoKategoria, tolerancja, tekst, s.gatunki, uslugi, miara])

  const dzis = new Date().toISOString().slice(0, 10)

  function wez(w: WierszCeny) {
    wybierz(cenaZWiersza(w, pozycja?.jednostka_ceny ?? 'jm', uslugi))
  }

  return (
    <Dialog open={!!pozycja} onOpenChange={(o) => !o && zamknij()}>
      <DialogContent className="max-w-6xl">
        <DialogTitle>Znajdź cenę: {pozycja?.nazwa || pozycja?.rodzaj || ''} {pozycja?.gatunek ?? ''}</DialogTitle>
        <DialogDescription>
          Oferty dostawców i zakupy z Optimy. Klik w wiersz kopiuje cenę ({uslugi ? 'PLN za jm' : miara === 'cena_pln_kg' ? 'PLN/kg' : miara === 'cena_pln_m' ? 'PLN/m' : 'PLN/szt'}) i jej źródło do wyceny.
          <span className="ml-1 rounded bg-amber-100 px-1">starsze niż {s.ustawienia.wiek_ceny_ostrzezenie_mies} mies.</span>
          <span className="ml-1 rounded bg-red-100 px-1">oferta po terminie</span>
        </DialogDescription>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <input className="pole w-56" placeholder="zawęź: opis, dostawca..." value={tekst} onChange={(e) => setTekst(e.target.value)} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={tylkoKategoria} onChange={(e) => setTylkoKategoria(e.target.checked)} /> tylko ta kategoria</label>
          {!uslugi && (
            <label className="flex items-center gap-1">wymiary ±
              <select className="pole w-20" value={tolerancja} onChange={(e) => setTolerancja(Number(e.target.value))}>
                {[5, 15, 30, 100, 1000].map((t) => <option key={t} value={t}>{t === 1000 ? 'dowolne' : `${t}%`}</option>)}
              </select></label>
          )}
          <span className="text-slate-500">{wynik.length} pozycji</span>
        </div>
        <div className="mt-2 max-h-[60vh] overflow-auto rounded border border-slate-200">
          <table className="w-full border-collapse">
            <thead className="sticky top-0"><tr>{['Źródło', 'Data', 'Dostawca', 'Opis', 'Gatunek', 'Wymiary', 'PLN/kg', 'PLN/m', 'PLN/szt', 'Termin', 'Ważność', 'Wymagania'].map((n) => <th key={n} className="komorka-naglowek whitespace-nowrap">{n}</th>)}</tr></thead>
            <tbody>
              {wynik.map((w) => {
                const stara = (wiekMiesiecy(w.data) ?? 0) >= s.ustawienia.wiek_ceny_ostrzezenie_mies
                const po = w.zrodlo === 'oferta' && !!w.waznosc_do && w.waznosc_do < dzis
                return (
                  <tr key={w.klucz} onClick={() => wez(w)} className={cn('cursor-pointer hover:bg-limonka-jasna', po ? 'bg-red-50' : stara && 'bg-amber-50')}>
                    <td className="komorka text-xs">{w.zrodlo}</td>
                    <td className="komorka whitespace-nowrap text-xs">{dataPL(w.data)}</td>
                    <td className="komorka max-w-[10rem] truncate text-xs">{w.dostawca}</td>
                    <td className="komorka max-w-[20rem] text-xs">{w.opis}</td>
                    <td className="komorka whitespace-nowrap text-xs">{w.gatunek}</td>
                    <td className="komorka whitespace-nowrap text-xs">{opisWymiarow(w)}</td>
                    {(['cena_pln_kg', 'cena_pln_m', 'cena_pln_szt'] as const).map((k) => (
                      <td key={k} className={cn('komorka liczba text-xs', k === miara && 'font-semibold')}>{w[k] !== null ? liczba(w[k], 2) : ''}</td>
                    ))}
                    <td className="komorka whitespace-nowrap text-xs">{w.termin}</td>
                    <td className="komorka whitespace-nowrap text-xs">{w.waznosc_do ? dataPL(w.waznosc_do) : w.waznosc_opis}</td>
                    <td className="komorka"><KolumnaWymagan w={w.wymagania} /></td>
                  </tr>
                )
              })}
              {wynik.length === 0 && <tr><td colSpan={12} className="komorka text-center text-slate-500">Brak dopasowanych cen - poszerz kryteria.</td></tr>}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

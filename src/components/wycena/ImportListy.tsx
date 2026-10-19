import { useState } from 'react'
import { useSlowniki } from '@/lib/slowniki'
import { liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { wierszeZPliku } from '@/lib/arkuszLeniwie'
import { pozycjeZListy, rozpoznajListe, type WierszListy } from '@/lib/importListy'
import type { PozycjaWyceny } from '@/lib/wyceny'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'

/** Import listy materiałowej z Excela: podgląd z klasyfikacją, niepewne wiersze wyróżnione. */
export function ImportListy({ otwarty, zamknij, dodaj }: { otwarty: boolean; zamknij: () => void; dodaj: (p: PozycjaWyceny[]) => void }) {
  const s = useSlowniki()
  const [wiersze, setWiersze] = useState<WierszListy[]>([])
  const [blad, setBlad] = useState<string | null>(null)

  async function wczytaj(pliki: FileList | null) {
    const p = pliki?.[0]
    if (!p) return
    setBlad(null)
    try {
      const { pozycje, blad: b } = rozpoznajListe(await wierszeZPliku(new Uint8Array(await p.arrayBuffer())))
      setWiersze(pozycje); setBlad(b)
    } catch (e) { setBlad(String(e)) }
  }

  function zatwierdz() {
    dodaj(pozycjeZListy(wiersze))
    setWiersze([]); zamknij()
  }

  return (
    <Dialog open={otwarty} onOpenChange={(o) => !o && zamknij()}>
      <DialogContent className="max-w-5xl">
        <DialogTitle>Import listy materiałowej</DialogTitle>
        <DialogDescription>
          Arkusz z kolumnami nazwa / opis, ilość, j.m., materiał, wymiary, masa. Wiersze trafią do sekcji wg kategorii -
          <span className="ml-1 rounded bg-amber-100 px-1">żółte</span> mają niepewną klasyfikację, sprawdź je. Listę z rysunku PDF odczyta AI (etap 4).
        </DialogDescription>
        <input type="file" accept=".xlsx,.xls,.csv" className="mt-3 text-sm" onChange={(e) => void wczytaj(e.target.files)} />
        {blad && <Komunikat rodzaj="blad" className="mt-2">{blad}</Komunikat>}
        {wiersze.length > 0 && (
          <>
            <div className="mt-3 max-h-[55vh] overflow-auto rounded border border-slate-200">
              <table className="w-full border-collapse">
                <thead className="sticky top-0"><tr>{['Lp', 'Nazwa', 'Kategoria', 'Gatunek', 'Wymiary', 'Ilość', 'Masa jedn.'].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
                <tbody>
                  {wiersze.map((w, i) => (
                    <tr key={i} className={cn(w.pewnosc < 0.8 && 'bg-amber-50')}>
                      <td className="komorka text-xs">{w.lp}</td>
                      <td className="komorka text-sm">{w.nazwa}</td>
                      <td className="komorka">
                        <select className="pole-komorki text-sm" value={w.sekcja} onChange={(e) => setWiersze(wiersze.map((x, j) => (j === i ? { ...x, sekcja: e.target.value, pewnosc: 1 } : x)))}>
                          {s.kategorieMaterialow.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
                        </select>
                      </td>
                      <td className="komorka text-xs">{w.gatunek}</td>
                      <td className="komorka text-xs">{[w.d_zew && `Ø${w.d_zew}`, w.d_wew && `/${w.d_wew}`, w.grubosc && `g${w.grubosc}`, w.szerokosc, w.dlugosc && `L${w.dlugosc}`, w.dn && `DN${w.dn}`].filter(Boolean).join(' ')}</td>
                      <td className="komorka liczba text-sm">{liczba(w.ilosc)} {w.jm}</td>
                      <td className="komorka liczba text-sm">{w.masa_jedn !== null ? liczba(w.masa_jedn, 2) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button onClick={zamknij}>Anuluj</Button>
              <Button wariant="glowny" onClick={zatwierdz}>Dodaj {wiersze.length} pozycji do aparatu</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

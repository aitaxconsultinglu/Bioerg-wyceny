import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { dataPL, liczba, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { grupujDoPorownania, wczytajCeny, type WierszCeny } from '@/lib/bazaCen'
import { Komunikat } from '../ui/komunikat'
import { KolumnaWymagan, opisWymiarow } from './Porownywarka'

interface ZapytanieListy { id: string; numer: string; przedmiot: string }

/** Wszystkie oferty zebrane do zapytania ZO, pogrupowane wg pozycji: najlepsza cena i najkrótszy termin. */
export function OfertyDoZapytania({ zapytanieId: poczatkowe }: { zapytanieId?: string | null }) {
  const [zapytania, setZapytania] = useState<ZapytanieListy[]>([])
  const [wybrane, setWybrane] = useState<string>(poczatkowe ?? '')
  const [wiersze, setWiersze] = useState<WierszCeny[]>([])
  const [blad, setBlad] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('zapytania').select('id, numer, przedmiot').order('utworzono', { ascending: false })
      .then(({ data }) => setZapytania((data ?? []) as ZapytanieListy[]))
  }, [])

  useEffect(() => {
    if (!wybrane) { setWiersze([]); return }
    void wczytajCeny({ zapytanieId: wybrane }).then(({ wiersze: w, blad: b }) => { setWiersze(w); setBlad(b) })
  }, [wybrane])

  const grupy = useMemo(() => grupujDoPorownania(wiersze), [wiersze])
  const dostawcow = new Set(wiersze.map((w) => w.dostawca)).size

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <label className="block max-w-xl">
        <span className="etykieta">Zapytanie ofertowe</span>
        <select className="pole" value={wybrane} onChange={(e) => setWybrane(e.target.value)}>
          <option value="">- wybierz ZO -</option>
          {zapytania.map((z) => <option key={z.id} value={z.id}>{z.numer} - {z.przedmiot}</option>)}
        </select>
      </label>
      {wybrane && (
        <p className="text-sm text-slate-600">
          {wiersze.length} pozycji ofert od {dostawcow} dostawców, {grupy.length} grup. Ceny w PLN wg kursu NBP z dnia oferty.
          <span className="ml-2 rounded bg-limonka-jasna px-1">najniższa cena</span>
          <span className="ml-1 rounded bg-blekit-jasny px-1">najkrótszy termin</span>
        </p>
      )}
      {grupy.map((g) => (
        <section key={g.klucz} className="sekcja space-y-2">
          <h3 className="text-sm font-semibold">{g.nazwa}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead><tr>
                {['Dostawca', 'Opis w ofercie', 'Wymiary', 'Ilość', 'Cena oryg.', 'Cena PLN / jm', 'PLN/kg', 'Wartość PLN', 'Termin', 'Ważność', 'Warunki', 'Wymagania', 'Dopłaty'].map((n) => (
                  <th key={n} className="komorka-naglowek whitespace-nowrap">{n}</th>
                ))}
              </tr></thead>
              <tbody>
                {g.wiersze.map((w) => (
                  <tr key={w.klucz}>
                    <td className="komorka font-medium">{w.dostawca}<div className="text-xs font-normal text-slate-500">{dataPL(w.data)}</div></td>
                    <td className="komorka max-w-[18rem] text-sm">{w.opis}</td>
                    <td className="komorka whitespace-nowrap text-xs">{opisWymiarow(w)}</td>
                    <td className="komorka liczba whitespace-nowrap">{liczba(w.ilosc)} {w.jm}</td>
                    <td className="komorka liczba whitespace-nowrap">{liczba(w.cena_jedn, 2)} {w.waluta}</td>
                    <td className={cn('komorka liczba whitespace-nowrap font-semibold', g.najtansza === w.klucz && 'bg-limonka-jasna')}>{zl(w.cena_pln_jm)}</td>
                    <td className={cn('komorka liczba whitespace-nowrap', g.miara === 'kg' && g.najtansza === w.klucz && 'bg-limonka-jasna')}>{w.cena_pln_kg !== null ? liczba(w.cena_pln_kg, 2) : ''}</td>
                    <td className="komorka liczba whitespace-nowrap">{zl(w.wartosc_pln)}</td>
                    <td className={cn('komorka whitespace-nowrap text-xs', g.najszybsza === w.klucz && 'bg-blekit-jasny')}>{w.termin}{w.termin_dni ? ` (${w.termin_dni} dni)` : ''}</td>
                    <td className="komorka whitespace-nowrap text-xs">{w.waznosc_do ? dataPL(w.waznosc_do) : w.waznosc_opis}</td>
                    <td className="komorka text-xs">{w.warunki}</td>
                    <td className="komorka"><KolumnaWymagan w={w.wymagania} /></td>
                    <td className="komorka text-xs">{w.doplaty.map((d) => `${d.opis} ${liczba(d.kwota)} ${w.waluta}${d.za !== 'oferta' ? `/${d.za}` : ''}`).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {wybrane && grupy.length === 0 && <p className="text-sm text-slate-500">Brak zatwierdzonych ofert powiązanych z tym zapytaniem.</p>}
    </div>
  )
}

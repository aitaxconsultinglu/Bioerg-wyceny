import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL, liczba, zl } from '@/lib/format'
import { Komunikat } from '../ui/komunikat'

interface Wiersz {
  id: string; wersja: number; nazwa: string | null; zlozono: string | null; podsumowanie: { koszty?: number; masa_kg?: number } | null
  zapytania: { numer: string; przedmiot: string; termin_oferty: string | null; klienci: { nazwa: string } | null } | null
  wyceny_marze: { narzut_zysk_proc: number; korekta_prezesa_kwota: number } | null
}

/** Kolejka prezesa: wyceny przekazane do zatwierdzenia. */
export function KolejkaZatwierdzania({ otworz }: { otworz: (wycenaId: string) => void }) {
  const [lista, setLista] = useState<Wiersz[]>([])
  const [blad, setBlad] = useState<string | null>(null)
  useEffect(() => {
    void supabase.from('wyceny')
      .select('id, wersja, nazwa, zlozono, podsumowanie, zapytania(numer, przedmiot, termin_oferty, klienci(nazwa)), wyceny_marze(narzut_zysk_proc, korekta_prezesa_kwota)')
      .eq('status', 'do_zatwierdzenia').order('zlozono')
      .then(({ data, error }) => { if (error) setBlad(komunikatPL(error.message)); else setLista((data ?? []) as unknown as Wiersz[]) })
  }, [])
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Wyceny do zatwierdzenia</h2>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead><tr>{['Zapytanie', 'Klient', 'Przedmiot', 'Wersja', 'Przekazano', 'Termin oferty', 'Koszty', 'Masa kg', 'Narzut'].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
          <tbody>
            {lista.map((w) => (
              <tr key={w.id} className="cursor-pointer hover:bg-slate-50" onClick={() => otworz(w.id)}>
                <td className="komorka whitespace-nowrap font-medium">{w.zapytania?.numer}</td>
                <td className="komorka">{w.zapytania?.klienci?.nazwa}</td>
                <td className="komorka">{w.zapytania?.przedmiot}</td>
                <td className="komorka">v{w.wersja}{w.nazwa ? ` ${w.nazwa}` : ''}</td>
                <td className="komorka whitespace-nowrap text-sm">{dataGodzinaPL(w.zlozono)}</td>
                <td className="komorka whitespace-nowrap text-sm">{dataGodzinaPL(w.zapytania?.termin_oferty)}</td>
                <td className="komorka liczba">{w.podsumowanie?.koszty !== undefined ? zl(w.podsumowanie.koszty) : ''}</td>
                <td className="komorka liczba">{w.podsumowanie?.masa_kg ? liczba(w.podsumowanie.masa_kg, 0) : ''}</td>
                <td className="komorka liczba">{w.wyceny_marze ? `${liczba(w.wyceny_marze.narzut_zysk_proc)}%` : ''}</td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={9} className="komorka text-center text-slate-500">Brak wycen czekających na zatwierdzenie.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

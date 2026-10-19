import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { supabase, wywolajFunkcje } from '@/lib/supabase'
import { useSlowniki } from '@/lib/slowniki'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL, dataPL, dzisiajISO, liczba } from '@/lib/format'
import type { KursWaluty } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'

/** Kursy NBP (tabela A). Pobierane codziennie przez pg_cron; przy ofercie w EUR zapisuje się kurs z dnia oferty. */
export function Kursy() {
  const { odswiez: odswiezSlowniki } = useSlowniki()
  const [kursy, setKursy] = useState<KursWaluty[]>([])
  const [reczny, setReczny] = useState({ waluta: 'EUR', data: dzisiajISO(), kurs: null as number | null })
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase.from('kursy_walut').select('*').order('data', { ascending: false }).order('waluta').limit(60)
    if (error) setBlad(komunikatPL(error.message))
    else setKursy((data ?? []) as KursWaluty[])
  }, [])

  useEffect(() => { void wczytaj() }, [wczytaj])

  async function pobierz() {
    setBlad(null); setKomunikat(null); setZajety(true)
    const { dane, blad: b } = await wywolajFunkcje<{ zapisane: { waluta: string; data: string; kurs: number }[]; bledy: string[] }>('kursy-walut', {})
    setZajety(false)
    if (b) { setBlad(b); return }
    setKomunikat(`Pobrano z NBP: ${dane?.zapisane.map((z) => `${z.waluta} ${liczba(z.kurs, 4)} (${dataPL(z.data)})`).join(', ')}` +
      (dane?.bledy.length ? `. Błędy: ${dane.bledy.join('; ')}` : ''))
    await Promise.all([wczytaj(), odswiezSlowniki()])
  }

  async function dodajReczny() {
    if (!reczny.kurs) { setBlad('Podaj kurs.'); return }
    setBlad(null); setZajety(true)
    const { error } = await supabase.from('kursy_walut').upsert({
      waluta: reczny.waluta.toUpperCase(), data: reczny.data, kurs: reczny.kurs, tabela: null, zrodlo: 'ręcznie',
    })
    setZajety(false)
    if (error) { setBlad(komunikatPL(error.message)); return }
    setKomunikat('Zapisano kurs ręczny.')
    await Promise.all([wczytaj(), odswiezSlowniki()])
  }

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      <div className="flex flex-wrap items-end gap-4">
        <Button wariant="akcent" disabled={zajety} onClick={() => void pobierz()}>
          <RefreshCw className="h-4 w-4" /> Pobierz z NBP teraz
        </Button>
        <div className="flex items-end gap-2 rounded-md border border-slate-200 bg-white p-2">
          <label><span className="etykieta">Waluta</span>
            <input className="pole w-20" value={reczny.waluta} onChange={(e) => setReczny({ ...reczny, waluta: e.target.value })} /></label>
          <label><span className="etykieta">Data</span>
            <input type="date" className="pole w-40" value={reczny.data} onChange={(e) => setReczny({ ...reczny, data: e.target.value })} /></label>
          <label><span className="etykieta">Kurs [PLN]</span>
            <div className="w-28 rounded-md border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={reczny.kurs} puste zmien={(n) => setReczny({ ...reczny, kurs: n })} /></div></label>
          <Button disabled={zajety} onClick={() => void dodajReczny()}><Plus className="h-4 w-4" /> Kurs ręczny</Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Kursy pobierają się automatycznie w dni robocze ok. 12:30 (tabela A NBP). W wycenie można zawsze wpisać kurs ręcznie.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead><tr>
            <th className="komorka-naglowek">Data</th><th className="komorka-naglowek">Waluta</th>
            <th className="komorka-naglowek text-right">Kurs</th><th className="komorka-naglowek">Tabela</th>
            <th className="komorka-naglowek">Źródło</th><th className="komorka-naglowek">Pobrano</th>
          </tr></thead>
          <tbody>
            {kursy.map((k) => (
              <tr key={`${k.waluta}-${k.data}`}>
                <td className="komorka">{dataPL(k.data)}</td>
                <td className="komorka font-medium">{k.waluta}</td>
                <td className="komorka liczba">{liczba(k.kurs, 4)}</td>
                <td className="komorka text-slate-500">{k.tabela}</td>
                <td className="komorka">{k.zrodlo}</td>
                <td className="komorka text-slate-500">{dataGodzinaPL(k.pobrano)}</td>
              </tr>
            ))}
            {kursy.length === 0 && <tr><td colSpan={6} className="komorka text-center text-slate-500">Brak kursów - kliknij „Pobierz z NBP teraz”.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

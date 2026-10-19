// Agregacja raportu "Raport_EN Export 3" z Registo. Do bazy trafiają WYŁĄCZNIE agregaty:
// projekt × miesiąc × MPK × wydział × rodzaj umowy × firma -> suma godzin.
// Kolumna z pracownikiem nie jest nawet czytana.
import { dataZSeryjnej, type WierszArkusza } from './importOptima'

export interface AgregatRegisto {
  projekt_numer: string
  projekt_nazwa: string
  mpk: string
  wydzial: string
  rodzaj_umowy: string
  firma: string
  godziny: number
}

export interface MiesiacRegisto {
  miesiac: string            // YYYY-MM-01
  wierszy: number
  pominietych: number        // bez numeru projektu
  godzin: number
  agregaty: AgregatRegisto[]
}

const KOLUMNY = {
  data: 'Data_EN',
  mpk: 'Mpk_EN',
  wydzial: 'Wydzial_EN',
  rodzaj_umowy: 'Rodzaj umowy_EN',
  firma: 'Firma_EN',
  projekt_numer: 'Numer Projektu_EN',
  projekt_nazwa: 'Projekt_EN',
  godziny: 'Ilosc godzin_EN',
} as const

const tekst = (k: WierszArkusza[number]) => (k === null || k === undefined ? '' : String(k).trim())

function miesiacZDaty(k: WierszArkusza[number]): string | null {
  if (typeof k === 'number') return `${dataZSeryjnej(k).slice(0, 7)}-01`
  const m = /^(\d{4})-(\d{2})/.exec(tekst(k)) ?? /^\d{2}\.(\d{2})\.(\d{4})/.exec(tekst(k))
  if (!m) return null
  return m[0].includes('.') ? `${m[2]}-${m[1]}-01` : `${m[1]}-${m[2]}-01`
}

export function agregujRegisto(wiersze: WierszArkusza[]): { miesiace: MiesiacRegisto[]; bledy: string[] } {
  const bledy: string[] = []
  const naglowekIdx = wiersze.findIndex((w) => w.some((k) => tekst(k) === KOLUMNY.projekt_numer))
  if (naglowekIdx < 0) return { miesiace: [], bledy: [`Nie znaleziono kolumny "${KOLUMNY.projekt_numer}" - to nie jest raport Export 3 z Registo.`] }
  const naglowek = wiersze[naglowekIdx].map(tekst)
  const idx = Object.fromEntries(Object.entries(KOLUMNY).map(([k, nazwa]) => [k, naglowek.indexOf(nazwa)])) as Record<keyof typeof KOLUMNY, number>
  for (const [k, i] of Object.entries(idx)) if (i < 0 && k !== 'projekt_nazwa') bledy.push(`Brak kolumny "${KOLUMNY[k as keyof typeof KOLUMNY]}".`)
  if (bledy.length) return { miesiace: [], bledy }

  const mapa = new Map<string, MiesiacRegisto & { _mapa: Map<string, AgregatRegisto> }>()
  for (const w of wiersze.slice(naglowekIdx + 1)) {
    if (w.every((k) => tekst(k) === '')) continue
    const miesiac = miesiacZDaty(w[idx.data])
    const godziny = typeof w[idx.godziny] === 'number' ? (w[idx.godziny] as number) : Number(tekst(w[idx.godziny]).replace(',', '.'))
    if (!miesiac || !Number.isFinite(godziny)) continue
    let m = mapa.get(miesiac)
    if (!m) { m = { miesiac, wierszy: 0, pominietych: 0, godzin: 0, agregaty: [], _mapa: new Map() }; mapa.set(miesiac, m) }
    m.wierszy++
    const numer = tekst(w[idx.projekt_numer])
    if (!numer) { m.pominietych++; continue }
    const a: AgregatRegisto = {
      projekt_numer: numer,
      projekt_nazwa: idx.projekt_nazwa >= 0 ? tekst(w[idx.projekt_nazwa]) : '',
      mpk: tekst(w[idx.mpk]).toUpperCase(),
      wydzial: tekst(w[idx.wydzial]).toUpperCase(),
      rodzaj_umowy: tekst(w[idx.rodzaj_umowy]).toLowerCase(),
      firma: tekst(w[idx.firma]),
      godziny: 0,
    }
    const klucz = [a.projekt_numer, a.mpk, a.wydzial, a.rodzaj_umowy, a.firma].join('|')
    const ist = m._mapa.get(klucz)
    if (ist) ist.godziny += godziny
    else { a.godziny = godziny; m._mapa.set(klucz, a) }
    m.godzin += godziny
  }
  const miesiace = [...mapa.values()].map(({ _mapa, ...m }) => ({
    ...m,
    godzin: Math.round(m.godzin * 100) / 100,
    agregaty: [..._mapa.values()].map((a) => ({ ...a, godziny: Math.round(a.godziny * 100) / 100 }))
      .sort((x, y) => x.projekt_numer.localeCompare(y.projekt_numer) || y.godziny - x.godziny),
  })).sort((a, b) => a.miesiac.localeCompare(b.miesiac))
  return { miesiace, bledy }
}

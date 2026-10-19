// Import listy materiałowej z arkusza (Excel z rysunku, wykaz części) do pozycji wyceny.
// Klasyfikacja do kategorii regułami z normalizacjaNazw; niepewne wiersze mają niską pewność.
import { normalizujNazwe, znajdzGatunek } from './normalizacjaNazw'
import type { WierszArkusza } from './importOptima'
import { klucz, type PozycjaWyceny } from './wyceny'

export interface WierszListy {
  lp: number
  nazwa: string
  sekcja: string
  gatunek: string | null
  norma: string | null
  d_zew: number | null; d_wew: number | null; grubosc: number | null; szerokosc: number | null; dlugosc: number | null
  dn: string | null; pn: string | null
  ilosc: number
  jm: string
  masa_jedn: number | null
  uwagi: string | null
  pewnosc: number
}

const tekst = (k: WierszArkusza[number]) => (k === null || k === undefined ? '' : String(k).replace(/\s+/g, ' ').trim())
const liczba = (k: WierszArkusza[number]) => {
  if (typeof k === 'number') return k
  const n = Number(tekst(k).replace(/\s/g, '').replace(',', '.'))
  return tekst(k) && Number.isFinite(n) ? n : null
}

const KOLUMNY: [keyof Mapa, RegExp][] = [
  ['lp', /^(lp|poz|nr|l\.p|item|pos)/i],
  ['nazwa', /nazwa|opis|przeznacz|element|część|czesc|name|description/i],
  ['ilosc', /^il|ilość|ilosc|szt\.?$|qty|quantity/i],
  ['jm', /^j\.?\s?m|jednost|unit/i],
  ['gatunek', /materia|gatunek|grade/i],
  ['wymiary', /wymiar|dimens|rozmiar/i],
  ['masa_jedn', /masa jedn|waga jedn|masa szt|unit weight|kg\/szt/i],
  ['masa_calk', /masa całk|masa calk|waga całk|masa razem|total weight|^masa$|^waga$/i],
  ['norma', /norma|standard/i],
  ['uwagi', /uwagi|remarks|notes/i],
]
interface Mapa { lp: number; nazwa: number; ilosc: number; jm: number; gatunek: number; wymiary: number; masa_jedn: number; masa_calk: number; norma: number; uwagi: number }

export function rozpoznajListe(wiersze: WierszArkusza[]): { pozycje: WierszListy[]; blad: string | null } {
  const idx = wiersze.findIndex((w) => w.some((k) => /nazwa|opis|przeznacz|description/i.test(tekst(k))) && w.some((k) => /ilo|qty|szt/i.test(tekst(k))))
  if (idx < 0) return { pozycje: [], blad: 'Nie znaleziono wiersza nagłówka (kolumny z nazwą i ilością).' }
  const naglowek = wiersze[idx].map(tekst)
  const mapa = {} as Mapa
  for (const [pole, wzor] of KOLUMNY) {
    const i = naglowek.findIndex((n, j) => wzor.test(n) && !Object.values(mapa).includes(j))
    mapa[pole] = i
  }
  if (mapa.nazwa < 0) return { pozycje: [], blad: 'Brak kolumny z nazwą elementu.' }
  const pozycje: WierszListy[] = []
  for (const w of wiersze.slice(idx + 1)) {
    const nazwa = tekst(w[mapa.nazwa])
    if (!nazwa || /^razem|^suma/i.test(nazwa)) continue
    const wym = mapa.wymiary >= 0 ? tekst(w[mapa.wymiary]) : ''
    const gat = mapa.gatunek >= 0 ? tekst(w[mapa.gatunek]) : ''
    const norm = normalizujNazwe(`${nazwa} ${wym} ${gat}`)
    const ilosc = (mapa.ilosc >= 0 ? liczba(w[mapa.ilosc]) : null) ?? 1
    const masaJedn = mapa.masa_jedn >= 0 ? liczba(w[mapa.masa_jedn]) : null
    const masaCalk = mapa.masa_calk >= 0 ? liczba(w[mapa.masa_calk]) : null
    pozycje.push({
      lp: (mapa.lp >= 0 ? liczba(w[mapa.lp]) : null) ?? pozycje.length + 1,
      nazwa: [nazwa, wym].filter(Boolean).join(' '),
      sekcja: norm.rodzaj === 'material' ? norm.kategoria ?? 'inne' : 'inne',
      gatunek: znajdzGatunek(gat.toUpperCase()) ?? (gat || norm.gatunek),
      norma: (mapa.norma >= 0 ? tekst(w[mapa.norma]) : '') || norm.norma,
      d_zew: norm.d_zew, d_wew: norm.d_wew, grubosc: norm.grubosc, szerokosc: norm.szerokosc, dlugosc: norm.dlugosc,
      dn: norm.dn, pn: norm.pn,
      ilosc, jm: (mapa.jm >= 0 ? tekst(w[mapa.jm]) : '') || 'szt',
      masa_jedn: masaJedn ?? (masaCalk !== null && ilosc ? masaCalk / ilosc : null),
      uwagi: mapa.uwagi >= 0 ? tekst(w[mapa.uwagi]) || null : null,
      pewnosc: norm.pewnosc === 'wysoka' && norm.rodzaj === 'material' ? 0.9 : 0.5,
    })
  }
  return { pozycje, blad: pozycje.length ? null : 'Brak pozycji pod nagłówkiem.' }
}

/** Wiersze listy -> pozycje zakładki Materiały (cena do uzupełnienia, źródło: lista). */
export function pozycjeZListy(wiersze: WierszListy[], opisZrodla: string | null = null): PozycjaWyceny[] {
  return wiersze.map((w) => ({
    klucz: klucz(), lp: w.lp, zakladka: 'materialy', sekcja: w.sekcja, nazwa: w.nazwa, gatunek: w.gatunek,
    d_zew: w.d_zew, d_wew: w.d_wew, grubosc: w.grubosc, szerokosc: w.szerokosc, dlugosc: w.dlugosc, dn: w.dn, pn: w.pn,
    ilosc: w.ilosc, jm: w.jm, masa_jedn: w.masa_jedn, masa_reczna: w.masa_jedn !== null, cena_jedn: 0, jednostka_ceny: 'kg',
    zrodlo_ceny: 'recznie', zrodlo_opis: opisZrodla, uwagi: [w.norma, w.uwagi].filter(Boolean).join('; ') || null, pewnosc: w.pewnosc, dodatkowe: {},
  }))
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import type {
  Gatunek, KategoriaMaterialu, KategoriaUslugi, KursWaluty, Mpk, RodzajStali, StawkaRobocizny, Ustawienia,
} from './types'

interface Slowniki {
  gotowe: boolean
  blad: string | null
  ustawienia: Ustawienia
  mpk: Mpk[]
  stawki: StawkaRobocizny[]
  rodzajeStali: RodzajStali[]
  gatunki: Gatunek[]
  kategorieMaterialow: KategoriaMaterialu[]
  kategorieUslug: KategoriaUslugi[]
  /** Najnowszy kurs każdej waluty. */
  kursy: Record<string, KursWaluty>
  odswiez: () => Promise<void>
}

const PUSTE_USTAWIENIA = {
  narzut_zakupowy_proc: 5,
  narzut_kooperacja_proc: 0,
  wiek_ceny_ostrzezenie_mies: 6,
  waznosc_oferty_dostawcy_ryzyko_dni: 7,
  wspolczynnik_ilosci_materialu: 1.1,
  oferta_domyslne: { gwarancja_mies: 24, waznosc_dni: 30, platnosc: 'DH', vat_proc: 23 },
  firma: { nazwa: '', adres: '', krs: '', nip: '', regon: '', oddzialy: [], zarzad: [], email: '', telefon: '', www: '' },
  limity_planu: { baza_mb: 500, storage_mb: 1024, plik_mb: 50, ostrzezenie_proc: 80 },
  zapytania_dostawcow: {
    dw: '', dni_bez_odpowiedzi: 5, dni_na_odpowiedz: 5, powitanie: 'Dzień dobry,', wstep_material: 'Proszę o ofertę na materiał jak poniżej',
    wstep_usluga: 'Proszę o ofertę na usługę jak poniżej', zakonczenie: '', podpis: 'Z poważaniem', wymagania: [],
  },
} satisfies Ustawienia

const Kontekst = createContext<Slowniki | null>(null)

export function DostawcaSlownikow({ children }: { children: ReactNode }) {
  const [stan, setStan] = useState<Omit<Slowniki, 'odswiez'>>({
    gotowe: false, blad: null, ustawienia: PUSTE_USTAWIENIA, mpk: [], stawki: [], rodzajeStali: [],
    gatunki: [], kategorieMaterialow: [], kategorieUslug: [], kursy: {},
  })

  const odswiez = useCallback(async () => {
    const [ust, mpk, stawki, rodzaje, gatunki, kmat, kusl, kursy] = await Promise.all([
      supabase.from('ustawienia').select('klucz, wartosc'),
      supabase.from('mpk').select('*').order('kod'),
      supabase.from('stawki_robocizny').select('*').order('kolejnosc').order('id'),
      supabase.from('rodzaje_stali').select('*').order('kod'),
      supabase.from('gatunki').select('*').order('grupa').order('kod'),
      supabase.from('kategorie_materialow').select('*').order('kolejnosc'),
      supabase.from('kategorie_uslug').select('*').order('kolejnosc'),
      supabase.from('kursy_walut').select('*').order('data', { ascending: false }).limit(20),
    ])
    const blad = [ust, mpk, stawki, rodzaje, gatunki, kmat, kusl, kursy].find((r) => r.error)?.error
    if (blad) {
      setStan((s) => ({ ...s, blad: komunikatPL(blad.message) }))
      return
    }
    const ustawienia = { ...PUSTE_USTAWIENIA } as Ustawienia
    for (const w of ust.data ?? []) ustawienia[w.klucz] = w.wartosc
    const najnowsze: Record<string, KursWaluty> = {}
    for (const k of (kursy.data ?? []) as KursWaluty[]) if (!najnowsze[k.waluta]) najnowsze[k.waluta] = k
    setStan({
      gotowe: true,
      blad: null,
      ustawienia,
      mpk: (mpk.data ?? []) as Mpk[],
      stawki: (stawki.data ?? []) as StawkaRobocizny[],
      rodzajeStali: (rodzaje.data ?? []) as RodzajStali[],
      gatunki: (gatunki.data ?? []) as Gatunek[],
      kategorieMaterialow: (kmat.data ?? []) as KategoriaMaterialu[],
      kategorieUslug: (kusl.data ?? []) as KategoriaUslugi[],
      kursy: najnowsze,
    })
  }, [])

  useEffect(() => { void odswiez() }, [odswiez])

  const wartosc = useMemo(() => ({ ...stan, odswiez }), [stan, odswiez])
  return <Kontekst.Provider value={wartosc}>{children}</Kontekst.Provider>
}

export function useSlowniki() {
  const s = useContext(Kontekst)
  if (!s) throw new Error('useSlowniki poza DostawcaSlownikow')
  return s
}

/** Normalizuje zapis gatunku do porównań: "a350 lf-2" i "A350LF2" to to samo. */
export function kluczGatunku(tekst: string) {
  return tekst.toUpperCase().replace(/[\s.\-_/]/g, '').replace(/^ASTM|^ASME/, '')
}

/** Gatunki równoważne (ta sama grupa w słowniku). Nieznany gatunek = tylko on sam. */
export function rownowazniki(gatunek: string, gatunki: Gatunek[]): string[] {
  const k = kluczGatunku(gatunek)
  const trafiony = gatunki.find((g) => kluczGatunku(g.kod) === k || kluczGatunku(g.grupa) === k)
  if (!trafiony) return [gatunek]
  return gatunki.filter((g) => g.grupa === trafiony.grupa).map((g) => g.kod)
}

/** Gęstość [kg/dm³] gatunku ze słownika; nieznany gatunek - stal węglowa albo nierdzewna z nazwy. */
export function gestoscGatunku(gatunek: string | null | undefined, gatunki: Gatunek[], rodzaje: RodzajStali[]): number {
  const domyslna = (kod: string) => rodzaje.find((r) => r.kod === kod)?.gestosc ?? (kod === 'nierdzewna' ? 7.93 : 7.85)
  if (!gatunek) return domyslna('weglowa')
  const k = kluczGatunku(gatunek)
  const g = gatunki.find((x) => kluczGatunku(x.kod) === k || kluczGatunku(x.grupa) === k)
  if (g) return domyslna(g.rodzaj_stali)
  // 1.4xxx i 3xx (304, 316L, 321) to nierdzewne.
  return /^1\.4\d{3}|^(30|31|32)\d/.test(gatunek.trim().replace(/^(SA|A)/i, '')) ? domyslna('nierdzewna') : domyslna('weglowa')
}

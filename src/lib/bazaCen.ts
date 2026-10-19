// Wspólny widok cen z ofert dostawców i zakupów historycznych (karty dostawy Optimy)
// - dla porównywarki, widoku usług i podpowiedzi "Znajdź cenę" w wycenie.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { kluczGatunku, rownowazniki } from './slowniki'
import type { Gatunek } from './types'
import type { JednostkaCeny } from './kalkulacja'

export interface WierszCeny {
  klucz: string
  zrodlo: 'oferta' | 'zakup'
  id_zrodla: string                // id oferty albo numer karty
  pozycja_id: number
  data: string | null
  dostawca: string
  opis: string
  kategoria_materialu: string | null
  kategoria_uslugi: string | null
  gatunek: string | null
  d_zew: number | null; d_wew: number | null; grubosc: number | null; szerokosc: number | null; dlugosc: number | null
  dn: string | null; pn: string | null
  ilosc: number
  jm: string
  cena_jedn: number
  waluta: string
  wartosc_pln: number
  masa_calk: number | null
  cena_pln_kg: number | null
  cena_pln_m: number | null
  cena_pln_szt: number | null
  cena_pln_odniesienia: number | null
  jednostka_odniesienia: string | null
  wielkosc_odniesienia: number | null
  termin: string | null
  termin_dni: number | null
  waznosc_do: string | null
  waznosc_opis: string | null
  warunki: string | null
  wymagania: Record<string, unknown>
  doplaty: { opis: string; kwota: number; za: string }[]
  nr_zo: string | null
  zapytanie_id: string | null
  uwagi: string | null
}

interface PozycjaOfertyDb {
  id: number; opis: string; kategoria_materialu: string | null; kategoria_uslugi: string | null; gatunek: string | null
  d_zew: number | null; d_wew: number | null; grubosc: number | null; szerokosc: number | null; dlugosc: number | null
  dn: string | null; pn: string | null; ilosc: number; jm: string; cena_jedn: number; wartosc: number | null
  masa_calk: number | null; cena_pln_kg: number | null; cena_pln_m: number | null; cena_pln_szt: number | null
  cena_pln_odniesienia: number | null; jednostka_odniesienia: string | null; wielkosc_odniesienia: number | null
  termin_dni: number | null; uwagi: string | null
  oferty_dostawcow: {
    id: string; data_oferty: string | null; waluta: string; kurs: number; waznosc_do: string | null; waznosc_opis: string | null
    termin_realizacji: string | null; termin_dni: number | null; warunki_dostawy: string | null; miejsce_dostawy: string | null
    status: string; nr_zo: string | null; zapytanie_id: string | null; doplaty: WierszCeny['doplaty']; wymagania: Record<string, unknown>
    dostawcy: { nazwa: string } | null
  }
}

export async function wczytajCeny(opcje: { zakupy?: boolean; zapytanieId?: string } = {}, db: SupabaseClient = supabase): Promise<{ wiersze: WierszCeny[]; blad: string | null }> {
  let zapytanie = db.from('pozycje_ofert')
    .select('*, oferty_dostawcow!inner(id, data_oferty, waluta, kurs, waznosc_do, waznosc_opis, termin_realizacji, termin_dni, warunki_dostawy, miejsce_dostawy, status, nr_zo, zapytanie_id, doplaty, wymagania, dostawcy(nazwa))')
    .eq('oferty_dostawcow.status', 'zatwierdzona')
    .limit(5000)
  if (opcje.zapytanieId) zapytanie = zapytanie.eq('oferty_dostawcow.zapytanie_id', opcje.zapytanieId)
  const { data, error } = await zapytanie
  if (error) return { wiersze: [], blad: komunikatPL(error.message) }

  const wiersze: WierszCeny[] = ((data ?? []) as unknown as PozycjaOfertyDb[]).map((p) => {
    const o = p.oferty_dostawcow
    return {
      klucz: `o${p.id}`, zrodlo: 'oferta', id_zrodla: o.id, pozycja_id: p.id, data: o.data_oferty,
      dostawca: o.dostawcy?.nazwa ?? '?', opis: p.opis,
      kategoria_materialu: p.kategoria_materialu, kategoria_uslugi: p.kategoria_uslugi, gatunek: p.gatunek,
      d_zew: p.d_zew, d_wew: p.d_wew, grubosc: p.grubosc, szerokosc: p.szerokosc, dlugosc: p.dlugosc, dn: p.dn, pn: p.pn,
      ilosc: Number(p.ilosc), jm: p.jm, cena_jedn: Number(p.cena_jedn), waluta: o.waluta,
      wartosc_pln: Number(p.wartosc ?? p.ilosc * p.cena_jedn) * Number(o.kurs),
      masa_calk: p.masa_calk, cena_pln_kg: p.cena_pln_kg, cena_pln_m: p.cena_pln_m, cena_pln_szt: p.cena_pln_szt,
      cena_pln_odniesienia: p.cena_pln_odniesienia, jednostka_odniesienia: p.jednostka_odniesienia, wielkosc_odniesienia: p.wielkosc_odniesienia,
      termin: o.termin_realizacji, termin_dni: p.termin_dni ?? o.termin_dni, waznosc_do: o.waznosc_do, waznosc_opis: o.waznosc_opis,
      warunki: [o.warunki_dostawy, o.miejsce_dostawy].filter(Boolean).join(' ') || null,
      wymagania: o.wymagania ?? {}, doplaty: o.doplaty ?? [], nr_zo: o.nr_zo, zapytanie_id: o.zapytanie_id, uwagi: p.uwagi,
    }
  })

  if (opcje.zakupy) {
    const { data: zak, error: bz } = await db.from('zakupy')
      .select('id, numer_karty, nr_zamowienia, dostawca_nazwa, nazwa, ilosc, jm, cena_jedn, wartosc, data_dostawy, rodzaj, kategoria, kategoria_uslugi, gatunek, d_zew, d_wew, grubosc, szerokosc, dlugosc, dn, pn, masa_kg, cena_kg, zmodyfikowano')
      .in('rodzaj', ['material', 'usluga'])
      .limit(10000)
    if (bz) return { wiersze, blad: komunikatPL(bz.message) }
    for (const z of zak ?? []) {
      const naM = ['m', 'mb'].includes(String(z.jm).toLowerCase())
      const naSzt = ['szt', 'szt.', 'kpl'].includes(String(z.jm).toLowerCase())
      wiersze.push({
        klucz: `z${z.id}`, zrodlo: 'zakup', id_zrodla: z.numer_karty, pozycja_id: z.id,
        data: z.data_dostawy ?? String(z.zmodyfikowano).slice(0, 10),
        dostawca: z.dostawca_nazwa ?? '?', opis: z.nazwa,
        kategoria_materialu: z.rodzaj === 'material' ? z.kategoria : null, kategoria_uslugi: z.rodzaj === 'usluga' ? z.kategoria_uslugi : null,
        gatunek: z.gatunek, d_zew: z.d_zew, d_wew: z.d_wew, grubosc: z.grubosc, szerokosc: z.szerokosc, dlugosc: z.dlugosc, dn: z.dn, pn: z.pn,
        ilosc: Number(z.ilosc), jm: z.jm ?? '', cena_jedn: Number(z.cena_jedn), waluta: 'PLN', wartosc_pln: Number(z.wartosc),
        masa_calk: z.masa_kg, cena_pln_kg: z.cena_kg, cena_pln_m: naM ? Number(z.cena_jedn) : null, cena_pln_szt: naSzt ? Number(z.cena_jedn) : null,
        cena_pln_odniesienia: null, jednostka_odniesienia: null, wielkosc_odniesienia: null,
        termin: null, termin_dni: null, waznosc_do: null, waznosc_opis: null, warunki: z.nr_zamowienia, wymagania: {}, doplaty: [],
        nr_zo: null, zapytanie_id: null, uwagi: `karta ${z.numer_karty}`,
      })
    }
  }
  return { wiersze, blad: null }
}

export interface FiltrCen {
  tekst: string
  kategoria: string            // 'm:kod' / 'u:kod' / ''
  gatunek: string
  d_zew: number | null
  grubosc: number | null
  tolerancja_proc: number      // dopasowanie wymiarów ±%
  dostawca: string
  od: string
  tylkoWazne: boolean
  udarnosc45: boolean
  zrodla: { oferta: boolean; zakup: boolean }
}

export const PUSTY_FILTR: FiltrCen = {
  tekst: '', kategoria: '', gatunek: '', d_zew: null, grubosc: null, tolerancja_proc: 10, dostawca: '', od: '',
  tylkoWazne: false, udarnosc45: false, zrodla: { oferta: true, zakup: true },
}

const blisko = (a: number | null, b: number | null, proc: number) => b === null || (a !== null && Math.abs(a - b) <= Math.abs(b) * proc / 100 + 0.01)

/** Gatunek pasuje, jeśli którykolwiek z zapisów (np. "1.4301/1.4307") jest w grupie równoważności szukanego. */
export function gatunekPasuje(gatunekWiersza: string | null, szukany: string, gatunki: Gatunek[]) {
  if (!szukany.trim()) return true
  if (!gatunekWiersza) return false
  const dozwolone = new Set(rownowazniki(szukany, gatunki).map(kluczGatunku))
  dozwolone.add(kluczGatunku(szukany))
  return gatunekWiersza.split('/').some((g) => dozwolone.has(kluczGatunku(g)) || kluczGatunku(g).includes(kluczGatunku(szukany)))
}

export function filtrujCeny(wiersze: WierszCeny[], f: FiltrCen, gatunki: Gatunek[], dzis = new Date().toISOString().slice(0, 10)) {
  const tekst = f.tekst.trim().toLowerCase()
  const [rodzajKat, kodKat] = f.kategoria.split(':')
  return wiersze.filter((w) =>
    f.zrodla[w.zrodlo]
    && (!tekst || `${w.opis} ${w.dostawca} ${w.gatunek ?? ''} ${w.nr_zo ?? ''}`.toLowerCase().includes(tekst))
    && (!f.kategoria || (rodzajKat === 'm' ? w.kategoria_materialu === kodKat : w.kategoria_uslugi === kodKat))
    && gatunekPasuje(w.gatunek, f.gatunek, gatunki)
    && blisko(w.d_zew, f.d_zew, f.tolerancja_proc)
    && blisko(w.grubosc, f.grubosc, f.tolerancja_proc)
    && (!f.dostawca || w.dostawca.toLowerCase().includes(f.dostawca.toLowerCase()))
    && (!f.od || (w.data ?? '') >= f.od)
    && (!f.tylkoWazne || (w.zrodlo === 'oferta' && (!w.waznosc_do || w.waznosc_do >= dzis)))
    && (!f.udarnosc45 || Number(w.wymagania.udarnosc_temp ?? 0) <= -45),
  )
}

export interface GrupaPorownania {
  klucz: string
  nazwa: string
  wiersze: (WierszCeny & { cena_pln_jm: number })[]
  /** Miara porównania: cena PLN za jm, gdy wszyscy podali tę samą jm; inaczej PLN/kg. */
  miara: 'jm' | 'kg'
  najtansza: string | null    // klucz wiersza
  najszybsza: string | null
}

const zaokr = (n: number | null) => (n === null ? '' : String(Math.round(n)))

/**
 * Grupuje pozycje ofert do jednego zapytania wg "tego samego elementu": kategoria + gatunek
 * + zaokrąglone wymiary (albo początek opisu, gdy wymiarów brak). Wyróżnia najlepszą cenę
 * i najkrótszy termin w grupie.
 */
export function grupujDoPorownania(wiersze: WierszCeny[]): GrupaPorownania[] {
  const mapa = new Map<string, GrupaPorownania>()
  for (const w of wiersze) {
    const kat = w.kategoria_materialu ?? w.kategoria_uslugi ?? 'inne'
    const wym = [zaokr(w.d_zew), zaokr(w.d_wew), zaokr(w.grubosc), zaokr(w.szerokosc), w.dn ?? ''].join('x')
    const maWymiary = wym.replace(/x/g, '') !== ''
    const gat = (w.gatunek ?? '').split('/')[0].toUpperCase().replace(/[\s.\-]/g, '')
    const klucz = maWymiary ? `${kat}|${gat}|${wym}` : `${kat}|${w.opis.toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '').slice(0, 24)}`
    const g = mapa.get(klucz) ?? { klucz, nazwa: w.opis, wiersze: [], miara: 'jm', najtansza: null, najszybsza: null }
    g.wiersze.push({ ...w, cena_pln_jm: w.ilosc ? w.wartosc_pln / w.ilosc : w.wartosc_pln })
    mapa.set(klucz, g)
  }
  for (const g of mapa.values()) {
    const jm = new Set(g.wiersze.map((w) => w.jm.toLowerCase().replace('.', '')))
    g.miara = jm.size > 1 && g.wiersze.every((w) => w.cena_pln_kg !== null) ? 'kg' : 'jm'
    const cena = (w: GrupaPorownania['wiersze'][number]) => (g.miara === 'kg' ? w.cena_pln_kg! : w.cena_pln_jm)
    g.najtansza = [...g.wiersze].sort((a, b) => cena(a) - cena(b))[0]?.klucz ?? null
    g.najszybsza = [...g.wiersze].filter((w) => w.termin_dni !== null).sort((a, b) => a.termin_dni! - b.termin_dni!)[0]?.klucz ?? null
    g.wiersze.sort((a, b) => cena(a) - cena(b))
  }
  return [...mapa.values()].sort((a, b) => b.wiersze.length - a.wiersze.length || a.nazwa.localeCompare(b.nazwa))
}

// --- Cena z bazy -> pozycja wyceny ----------------------------------------------------------------

/** Cena skopiowana do pozycji wyceny razem ze źródłem i datą (kopia, nie referencja). */
export interface WybranaCena {
  cena_jedn: number
  jednostka_ceny: JednostkaCeny
  zrodlo_ceny: 'oferta' | 'zakup'
  zrodlo_opis: string
  zrodlo_dostawca: string
  zrodlo_data: string | null
  zrodlo_waznosc_do: string | null
  zrodlo_termin_dni: number | null
  zrodlo_id: string
  /** Jednostka i ilość pozycji źródłowej (np. usługa wyceniona ryczałtem "1 kpl") - nie kopiowane do wyceny. */
  jm_zrodla?: string
  ilosc_zrodla?: number
}

/** Cena z wiersza bazy w mierze pozycji (zł/kg, zł/m, zł/szt); usługi - za jednostkę oferty. */
export function cenaZWiersza(w: WierszCeny, jednostka: JednostkaCeny, uslugi = false): WybranaCena {
  let cena: number
  let j: JednostkaCeny
  if (uslugi) { cena = w.ilosc ? w.wartosc_pln / w.ilosc : w.wartosc_pln; j = 'jm' }
  else if (jednostka === 'kg' && w.cena_pln_kg !== null) { cena = w.cena_pln_kg; j = 'kg' }
  else if (jednostka === 'm' && w.cena_pln_m !== null) { cena = w.cena_pln_m; j = 'm' }
  else if (w.cena_pln_szt !== null) { cena = w.cena_pln_szt; j = 'jm' }
  else if (w.cena_pln_kg !== null) { cena = w.cena_pln_kg; j = 'kg' }
  else { cena = w.ilosc ? w.wartosc_pln / w.ilosc : w.wartosc_pln; j = 'jm' }
  return {
    cena_jedn: Math.round(cena * 100) / 100, jednostka_ceny: j, zrodlo_ceny: w.zrodlo,
    zrodlo_opis: w.opis.slice(0, 200), zrodlo_dostawca: w.dostawca, zrodlo_data: w.data, zrodlo_waznosc_do: w.waznosc_do,
    zrodlo_termin_dni: w.termin_dni, zrodlo_id: `${w.zrodlo}:${w.id_zrodla}:${w.pozycja_id}`, jm_zrodla: w.jm, ilosc_zrodla: w.ilosc,
  }
}

export interface PozycjaDoCeny {
  sekcja: string | null
  gatunek?: string | null
  d_zew?: number | null
  grubosc?: number | null
  jednostka_ceny: JednostkaCeny
}

/**
 * Automatyczny dobór ceny (wstępna wycena): ta sama kategoria, gatunek z równoważnikami i wymiary ±15%.
 * Kolejność: oferty zebrane do tego zapytania (`zapytanieId`) → ważne oferty (najnowsze) → zakupy (najnowsze)
 * → przeterminowane oferty. Gdy wymiarów nie ma w bazie, dla cen za kg wystarcza kategoria + gatunek
 * (dopasowanie przybliżone). Brak kategorii = brak ceny.
 */
export function dobierzCene(p: PozycjaDoCeny, wiersze: WierszCeny[], gatunki: Gatunek[], uslugi = false, dzis = new Date().toISOString().slice(0, 10), zapytanieId: string | null = null)
  : (WybranaCena & { dopasowanie: 'dokladne' | 'przyblizone' }) | null {
  if (!p.sekcja) return null
  const zakres = uslugi ? wiersze.filter((w) => w.kategoria_uslugi) : wiersze.filter((w) => !w.kategoria_uslugi)
  const miara = (w: WierszCeny) => (uslugi ? w.wartosc_pln
    : p.jednostka_ceny === 'kg' ? w.cena_pln_kg : p.jednostka_ceny === 'm' ? w.cena_pln_m : w.cena_pln_szt)
  // Oferta do tego zapytania to cena "bieżąca" (dział handlowy zebrał ją właśnie na tę wycenę) - także po terminie ważności.
  const ranga = (w: WierszCeny) => (zapytanieId && w.zrodlo === 'oferta' && w.zapytanie_id === zapytanieId ? -1
    : w.zrodlo === 'oferta' && (!w.waznosc_do || w.waznosc_do >= dzis) ? 0 : w.zrodlo === 'zakup' ? 1 : 2)
  const proby: { d_zew: number | null; grubosc: number | null; dopasowanie: 'dokladne' | 'przyblizone' }[] = [
    { d_zew: p.d_zew ?? null, grubosc: p.grubosc ?? null, dopasowanie: 'dokladne' },
    ...(!uslugi && p.jednostka_ceny === 'kg' && (p.d_zew || p.grubosc) ? [{ d_zew: null, grubosc: null, dopasowanie: 'przyblizone' as const }] : []),
  ]
  for (const proba of proby) {
    const kandydaci = filtrujCeny(zakres, {
      ...PUSTY_FILTR, kategoria: `${uslugi ? 'u' : 'm'}:${p.sekcja}`, gatunek: uslugi ? '' : p.gatunek ?? '',
      d_zew: proba.d_zew, grubosc: proba.grubosc, tolerancja_proc: 15,
    }, gatunki, dzis)
      .filter((w) => miara(w) !== null && Number(miara(w)) > 0)
      .sort((a, b) => ranga(a) - ranga(b) || (b.data ?? '').localeCompare(a.data ?? ''))
    if (kandydaci.length) return { ...cenaZWiersza(kandydaci[0], p.jednostka_ceny, uslugi), dopasowanie: proba.dopasowanie }
  }
  return null
}

/** Wiek ceny w miesiącach (do oznaczania cen nieaktualnych). */
export function wiekMiesiecy(data: string | null, dzis = new Date()) {
  if (!data) return null
  const d = new Date(data)
  return (dzis.getFullYear() - d.getFullYear()) * 12 + (dzis.getMonth() - d.getMonth()) + (dzis.getDate() < d.getDate() ? -1 : 0)
}

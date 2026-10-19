// Parser wydruku "KARTA DOSTAWY" z Optimy (XLS w formacie BIFF, czytany przez SheetJS).
// Indeksy kolumn od 0: [0] materiał / nr zamówienia, [2] dostawca, [7] ilość, [8] j.m.,
// [9] ilość zrealizowana (albo suma zamówienia), [10] cena jedn., [11] wartość,
// [13] status albo data dostawy (liczba seryjna Excela), [15] status przy dacie w [13].
import { masaPozycji, normalizujNazwe, type PozycjaZnormalizowana } from './normalizacjaNazw'

export type Komorka = string | number | boolean | null | undefined
export type WierszArkusza = Komorka[]

export interface PozycjaKarty extends PozycjaZnormalizowana {
  klucz: string
  nr_zamowienia: string
  typ_zamowienia: 'ZM' | 'ZJ' | string
  dostawca_nazwa: string
  nazwa: string
  ilosc: number
  jm: string
  ilosc_zrealizowana: number | null
  cena_jedn: number
  wartosc: number
  status: string | null
  data_dostawy: string | null
  masa_kg: number | null
  masa_zrodlo: 'jm' | 'wymiary' | null
}

export interface KartaDostawy {
  numer_karty: string
  suma_stopka: number | null
  suma_pozycji: number
  /** Suma wierszy sum zamówień (tylko kol. 9). Stopka Optimy to dokładnie ta suma. */
  suma_zamowien: number
  zgodna: boolean
  pozycje: PozycjaKarty[]
  /** Zamówienia, których suma na wydruku różni się od sumy pozycji o grosze (zaokrąglenia Optimy). */
  zaokraglenia: { nr_zamowienia: string; suma_pozycji: number; suma_zamowienia: number }[]
  ostrzezenia: string[]
}

const NR_ZAMOWIENIA = /^(Z[A-Z])\/\d+\/\d{4}$/

/** Liczba seryjna daty Excela -> ISO (46142 = 2026-04-30). */
export function dataZSeryjnej(n: number): string {
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10)
}

/** "244 966,13" (z twardą spacją) -> 244966.13 */
export function liczbaPL(tekst: string): number | null {
  const m = /-?[\d\s .]*\d(?:,\d+)?/.exec(tekst)
  if (!m) return null
  const n = Number(m[0].replace(/[\s .]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const tekst = (k: Komorka) => (typeof k === 'string' ? k.replace(/ /g, ' ').trim() : k === null || k === undefined ? '' : String(k))
// Zaokrąglenie do 6 miejsc usuwa artefakty zapisu binarnego (3.7600000000000002).
const num = (k: Komorka) => (typeof k === 'number' && Number.isFinite(k) ? Math.round(k * 1e6) / 1e6 : null)
const zaokr = (n: number) => Math.round(n * 100) / 100

function czyNaglowekStrony(w: WierszArkusza) {
  const c0 = tekst(w[0])
  return /^(Nr zamówienia|Materiał|KARTA DOSTAWY|Godzina wydruku)/i.test(c0)
    || w.some((k) => typeof k === 'string' && /^(Strona \d+ z \d+|Ilość \/ zrealizowana|Cena \/ j\.|Data dostawy|Dostawca)$/i.test(k.trim()))
}

export function parsujKarteDostawy(wiersze: WierszArkusza[]): KartaDostawy {
  const ostrzezenia: string[] = []
  let numer = ''
  let sumaStopka: number | null = null
  let sumaZamowien = 0
  let zamowienie: { nr: string; typ: string; dostawca: string; suma: number } | null = null
  const pozycje: PozycjaKarty[] = []
  const zaokraglenia: KartaDostawy['zaokraglenia'] = []
  const wystapienia = new Map<string, number>()

  for (const w of wiersze) {
    const c0 = tekst(w[0])
    const naglowekKarty = /KARTA DOSTAWY\s+(\S+)/i.exec(c0)
    if (naglowekKarty) { numer = numer || naglowekKarty[1]; continue }
    const stopka = w.map(tekst).find((k) => /Suma dostaw:/i.test(k))
    if (stopka) { sumaStopka = liczbaPL(stopka.replace(/.*Suma dostaw:/i, '')); continue }
    // Najpierw zamówienie: nazwa dostawcy mogłaby wyglądać jak nagłówek kolumny.
    if (NR_ZAMOWIENIA.test(c0)) {
      zamowienie = { nr: c0, typ: c0.slice(0, 2), dostawca: tekst(w[2]), suma: 0 }
      continue
    }
    if (czyNaglowekStrony(w)) continue

    const ilosc = num(w[7]); const wartosc = num(w[11]); const cena = num(w[10])
    if (c0 === '' && num(w[9]) !== null && ilosc === null && wartosc === null) {
      const sumaWydruk = num(w[9])!   // wiersz sumy zamówienia
      sumaZamowien += sumaWydruk
      if (zamowienie && Math.abs(zaokr(zamowienie.suma) - sumaWydruk) >= 0.005) {
        zaokraglenia.push({ nr_zamowienia: zamowienie.nr, suma_pozycji: zaokr(zamowienie.suma), suma_zamowienia: sumaWydruk })
      }
      continue
    }

    if (c0 !== '' && ilosc !== null && wartosc !== null) {
      if (!zamowienie) { ostrzezenia.push(`Pozycja bez zamówienia: ${c0}`); continue }
      const nazwa = c0.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
      const s13 = w[13]; const s15 = tekst(w[15])
      const status = typeof s13 === 'string' ? tekst(s13) : s15 || null
      const data = typeof s13 === 'number' ? dataZSeryjnej(s13) : null
      const jm = tekst(w[8])
      const norm = normalizujNazwe(nazwa, { typZamowienia: zamowienie.typ })
      const masa = masaPozycji(norm, ilosc, jm)
      zamowienie.suma += wartosc
      const podstawa = `${numer}|${zamowienie.nr}|${nazwa}|${ilosc}|${cena ?? 0}`
      const nrWyst = (wystapienia.get(podstawa) ?? 0) + 1
      wystapienia.set(podstawa, nrWyst)
      pozycje.push({
        ...norm,
        klucz: nrWyst > 1 ? `${podstawa}|${nrWyst}` : podstawa,
        nr_zamowienia: zamowienie.nr,
        typ_zamowienia: zamowienie.typ,
        dostawca_nazwa: zamowienie.dostawca,
        nazwa, ilosc, jm,
        ilosc_zrealizowana: num(w[9]),
        cena_jedn: cena ?? (ilosc ? wartosc / ilosc : 0),
        wartosc,
        status, data_dostawy: data,
        masa_kg: masa?.masa ?? null,
        masa_zrodlo: masa?.zrodlo ?? null,
      })
      continue
    }

    // Zawinięty ciąg dalszy nazwy (tekst bez liczb) - doklejamy do poprzedniej pozycji.
    if (c0 !== '' && pozycje.length && w.slice(1).every((k) => tekst(k) === '')) {
      const ost = pozycje[pozycje.length - 1]
      ost.nazwa = `${ost.nazwa} ${c0}`.trim()
    }
  }

  if (!numer) ostrzezenia.push('Nie znaleziono numeru karty (wiersz "KARTA DOSTAWY ...").')
  const sumaPozycji = zaokr(pozycje.reduce((s, p) => s + p.wartosc, 0))
  sumaZamowien = zaokr(sumaZamowien)
  // Stopka = suma sum zamówień (dokładnie). Pozycje mogą się różnić o grosze na zamówieniach,
  // w których Optima zaokrągla sumę z cen o większej precyzji - wtedy różnica musi się zgadzać
  // z sumą tych zaokrągleń, inaczej brakuje pozycji.
  const roznicaZaokraglen = zaokr(zaokraglenia.reduce((s, z) => s + (z.suma_zamowienia - z.suma_pozycji), 0))
  const zgodna = sumaStopka !== null
    && Math.abs(sumaZamowien - sumaStopka) < 0.005
    && Math.abs(sumaPozycji + roznicaZaokraglen - sumaStopka) < 0.005
    && zaokraglenia.every((z) => Math.abs(z.suma_zamowienia - z.suma_pozycji) <= 0.05)
  if (sumaStopka === null) ostrzezenia.push('Brak stopki "Suma dostaw" - nie da się sprawdzić sumy.')
  else if (!zgodna) {
    ostrzezenia.push(`Suma pozycji ${sumaPozycji} (sumy zamówień ${sumaZamowien}) różni się od stopki ${sumaStopka}.`)
  }
  return { numer_karty: numer, suma_stopka: sumaStopka, suma_pozycji: sumaPozycji, suma_zamowien: sumaZamowien, zgodna, pozycje, zaokraglenia, ostrzezenia }
}

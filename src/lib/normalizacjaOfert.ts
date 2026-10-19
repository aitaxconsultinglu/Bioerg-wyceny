// Ceny znormalizowane pozycji ofert (PLN za kg / m / szt / jednostkę odniesienia),
// żeby oferty w różnych walutach i jednostkach dało się zestawić w porównywarce.
import { masaZWymiarow, type SposobMasy } from './kalkulacja'

export interface PozycjaDoNormalizacji {
  ilosc: number
  jm: string
  cena_jedn: number          // w walucie oferty
  wartosc?: number | null    // w walucie oferty (gdy brak: ilość × cena)
  masa_jedn?: number | null  // kg na jm
  masa_calk?: number | null  // kg
  dlugosc?: number | null    // mm - długość sztuki (rury, pręty)
  wielkosc_odniesienia?: number | null
}

export interface CenyZnormalizowane {
  wartosc_pln: number
  cena_pln_jedn: number
  cena_pln_kg: number | null
  cena_pln_m: number | null
  cena_pln_szt: number | null
  cena_pln_odniesienia: number | null
}

const r4 = (n: number) => Math.round(n * 10000) / 10000
const jednostka = (jm: string) => jm.toLowerCase().replace(/\.$/, '').replace('mb', 'm').replace('szt.', 'szt')

export function normalizujCene(p: PozycjaDoNormalizacji, kurs: number): CenyZnormalizowane {
  const j = jednostka(p.jm)
  const wartosc = p.wartosc ?? p.ilosc * p.cena_jedn
  const wartoscPln = wartosc * kurs
  const cenaPln = p.cena_jedn * kurs
  const masaCalk = p.masa_calk ?? (p.masa_jedn ? p.masa_jedn * p.ilosc : null)

  let kg: number | null = null
  if (j === 'kg') kg = cenaPln
  else if (j === 't') kg = cenaPln / 1000
  else if (masaCalk && masaCalk > 0) kg = wartoscPln / masaCalk

  let m: number | null = null
  if (j === 'm') m = cenaPln
  else if (j === 'szt' && p.dlugosc && p.dlugosc > 0) m = cenaPln / (p.dlugosc / 1000)

  let szt: number | null = null
  if (j === 'szt' || j === 'kpl' || j === 'ark') szt = cenaPln
  else if (j === 'm' && p.dlugosc && p.dlugosc > 0) szt = cenaPln * (p.dlugosc / 1000)

  const odn = p.wielkosc_odniesienia && p.wielkosc_odniesienia > 0 ? wartoscPln / p.wielkosc_odniesienia : null

  return {
    wartosc_pln: Math.round(wartoscPln * 100) / 100,
    cena_pln_jedn: r4(cenaPln),
    cena_pln_kg: kg === null ? null : r4(kg),
    cena_pln_m: m === null ? null : r4(m),
    cena_pln_szt: szt === null ? null : r4(szt),
    cena_pln_odniesienia: odn === null ? null : r4(odn),
  }
}

/** Masa pozycji oferty z wymiarów, gdy dostawca jej nie podał (np. odkuwka Ø1110×126). */
export function uzupelnijMase(
  p: { ilosc: number; jm: string; masa_jedn?: number | null; masa_calk?: number | null; d_zew?: number | null; d_wew?: number | null; grubosc?: number | null; szerokosc?: number | null; dlugosc?: number | null },
  sposob: SposobMasy,
  gestosc: number,
): { masa_jedn: number | null; masa_calk: number | null; wyliczona: boolean } {
  if (p.masa_calk || p.masa_jedn) {
    return { masa_jedn: p.masa_jedn ?? (p.masa_calk! / (p.ilosc || 1)), masa_calk: p.masa_calk ?? p.masa_jedn! * p.ilosc, wyliczona: false }
  }
  const j = jednostka(p.jm)
  if (j === 'kg') return { masa_jedn: 1, masa_calk: p.ilosc, wyliczona: false }
  // Pozycja w metrach: masa 1 m (długość = 1000 mm), niezależnie od długości sztuki handlowej.
  const wymiary = j === 'm' ? { ...p, dlugosc: 1000 } : p
  const jedn = masaZWymiarow(sposob, wymiary, gestosc)
  if (jedn === null) return { masa_jedn: null, masa_calk: null, wyliczona: false }
  return { masa_jedn: Math.round(jedn * 1000) / 1000, masa_calk: Math.round(jedn * p.ilosc * 1000) / 1000, wyliczona: true }
}

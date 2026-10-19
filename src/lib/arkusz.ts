// Odczyt arkuszy (XLS BIFF z Optimy, XLSX z Registo) do tablicy wierszy z bezwzględnymi
// indeksami kolumn (kolumna A = 0), niezależnie od tego, gdzie zaczyna się zakres arkusza.
import * as XLSX from 'xlsx-js-style'
import type { WierszArkusza } from './importOptima'

export function czytajSkoroszyt(dane: ArrayBuffer | Uint8Array) {
  return XLSX.read(dane, { type: 'array', cellDates: false })
}

export function wierszeArkusza(ws: XLSX.WorkSheet): WierszArkusza[] {
  const ref = ws['!ref']
  if (!ref) return []
  const zakres = XLSX.utils.decode_range(ref)
  const wynik: WierszArkusza[] = []
  for (let r = 0; r <= zakres.e.r; r++) {
    const wiersz: WierszArkusza = []
    for (let c = 0; c <= zakres.e.c; c++) {
      const kom = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
      wiersz.push(kom ? (kom.v as WierszArkusza[number]) ?? null : null)
    }
    wynik.push(wiersz)
  }
  return wynik
}

/** Wiersze pierwszego arkusza z wartościami i formułami komórek (stara Kalkulacja.xlsx). */
export function wierszeZFormulami(dane: ArrayBuffer | Uint8Array): ({ v: unknown; f?: string } | null)[][] {
  const wb = XLSX.read(dane, { type: 'array', cellFormula: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const ref = ws['!ref']
  if (!ref) return []
  const z = XLSX.utils.decode_range(ref)
  const wynik: ({ v: unknown; f?: string } | null)[][] = []
  for (let r = 0; r <= z.e.r; r++) {
    const w: ({ v: unknown; f?: string } | null)[] = []
    for (let c = 0; c <= z.e.c; c++) {
      const k = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
      w.push(k ? { v: k.v, f: k.f } : null)
    }
    wynik.push(w)
  }
  return wynik
}

/** Wiersze wszystkich arkuszy skoroszytu (nazwa arkusza -> wiersze). */
export function wszystkieArkusze(dane: ArrayBuffer | Uint8Array): Record<string, WierszArkusza[]> {
  const wb = czytajSkoroszyt(dane)
  return Object.fromEntries(wb.SheetNames.map((n) => [n, wierszeArkusza(wb.Sheets[n])]))
}

/** Wiersze pierwszego arkusza pliku. */
export function wierszePierwszegoArkusza(dane: ArrayBuffer | Uint8Array): WierszArkusza[] {
  const wb = czytajSkoroszyt(dane)
  return wierszeArkusza(wb.Sheets[wb.SheetNames[0]])
}

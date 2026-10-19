const ZL = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const LICZBA = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 3 })
const PROCENT = new Intl.NumberFormat('pl-PL', { style: 'percent', maximumFractionDigits: 1 })

export function zl(wartosc: number | null | undefined) {
  return ZL.format(Number(wartosc ?? 0))
}

export function liczba(wartosc: number | null | undefined, miejsc?: number) {
  if (miejsc !== undefined) {
    return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: miejsc, maximumFractionDigits: miejsc }).format(Number(wartosc ?? 0))
  }
  return LICZBA.format(Number(wartosc ?? 0))
}

/** Udział jako ułamek (0,25 -> "25%"). */
export function procent(udzial: number | null | undefined) {
  return PROCENT.format(Number(udzial ?? 0))
}

/** Parsuje liczbę wpisaną po polsku ("12,5", "1 234,50") albo po angielsku ("12.5"). */
export function parsujLiczbe(tekst: string): number {
  const czysty = tekst.replace(/[\s ]/g, '').replace(',', '.')
  if (czysty === '' || czysty === '-') return 0
  const n = Number(czysty)
  return Number.isFinite(n) ? n : NaN
}

export function dataPL(iso: string | null | undefined) {
  if (!iso) return ''
  const [r, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${r}`
}

export function dataGodzinaPL(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
}

export function dzisiajISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Liczba z rzeczownikiem w dobrej formie: odmiana(3, ['wiersz', 'wiersze', 'wierszy']) -> "3 wiersze". */
export function odmiana(n: number, [jeden, kilka, wiele]: [string, string, string]) {
  if (n === 1) return `1 ${jeden}`
  const j = n % 10
  const d = n % 100
  return `${n} ${j >= 2 && j <= 4 && (d < 12 || d > 14) ? kilka : wiele}`
}

/** Rozmiar w czytelnej postaci (1,2 MB). */
export function rozmiar(bajty: number | null | undefined) {
  const b = Number(bajty ?? 0)
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${liczba(b / 1024, 1)} kB`
  if (b < 1024 * 1024 * 1024) return `${liczba(b / 1024 / 1024, 1)} MB`
  return `${liczba(b / 1024 / 1024 / 1024, 2)} GB`
}

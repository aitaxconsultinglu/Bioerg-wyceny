// Excel z odczytu rysunku: zakładki Parametry, Króćce, Wykaz części, Uwagi do wyceny.
// Niepewne odczyty (pewność < 0,8) są wyróżnione i oznaczone "(?)".
import ExcelJS from 'exceljs'
import { PROG_PEWNOSCI, type WynikRysunku } from './rysunki'
import { nazwaPliku, pobierzPlik } from './pobierz'

export interface MetaRysunku { zapytanie: string; plik: string; strona: number; zrodlo: string }

const NAGLOWEK: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF9C4' } }
const NIEPEWNE: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
const ZRODLA: Record<string, string> = { recznie: 'wpisane ręcznie', tekst: 'warstwa tekstowa PDF', ai: 'odczyt AI' }

function arkusz(wb: ExcelJS.Workbook, nazwa: string, meta: MetaRysunku, kolumny: [string, number][], wiersze: { wartosci: (string | number | null)[]; pewnosc?: number }[]) {
  const ws = wb.addWorksheet(nazwa)
  ws.getCell('A1').value = `${meta.zapytanie} · ${meta.plik}, str. ${meta.strona} · ${ZRODLA[meta.zrodlo] ?? meta.zrodlo}`
  ws.getCell('A1').font = { bold: true }
  ws.columns = kolumny.map(([, width]) => ({ width }))
  const n = ws.getRow(3)
  kolumny.forEach(([t], i) => {
    const c = n.getCell(i + 1)
    c.value = t
    c.font = { bold: true, size: 9 }
    c.fill = NAGLOWEK
    c.alignment = { wrapText: true, vertical: 'middle' }
  })
  wiersze.forEach((w, j) => {
    const r = ws.getRow(4 + j)
    const niepewny = w.pewnosc !== undefined && w.pewnosc < PROG_PEWNOSCI
    w.wartosci.forEach((v, i) => {
      const c = r.getCell(i + 1)
      c.value = v
      if (niepewny) c.fill = NIEPEWNE
    })
  })
  ws.views = [{ state: 'frozen', ySplit: 3 }]
  if (wiersze.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + wiersze.length, column: kolumny.length } }
  return ws
}

const pew = (p: number) => (p < PROG_PEWNOSCI ? `${Math.round(p * 100)}% (?)` : `${Math.round(p * 100)}%`)

export async function zbudujExcelRysunku(w: WynikRysunku, meta: MetaRysunku, kategorie: { kod: string; nazwa: string }[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Wyceny i oferty'
  wb.created = new Date()
  arkusz(wb, 'Parametry', meta, [['Parametr', 40], ['Przestrzeń', 14], ['Wartość', 28], ['Jednostka', 11], ['Pewność', 10]],
    w.parametry.map((p) => ({ pewnosc: p.pewnosc, wartosci: [p.nazwa, p.przestrzen, p.wartosc, p.jednostka, pew(p.pewnosc)] })))
  arkusz(wb, 'Króćce', meta, [['Oznaczenie', 12], ['Ilość', 7], ['DN / rozmiar', 13], ['PN / klasa', 11], ['Przyłącze', 14], ['Przeznaczenie', 26], ['Uwagi', 50], ['Pewność', 10]],
    w.krocce.map((k) => ({ pewnosc: k.pewnosc, wartosci: [k.oznaczenie, k.ilosc, k.dn, k.pn, k.przylacze, k.przeznaczenie, k.uwagi, pew(k.pewnosc)] })))
  const kat = (kod: string) => kategorie.find((k) => k.kod === kod)?.nazwa ?? kod
  arkusz(wb, 'Wykaz części', meta, [['Poz.', 6], ['Nazwa', 40], ['Ilość', 7], ['J.m.', 6], ['Materiał', 16], ['Norma', 18], ['Wymiary', 18], ['Masa jedn. [kg]', 11], ['Masa całk. [kg]', 11], ['Kategoria', 18], ['Uwagi', 30], ['Pewność', 10]],
    w.pozycje.map((p) => ({
      pewnosc: p.pewnosc,
      wartosci: [p.poz, p.nazwa, p.ilosc, p.jm, p.material, p.norma, p.wymiary, p.masa_jedn, p.masa_calk ?? (p.masa_jedn !== null && p.ilosc !== null ? p.masa_jedn * p.ilosc : null), kat(p.sekcja), p.uwagi, pew(p.pewnosc)],
    })))
  const masa = w.pozycje.reduce((s, p) => s + (p.masa_calk ?? (p.masa_jedn ?? 0) * (p.ilosc ?? 0)), 0)
  const uwagi = arkusz(wb, 'Uwagi do wyceny', meta, [['Uwaga', 100]], w.uwagi.map((u) => ({ wartosci: [u] })))
  if (masa) {
    const r = uwagi.getRow(5 + w.uwagi.length)
    r.getCell(1).value = `Suma mas z wykazu części: ${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(masa)} kg (kontrola z masą na rysunku).`
    r.getCell(1).font = { italic: true }
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

export async function pobierzExcelRysunku(w: WynikRysunku, meta: MetaRysunku, kategorie: { kod: string; nazwa: string }[]) {
  const bufor = await zbudujExcelRysunku(w, meta, kategorie)
  pobierzPlik(bufor, `${nazwaPliku(`${meta.zapytanie} ${meta.plik.replace(/\.pdf$/i, '')} str${meta.strona}`)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { zbudujExcelRysunku } from './eksportRysunku'
import type { WynikRysunku } from './rysunki'

// Dane FIKCYJNE.
const WYNIK: WynikRysunku = {
  parametry: [{ nazwa: 'Ciśnienie obliczeniowe', przestrzen: 'płaszcz', wartosc: '1,6', jednostka: 'MPa', pewnosc: 0.95 }],
  krocce: [{ oznaczenie: 'N1', ilosc: 1, dn: 'DN100', pn: 'PN16', przylacze: 'WN-RF', przeznaczenie: 'wlot', uwagi: null, pewnosc: 0.6, obszar_zrodlowy: null }],
  pozycje: [
    { poz: '1', nazwa: 'Płaszcz', ilosc: 1, jm: 'szt', material: 'P265GH', norma: null, wymiary: '10x1500x3000', masa_jedn: 353, masa_calk: null, uwagi: null, pewnosc: 0.9, sekcja: 'blachy', obszar_zrodlowy: null },
    { poz: '2', nazwa: 'Kołnierz', ilosc: 2, jm: 'szt', material: 'P250GH', norma: 'EN 1092-1', wymiary: null, masa_jedn: 5, masa_calk: 10, uwagi: null, pewnosc: 0.7, sekcja: 'kolnierze', obszar_zrodlowy: null },
  ],
  uwagi: ['Wymagane PWHT'],
}

describe('Excel z odczytu rysunku', () => {
  it('cztery zakładki, niepewne wiersze oznaczone, suma mas', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await zbudujExcelRysunku(WYNIK, { zapytanie: 'ZO/1/2026', plik: 'rys.pdf', strona: 2, zrodlo: 'ai' }, [{ kod: 'blachy', nazwa: 'Blachy' }]))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Parametry', 'Króćce', 'Wykaz części', 'Uwagi do wyceny'])
    const czesci = wb.getWorksheet('Wykaz części')!
    expect(czesci.getCell('A1').value).toContain('rys.pdf, str. 2')
    expect(czesci.getRow(4).values).toContain('Blachy')
    expect(czesci.getCell('I4').value).toBe(353)                    // masa całk. z jedn. x ilość
    expect(czesci.getCell('L5').value).toBe('70% (?)')
    expect((czesci.getCell('B5').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFFEF3C7')
    expect(wb.getWorksheet('Króćce')!.getCell('H4').value).toBe('60% (?)')
    const uwagi = wb.getWorksheet('Uwagi do wyceny')!
    expect(uwagi.getCell('A4').value).toBe('Wymagane PWHT')
    expect(String(uwagi.getCell('A6').value)).toContain('363 kg')
  })
})

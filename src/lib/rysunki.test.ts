import { describe, expect, it } from 'vitest'
import {
  czesciZTabeli, dpiObszaru, kafelNaStronie, kafle, kafliOdmiana, krocceZTabeli, listaZRysunku, opisKafla, parametryZTabeli, polaczWyniki, tokenyObrazu,
  ulozWTabele, wierszeZeSchowka, zWynikuAi, type ElementTekstu,
} from './rysunki'
import { pozycjeZListy } from './importListy'
import type { RysunekAi } from './ai'

// Dane FIKCYJNE.

describe('kafle', () => {
  it('mały obszar = jeden kafel', () => {
    expect(kafle(1200, 800)).toEqual([{ x: 0, y: 0, w: 1200, h: 800 }])
  })

  it('duży obszar: bok <= 1500, zakładka >= 10%, pokrycie do krawędzi', () => {
    const k = kafle(4100, 2900)
    const kolumny = [...new Set(k.map((x) => x.x))]
    const wiersze = [...new Set(k.map((x) => x.y))]
    expect(k.length).toBe(kolumny.length * wiersze.length)
    for (const x of k) {
      expect(x.w).toBeLessThanOrEqual(1500)
      expect(x.h).toBeLessThanOrEqual(1500)
      expect(x.x + x.w).toBeLessThanOrEqual(4100)
      expect(x.y + x.h).toBeLessThanOrEqual(2900)
    }
    expect(Math.max(...k.map((x) => x.x + x.w))).toBe(4100)
    expect(Math.max(...k.map((x) => x.y + x.h))).toBe(2900)
    const w = k[0].w
    for (let i = 1; i < kolumny.length; i++) expect(kolumny[i - 1] + w - kolumny[i]).toBeGreaterThanOrEqual(Math.floor(0.1 * w) - 1)
  })

  it('kafel w pikselach renderu -> obszar względny strony', () => {
    const o = kafelNaStronie({ x: 1000, y: 0, w: 1000, h: 500 }, { x: 0.5, y: 0.2, w: 0.4, h: 0.2 }, 2000, 1000, 3)
    expect(o).toEqual({ strona: 3, x: 0.7, y: 0.2, w: 0.2, h: 0.1 })
  })

  it('tokeny obrazu i DPI: 300, powiększenie małego wycinka, natywny skan, limit dla A1', () => {
    expect(tokenyObrazu(1500, 1500)).toBe(3000)
    expect(dpiObszaru(500, 300)).toBe(300)                              // 2083 px - bez zmian
    expect(dpiObszaru(200, 100)).toBe(540)                              // 833 px -> ~1500 px
    expect(dpiObszaru(100, 50)).toBe(600)                               // powiększenie najwyżej do 600 DPI
    expect(dpiObszaru(500, 300, { natywne: 400 })).toBe(400)            // skan 400 DPI - nie tracimy szczegółów
    // Cały A1 (2384 x 1684 pt) w 300 DPI to ~70 mln pikseli - schodzimy niżej.
    const d = dpiObszaru(2384, 1684)
    expect(d).toBeLessThan(300)
    expect((2384 * d / 72) * (1684 * d / 72)).toBeLessThanOrEqual(60_000_000)
  })
})

/** Tabela z elementów tekstu: [tekst, x] w wierszach co 12 pt (y rośnie w dół). */
function elementy(wiersze: [string, number][][], y0 = 100): ElementTekstu[] {
  return wiersze.flatMap((w, i) => w.map(([str, x]) => ({ str, x, y: y0 + i * 12 + (x % 3) * 0.5, w: str.length * 4, h: 8 })))
}

describe('warstwa tekstowa -> tabela', () => {
  it('wykaz części z nagłówkiem na dole (jak w tabliczce rysunku)', () => {
    const el = elementy([
      [['3', 10], ['Kołnierz', 40], ['DN100', 76], ['PN16', 100], ['2', 160], ['A350 LF2', 190], ['8,5', 260]],
      [['2', 10], ['Dno', 40], ['elipsoidalne', 56], ['1', 160], ['P355NL1', 190], ['120', 260]],
      [['1', 10], ['Płaszcz', 40], ['blacha 10x1500x3000', 72], ['1', 160], ['P355NL1', 190], ['353', 260]],
      [['Poz.', 10], ['Nazwa', 40], ['Ilość', 160], ['Materiał', 190], ['Masa jedn.', 260]],
    ])
    const t = ulozWTabele(el)
    expect(t.wiersze[3]).toEqual(['Poz.', 'Nazwa', 'Ilość', 'Materiał', 'Masa jedn.'])
    expect(t.wiersze[0][1]).toBe('Kołnierz DN100 PN16')
    const p = czesciZTabeli(t.wiersze)
    expect(p.map((x) => x.poz)).toEqual(['1', '2', '3'])
    expect(p[0]).toMatchObject({ nazwa: 'Płaszcz blacha 10x1500x3000', ilosc: 1, material: 'P355NL1', masa_jedn: 353, sekcja: 'blachy' })
    expect(p[2]).toMatchObject({ material: 'A350 LF2', ilosc: 2, masa_calk: 17 })
  })

  it('tabela króćców', () => {
    const w = [
      ['Mark', 'Qty', 'Size', 'Rating', 'Facing', 'Service'],
      ['N1', '1', 'DN150', 'PN40', 'RF', 'Inlet'],
      ['N2', '2', 'DN50', 'PN40', 'RF', 'Drain'],
      ['', '', '', '', '', ''],
    ]
    expect(krocceZTabeli(w)).toMatchObject([
      { oznaczenie: 'N1', ilosc: 1, dn: 'DN150', pn: 'PN40', przylacze: 'RF', przeznaczenie: 'Inlet' },
      { oznaczenie: 'N2', ilosc: 2, dn: 'DN50', przeznaczenie: 'Drain' },
    ])
  })

  it('dane projektowe: nazwa, jednostka, wartość', () => {
    expect(parametryZTabeli([
      ['Design Conditions'],
      ['Design pressure', 'MPa', '1,0 / FV'],
      ['Design temperature', '°C', '120'],
      ['Design Code', 'ASME VIII Div.1'],
    ])).toEqual([
      { nazwa: 'Design pressure', przestrzen: null, wartosc: '1,0 / FV', jednostka: 'MPa', pewnosc: 0.9 },
      { nazwa: 'Design temperature', przestrzen: null, wartosc: '120', jednostka: '°C', pewnosc: 0.9 },
      { nazwa: 'Design Code', przestrzen: null, wartosc: 'ASME VIII Div.1', jednostka: null, pewnosc: 0.9 },
    ])
  })

  it('wklejona tabela ze schowka', () => {
    expect(wierszeZeSchowka('Poz.\tNazwa\tIlość\r\n1\tPłaszcz\t1\n\n')).toEqual([['Poz.', 'Nazwa', 'Ilość'], ['1', 'Płaszcz', '1']])
  })
})

describe('odpowiedź AI i łączenie obszarów', () => {
  const AI: RysunekAi = {
    czy_rysunek: true,
    pozycje: [
      { poz: '2', nazwa: 'Dno', ilosc: 1, jm: null, material: 'P265GH', norma: null, wymiary: null, masa_jedn: null, masa_calk: null, uwagi: null, kategoria: 'dennice', pewnosc: 0.9, kafel: 2 },
      { poz: '10.1', nazwa: 'Śruba dwustronna', ilosc: 16, jm: 'szt', material: '26CrMo4 (?)', norma: null, wymiary: 'M24x185', masa_jedn: 0.6, masa_calk: null, uwagi: null, kategoria: 'nieznana', pewnosc: 0.6, kafel: 1 },
      { poz: '9', nazwa: 'Rura', ilosc: 8, jm: 'szt', material: 'P235GH', norma: null, wymiary: '25x2', masa_jedn: null, masa_calk: null, uwagi: null, kategoria: null, pewnosc: 1.3, kafel: null },
    ],
    krocce: [{ oznaczenie: 'N1', ilosc: 1, dn: 'DN100', pn: 'PN16', przylacze: 'WN-RF', przeznaczenie: 'wlot', uwagi: null, pewnosc: 0.9, kafel: 1 }],
    parametry: [{ nazwa: 'Ciśnienie próbne', przestrzen: 'płaszcz', wartosc: '2,3', jednostka: 'MPa', pewnosc: 0.9 }],
    dane_projektowe: { kod_projektowy: 'EN 13445', cisnienie_obliczeniowe: '1,6 MPa', temperatura_obliczeniowa: null, mdmt: '-20 °C (?)', naddatek_korozyjny: null, pwht: 'nie', badania_ndt: null, kategoria_ped: null, dozor_udt: null, masa_pusta: null },
    uwagi_do_wyceny: ['100% RT spoin doczołowych'],
    uwagi_odczytu: '',
  }
  const KAFLE = [{ strona: 1, x: 0.5, y: 0, w: 0.25, h: 0.5 }, { strona: 1, x: 0.7, y: 0, w: 0.25, h: 0.5 }]

  it('kafel -> źródło, kategoria ze słownika albo z reguł, dane projektowe na początku parametrów', () => {
    const w = zWynikuAi(AI, KAFLE, ['dennice', 'blachy', 'zlaczne', 'rury_technologiczne'])
    expect(w.pozycje[0]).toMatchObject({ sekcja: 'dennice', jm: 'szt', obszar_zrodlowy: KAFLE[1] })
    expect(w.pozycje[1].sekcja).not.toBe('nieznana')
    expect(w.pozycje[2]).toMatchObject({ pewnosc: 1, obszar_zrodlowy: null })
    expect(w.krocce[0]).not.toHaveProperty('kafel')
    expect(w.parametry.map((p) => p.nazwa)).toEqual(['Kod projektowy', 'Ciśnienie obliczeniowe', 'MDMT', 'PWHT (obróbka cieplna)', 'Ciśnienie próbne'])
    expect(w.parametry.find((p) => p.nazwa === 'MDMT')!.pewnosc).toBeLessThan(0.8)
  })

  it('łączenie: duplikaty z zakładki kafli usunięte (zostaje pewniejszy), kolejność wg numerów pozycji', () => {
    const a = zWynikuAi(AI, KAFLE, [])
    const b = zWynikuAi({ ...AI, pozycje: [{ ...AI.pozycje[1], pewnosc: 0.95, material: '26CrMo4' }], dane_projektowe: { ...AI.dane_projektowe, mdmt: null } }, KAFLE, [])
    const w = polaczWyniki(a, b)
    expect(w.pozycje.map((p) => p.poz)).toEqual(['2', '9', '10.1'])
    expect(w.pozycje[2].material).toBe('26CrMo4')
    expect(w.krocce).toHaveLength(1)
    expect(w.uwagi).toEqual(['100% RT spoin doczołowych'])
  })

  it('odmiana liczby kafli', () => {
    expect([1, 2, 4, 5, 12, 22, 25].map(kafliOdmiana)).toEqual(['1 kafel', '2 kafle', '4 kafle', '5 kafli', '12 kafli', '22 kafle', '25 kafli'])
  })

  it('opis kafla dla modelu', () => {
    const k = kafle(3000, 1400)
    expect(opisKafla(2, 'czesci', k[1], k)).toBe('Kafel 2: wykaz części, wiersz 1/1, kolumna 2/3')
  })
})

describe('przeniesienie do wyceny', () => {
  it('wymiary i gatunek z opisu, niepewny odczyt opisany w uwagach', () => {
    const lista = listaZRysunku([
      { poz: '1', nazwa: 'Płaszcz blacha 10x1500x3000', ilosc: 1, jm: 'szt', material: 'P355NL1', norma: null, wymiary: null, masa_jedn: 353, masa_calk: 353, uwagi: null, pewnosc: 0.95, sekcja: 'blachy', obszar_zrodlowy: null },
      { poz: '2', nazwa: 'Rura', ilosc: 4, jm: 'szt', material: 'P235GH', norma: 'EN 10216-2', wymiary: '25x2 L=3000', masa_jedn: null, masa_calk: 14, uwagi: null, pewnosc: 0.6, sekcja: 'rury_technologiczne', obszar_zrodlowy: null },
      { poz: '3', nazwa: ' ', ilosc: 1, jm: 'szt', material: null, norma: null, wymiary: null, masa_jedn: null, masa_calk: null, uwagi: null, pewnosc: 1, sekcja: 'inne', obszar_zrodlowy: null },
    ])
    expect(lista).toHaveLength(2)
    expect(lista[0]).toMatchObject({ gatunek: 'P355NL1', grubosc: 10, szerokosc: 1500, dlugosc: 3000, masa_jedn: 353 })
    expect(lista[1]).toMatchObject({ nazwa: 'Rura 25x2 L=3000', masa_jedn: 3.5, norma: 'EN 10216-2' })
    expect(lista[1].uwagi).toContain('(?)')
    const poz = pozycjeZListy(lista, 'rysunek.pdf, str. 1')
    expect(poz[1]).toMatchObject({ zakladka: 'materialy', sekcja: 'rury_technologiczne', ilosc: 4, cena_jedn: 0, zrodlo_opis: 'rysunek.pdf, str. 1' })
  })
})

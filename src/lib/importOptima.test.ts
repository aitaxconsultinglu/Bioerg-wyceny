import { describe, expect, it } from 'vitest'
import { dataZSeryjnej, liczbaPL, parsujKarteDostawy, type WierszArkusza } from './importOptima'

// Karta w układzie wydruku Optimy z danymi FIKCYJNYMI (repo jest publiczne).
// Kolumny: [0] nazwa / nr zam., [2] dostawca, [7] ilość, [8] jm, [9] zrealiz./suma, [10] cena, [11] wartość, [13] status/data, [15] status
function wiersz(komorki: Record<number, string | number>): WierszArkusza {
  const w: WierszArkusza = Array(16).fill(null)
  for (const [k, v] of Object.entries(komorki)) w[Number(k)] = v
  return w
}

const NAGLOWKI = [
  wiersz({ 0: 'Nr zamówienia', 2: 'Dostawca' }),
  wiersz({ 8: 'Ilość / zrealizowana', 10: 'Cena / j.', 12: 'Data dostawy' }),
  wiersz({ 0: 'Materiał', 7: 'Ilość', 11: 'Cena', 14: 'Status' }),
]

const KARTA: WierszArkusza[] = [
  wiersz({}),
  wiersz({ 0: 'KARTA DOSTAWY  UJW/000999/2099' }),
  wiersz({}),
  ...NAGLOWKI,
  wiersz({ 0: 'ZM/1/2099', 2: 'HURTOWNIA PRZYKŁADOWA SPÓŁKA' }),
  wiersz({ 0: 'Pręt D16 L=3m gat 1.4301', 7: 10, 8: 'kg', 9: 10, 10: 20, 11: 200, 13: 'ZREALIZOWANE' }),
  wiersz({ 0: 'ATEST 3.1', 7: 1, 8: 'szt', 9: 0, 10: 30, 11: 30, 13: 46142 }),
  wiersz({ 9: 230 }),
  wiersz({ 0: 'ZM/2/2099', 2: 'STAL TEST SP. Z O.O.' }),
  wiersz({ 0: 'Kołnierz szyjkowy DN100|( 114x6) PN16 11 B1 gat 1.4307', 7: 2, 8: 'szt', 9: 2, 10: 100, 11: 200, 13: 'ZREALIZOWANE' }),
  wiersz({ 0: 'KOLANO 33,7X2,6 P265GH', 7: 20, 8: 'szt', 9: 10, 10: 5.5, 11: 110, 13: 46149, 15: 'CZEŚCIOWO ZREALIZOWANE' }),
  wiersz({ 0: 'Wypałki 1.4301 wg wykazu', 7: 1, 8: 'kpl', 9: 1, 10: 1000.5, 11: 1000.5, 13: 'ZREALIZOWANE' }),
  wiersz({ 9: 1310.5 }),
  // nagłówki powtórzone na kolejnej stronie wydruku
  wiersz({ 0: 'Godzina wydruku: 10:00:00', 12: 'Strona 1 z 2' }),
  ...NAGLOWKI,
  wiersz({ 0: 'ZJ/3/2099', 2: 'KOOPERANT TESTOWY' }),
  wiersz({ 0: 'USŁUGA TRANSPORTOWA', 7: 1, 8: 'szt', 9: 0, 10: 500, 11: 500, 13: 46160 }),
  wiersz({ 9: 500 }),
  wiersz({ 4: 'Suma dostaw: 2 040,50' }),
  wiersz({ 0: 'Godzina wydruku: 10:00:00', 12: 'Strona 2 z 2' }),
]

describe('import karty dostawy Optimy', () => {
  const karta = parsujKarteDostawy(KARTA)

  it('czyta numer karty i kontroluje sumę ze stopką (twarda spacja)', () => {
    expect(karta.numer_karty).toBe('UJW/000999/2099')
    expect(karta.suma_stopka).toBe(2040.5)
    expect(karta.suma_pozycji).toBe(2040.5)
    expect(karta.suma_zamowien).toBe(2040.5)
    expect(karta.zgodna).toBe(true)
    expect(karta.ostrzezenia).toEqual([])
  })

  it('pomija powtórzone nagłówki stron i wiersze sum zamówień', () => {
    expect(karta.pozycje.map((p) => p.nazwa)).toEqual([
      'Pręt D16 L=3m gat 1.4301', 'ATEST 3.1', 'Kołnierz szyjkowy DN100 ( 114x6) PN16 11 B1 gat 1.4307',
      'KOLANO 33,7X2,6 P265GH', 'Wypałki 1.4301 wg wykazu', 'USŁUGA TRANSPORTOWA',
    ])
  })

  it('przypisuje zamówienie, dostawcę i typ (ZM/ZJ)', () => {
    expect(karta.pozycje[0]).toMatchObject({ nr_zamowienia: 'ZM/1/2099', typ_zamowienia: 'ZM', dostawca_nazwa: 'HURTOWNIA PRZYKŁADOWA SPÓŁKA' })
    expect(karta.pozycje[5]).toMatchObject({ nr_zamowienia: 'ZJ/3/2099', typ_zamowienia: 'ZJ', rodzaj: 'usluga', kategoria_uslugi: 'transport' })
  })

  it('status albo data dostawy (liczba seryjna Excela) i status częściowy z kol. 15', () => {
    expect(karta.pozycje[0]).toMatchObject({ status: 'ZREALIZOWANE', data_dostawy: null })
    expect(karta.pozycje[1]).toMatchObject({ rodzaj: 'doplata', data_dostawy: '2026-04-30' })
    expect(karta.pozycje[3]).toMatchObject({ status: 'CZEŚCIOWO ZREALIZOWANE', ilosc_zrealizowana: 10 })
  })

  it('masa: z jednostki kg, brak dla kompletu wypałek', () => {
    expect(karta.pozycje[0]).toMatchObject({ masa_kg: 10, masa_zrodlo: 'jm' })
    expect(karta.pozycje[4]).toMatchObject({ kategoria: 'blachy', masa_kg: null })
  })

  it('klucz importu jest stały między importami i rozróżnia identyczne wiersze', () => {
    const ponownie = parsujKarteDostawy(KARTA)
    expect(ponownie.pozycje.map((p) => p.klucz)).toEqual(karta.pozycje.map((p) => p.klucz))
    const dubel = parsujKarteDostawy([...KARTA.slice(0, 7), KARTA[7], KARTA[7]])
    const klucze = dubel.pozycje.map((p) => p.klucz)
    expect(new Set(klucze).size).toBe(klucze.length)
  })

  it('groszowe zaokrąglenie sumy zamówienia w Optimie nie psuje kontroli', () => {
    // dwie pozycje po 64,03 (cena 64,032), a Optima drukuje sumę zamówienia 128,07
    const k = parsujKarteDostawy([
      wiersz({ 0: 'KARTA DOSTAWY  UJW/000998/2099' }),
      wiersz({ 0: 'ZM/9/2099', 2: 'DOSTAWCA' }),
      wiersz({ 0: 'WYPAŁKA A 1.4307', 7: 1, 8: 'szt', 9: 1, 10: 64.032, 11: 64.03, 13: 'ZREALIZOWANE' }),
      wiersz({ 0: 'WYPAŁKA B 1.4307', 7: 1, 8: 'szt', 9: 1, 10: 64.032, 11: 64.03, 13: 'ZREALIZOWANE' }),
      wiersz({ 9: 128.07 }),
      wiersz({ 4: 'Suma dostaw: 128,07' }),
    ])
    expect(k.zgodna).toBe(true)
    expect(k.suma_pozycji).toBe(128.06)
    expect(k.zaokraglenia).toEqual([{ nr_zamowienia: 'ZM/9/2099', suma_pozycji: 128.06, suma_zamowienia: 128.07 }])
    expect(k.ostrzezenia).toEqual([])
  })

  it('wykrywa niezgodność sumy', () => {
    const zla = parsujKarteDostawy(KARTA.map((w) => (typeof w[4] === 'string' && w[4].startsWith('Suma') ? wiersz({ 4: 'Suma dostaw: 2 000,00' }) : w)))
    expect(zla.zgodna).toBe(false)
    expect(zla.ostrzezenia.join()).toMatch(/różni się od stopki/)
  })
})

describe('pomocnicze', () => {
  it('data z liczby seryjnej i liczba po polsku', () => {
    expect(dataZSeryjnej(46142)).toBe('2026-04-30')
    expect(liczbaPL('Suma dostaw: 1 234 567,89')).toBe(1234567.89)
    expect(liczbaPL('12,5')).toBe(12.5)
  })
})

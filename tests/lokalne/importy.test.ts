// Test akceptacyjny etapu 2 na PRAWDZIWYCH plikach z lokalnego folderu materiałów
// (FOLDER_MATERIALOW w .env, nazwy plików w prywatne/testy.json). Kwoty są czytane z plików - repo nie zawiera danych.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { wierszePierwszegoArkusza } from '../../src/lib/arkusz'
import { parsujKarteDostawy } from '../../src/lib/importOptima'
import { agregujRegisto } from '../../src/lib/importRegisto'
import { TESTY, plikTestu } from './srodowisko'

const KARTY = (TESTY.karty_dostawy ?? []).map(plikTestu).filter((p): p is string => !!p)
const REGISTO = plikTestu(TESTY.registo)

describe.skipIf(KARTY.length < 2)('karty dostawy Optimy (pliki lokalne)', () => {
  for (const [i, sciezka] of KARTY.entries()) {
    it(`karta ${i + 1}: suma pozycji zgodna ze stopką, bez ostrzeżeń`, () => {
      const karta = parsujKarteDostawy(wierszePierwszegoArkusza(readFileSync(sciezka)))
      expect(karta.numer_karty).toMatch(/^UJW\/\d{6}\/\d{4}$/)
      expect(karta.suma_stopka).not.toBeNull()
      // stopka = suma sum zamówień; pozycje mogą różnić się o grosze zaokrągleń Optimy
      expect(karta.suma_zamowien).toBeCloseTo(karta.suma_stopka!, 2)
      expect(Math.abs(karta.suma_pozycji - karta.suma_stopka!)).toBeLessThanOrEqual(0.05)
      expect(karta.zgodna).toBe(true)
      expect(karta.ostrzezenia).toEqual([])
      // każda pozycja sklasyfikowana; dopłaty i pomocnicze rozpoznane
      expect(karta.pozycje.every((p) => p.rodzaj)).toBe(true)
      expect(karta.pozycje.some((p) => p.rodzaj === 'doplata')).toBe(true)
      expect(new Set(karta.pozycje.map((p) => p.klucz)).size).toBe(karta.pozycje.length)
    })
  }

  it('wypałki w komplecie trafiają do kolejki "uzupełnij masę"', () => {
    const sciezka = KARTY[0]
    const karta = parsujKarteDostawy(wierszePierwszegoArkusza(readFileSync(sciezka)))
    const wypalkiKpl = karta.pozycje.filter((p) => p.kategoria === 'blachy' && p.jm === 'kpl')
    expect(wypalkiKpl.length).toBeGreaterThan(0)
    expect(wypalkiKpl.every((p) => p.masa_kg === null)).toBe(true)
  })

  it('materiały pomocnicze (płytki skrawające) rozpoznane w drugiej karcie', () => {
    const sciezka = KARTY[1]
    const karta = parsujKarteDostawy(wierszePierwszegoArkusza(readFileSync(sciezka)))
    expect(karta.pozycje.filter((p) => /^PŁYTKA/.test(p.nazwa)).every((p) => p.rodzaj === 'pomocnicze')).toBe(true)
  })
})

describe.skipIf(!REGISTO)('raport Registo (plik lokalny)', () => {
  it('agreguje bez nazwisk, suma godzin zgodna z surowymi wierszami', () => {
    const wiersze = wierszePierwszegoArkusza(readFileSync(REGISTO!))
    const { miesiace, bledy } = agregujRegisto(wiersze)
    expect(bledy).toEqual([])
    expect(miesiace).toHaveLength(1)
    const naglowek = wiersze[0].map(String)
    const iNr = naglowek.indexOf('Numer Projektu_EN'); const iGodz = naglowek.indexOf('Ilosc godzin_EN'); const iOsoba = naglowek.indexOf('Pracownik_EN')
    const surowe = wiersze.slice(1).filter((w) => w[iNr]).reduce((s, w) => s + Number(w[iGodz] ?? 0), 0)
    expect(miesiace[0].godzin).toBeCloseTo(surowe, 1)
    const osoby = new Set(wiersze.slice(1).map((w) => String(w[iOsoba] ?? '')).filter((x) => x.length > 3))
    const wynik = JSON.stringify(miesiace)
    expect([...osoby].some((o) => wynik.includes(o))).toBe(false)
  })
})

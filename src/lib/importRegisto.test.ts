import { describe, expect, it } from 'vitest'
import { agregujRegisto } from './importRegisto'

// Dane FIKCYJNE w układzie raportu "Export 3".
const NAGLOWEK = ['Data_EN', 'Pracownik_EN', 'Mpk_EN', 'Wydzial_EN', 'Oddzial_EN', 'Rodzaj umowy_EN', 'Firma_EN', 'Numer Projektu_EN', 'Projekt_EN', 'Ilosc godzin_EN']
const W = (data: string, osoba: string, mpk: string, umowa: string, firma: string, nr: string | null, godz: number) =>
  [data, osoba, mpk, 'R10', null, umowa, firma, nr, nr ? `Projekt ${nr}` : null, godz]

describe('import Registo', () => {
  const { miesiace, bledy } = agregujRegisto([
    NAGLOWEK,
    W('2099-09-01', 'Osoba A', 'P11', 'umowa o pracę', 'FIRMA-TEST', 'UJW/000001/2099', 8),
    W('2099-09-02', 'Osoba B', 'P11', 'umowa o pracę', 'FIRMA-TEST', 'UJW/000001/2099', 7.5),
    W('2099-09-02', 'Osoba C', 'P11', 'podwykonawca', 'FIRMA X', 'UJW/000001/2099', 10),
    W('2099-09-03', 'Osoba A', 'P03', 'umowa o pracę', 'FIRMA-TEST', 'UJW/000002/2099', 4),
    W('2099-09-03', 'Osoba D', 'P03', 'umowa o pracę', 'FIRMA-TEST', null, 8),
  ])

  it('agreguje godziny po projekcie, MPK, umowie i firmie', () => {
    expect(bledy).toEqual([])
    expect(miesiace).toHaveLength(1)
    const m = miesiace[0]
    // godzin = suma godzin zapisanych (z numerem projektu); wiersze bez projektu tylko liczone
    expect(m).toMatchObject({ miesiac: '2099-09-01', wierszy: 5, pominietych: 1, godzin: 29.5 })
    expect(m.agregaty).toEqual([
      { projekt_numer: 'UJW/000001/2099', projekt_nazwa: 'Projekt UJW/000001/2099', mpk: 'P11', wydzial: 'R10', rodzaj_umowy: 'umowa o pracę', firma: 'FIRMA-TEST', godziny: 15.5 },
      { projekt_numer: 'UJW/000001/2099', projekt_nazwa: 'Projekt UJW/000001/2099', mpk: 'P11', wydzial: 'R10', rodzaj_umowy: 'podwykonawca', firma: 'FIRMA X', godziny: 10 },
      { projekt_numer: 'UJW/000002/2099', projekt_nazwa: 'Projekt UJW/000002/2099', mpk: 'P03', wydzial: 'R10', rodzaj_umowy: 'umowa o pracę', firma: 'FIRMA-TEST', godziny: 4 },
    ])
  })

  it('nie przenosi nazwisk pracowników', () => {
    expect(JSON.stringify(miesiace)).not.toMatch(/Osoba/)
  })

  it('odrzuca plik, który nie jest raportem Export 3', () => {
    expect(agregujRegisto([['Kategoria_EN', 'Opis_EN']]).bledy.length).toBeGreaterThan(0)
  })
})

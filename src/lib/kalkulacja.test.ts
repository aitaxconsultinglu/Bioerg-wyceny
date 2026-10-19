import { describe, expect, it } from 'vitest'
import {
  masaBlachy, masaKrazka, masaPreta, masaRury, masaZWymiarow, ostrzezenia, policzAparat, policzPozycje, policzWycene, zaokraglij,
  type AparatKalk, type ParametryKalk, type PozycjaKalk,
} from './kalkulacja'

// Wszystkie kwoty w tym pliku są FIKCYJNE (repo publiczne). Prawdziwe wyceny historyczne
// odtwarza test lokalny tests/lokalne/wyceny.test.ts z plików w folderze materiałów.
const SPOSOBY: Record<string, 'blacha' | 'krazek' | 'rura' | 'pret' | 'brak'> = { blachy: 'blacha', odkuwki: 'krazek', rury_technologiczne: 'rura', prety: 'pret' }
const NADDATKI: Record<string, number> = { blachy: 5, odkuwki: 2, kolnierze: 2 }
const PAR: ParametryKalk = {
  narzut_zakupowy_proc: 0, narzut_kooperacja_proc: 0,
  sposobMasy: (s) => SPOSOBY[s ?? ''] ?? 'brak',
  gestosc: (g) => (g && /^1\.4|^3\d\d/.test(g) ? 7.93 : 7.85),
  naddatekDomyslny: (s) => NADDATKI[s ?? ''] ?? 0,
}
const poz = (z: Partial<PozycjaKalk>): PozycjaKalk => ({ zakladka: 'materialy', sekcja: null, nazwa: 'x', ilosc: 1, jm: 'szt', cena_jedn: 0, jednostka_ceny: 'jm', ...z })
const aparat = (z: Partial<AparatKalk>): AparatKalk => ({
  nazwa: 'A', ilosc: 1, masa_netto_kg: 10_000, metoda_robocizny: 'wskaznikowa', wskaznik_rbh_t: 200, stawka_wskaznikowa: 50, liczba_osob: 8, naddatki: {}, pozycje: [], ...z,
})

describe('pozycje wyceny', () => {
  it('blacha: masa z wymiarów i koszt za kg', () => {
    const w = policzPozycje(poz({ sekcja: 'blachy', grubosc: 10, szerokosc: 1000, dlugosc: 2000, ilosc: 2, jm: 'ark', cena_jedn: 10, jednostka_ceny: 'kg' }), PAR)
    expect(w.masa_z_wymiarow).toBe(true)
    expect(w.masa_jedn).toBeCloseTo(157, 6)
    expect(w.koszt).toBeCloseTo(3140, 6)
  })

  it('masa wpisana ręcznie ma pierwszeństwo przed wymiarami', () => {
    const w = policzPozycje(poz({ sekcja: 'blachy', grubosc: 10, szerokosc: 1000, dlugosc: 2000, masa_jedn: 150, masa_reczna: true, cena_jedn: 10, jednostka_ceny: 'kg' }), PAR)
    expect(w.masa_calk).toBe(150)
    expect(w.koszt).toBe(1500)
  })

  it('rurki: sztuki × długość × cena za metr', () => {
    const w = policzPozycje(poz({ sekcja: 'rury_technologiczne', d_zew: 25, grubosc: 2, dlugosc: 6000, ilosc: 100, cena_jedn: 20, jednostka_ceny: 'm' }), PAR)
    expect(w.koszt).toBe(100 * 6 * 20)
    expect(w.masa_calk).toBeCloseTo(100 * masaRury(25, 2, 6000, 7.85), 6)
  })

  it('wartość wpisana zastępuje ilość × cena', () => {
    expect(policzPozycje(poz({ ilosc: 3, cena_jedn: 100, wartosc_reczna: 250 }), PAR).koszt).toBe(250)
  })

  it('transport: km × kursy × zł/km', () => {
    expect(policzPozycje(poz({ zakladka: 'transport', ilosc: 2, cena_jedn: 4, dodatkowe: { km: 500 } }), PAR).koszt).toBe(4000)
  })
})

describe('aparat i wycena (struktura dotychczasowego arkusza wyceny, liczby fikcyjne)', () => {
  const a = aparat({
    pozycje: [
      poz({ sekcja: 'blachy', nazwa: 'płaszcz', wartosc_reczna: 10_000 }),
      poz({ sekcja: 'blachy', nazwa: 'dennica', wartosc_reczna: 10_000 }),
      poz({ sekcja: 'odkuwki', nazwa: 'sito', wartosc_reczna: 50_000 }),
      poz({ sekcja: 'rury_technologiczne', nazwa: 'rurki', wartosc_reczna: 30_000 }),
      poz({ zakladka: 'kooperacja', nazwa: 'wiercenie sit', wartosc_reczna: 20_000 }),
      poz({ zakladka: 'projekt', nazwa: 'projekt', ilosc: 1, cena_jedn: 8000 }),
      poz({ zakladka: 'badania', nazwa: 'RT', ilosc: 10, cena_jedn: 200 }),
      poz({ zakladka: 'transport', nazwa: 'kooperacja', ilosc: 2, cena_jedn: 3, dodatkowe: { km: 500 } }),
    ],
  })

  it('naddatek % od sumy sekcji', () => {
    const k = policzAparat(a, PAR)
    expect(k.materialy.sekcje.map((s) => [s.sekcja, s.naddatek])).toEqual([['blachy', 1000], ['odkuwki', 1000], ['rury_technologiczne', 0]])
    expect(k.materialy.razem).toBe(102_000)
  })

  it('robocizna wskaźnikowa: t × rbh/t × stawka, dni przy N osobach', () => {
    const k = policzAparat(a, PAR)
    expect(k.robocizna).toMatchObject({ rbh: 2000, wartosc: 100_000, rbh_na_t: 200 })
    expect(k.robocizna.dni).toBeCloseTo(2000 / 8 / 8, 6)
  })

  it('robocizna szczegółowa: suma rbh × stawka z wierszy', () => {
    const k = policzAparat({ ...a, metoda_robocizny: 'szczegolowa', pozycje: [
      poz({ zakladka: 'robocizna', nazwa: 'spawacz', ilosc: 100, cena_jedn: 120 }),
      poz({ zakladka: 'robocizna', nazwa: 'ślusarz', ilosc: 50, cena_jedn: 90 }),
    ] }, PAR)
    expect(k.robocizna).toMatchObject({ rbh: 150, wartosc: 16_500 })
    expect(k.robocizna.srednia_stawka).toBe(110)
  })

  it('podsumowanie: koszty, zł/kg, udziały, zysk i cena bez zaokrąglenia', () => {
    const w = policzWycene([a], { ...PAR, narzut_zysk_proc: 25, zaokraglenie: 0, kurs_eur: 4 })
    expect(w.robocizna.koszt).toBe(100_000)
    expect(w.materialy.koszt).toBe(102_000)
    expect(w.kooperacja.koszt).toBe(20_000)
    expect(w.badania.koszt).toBe(8000 + 2000 + 3000)
    expect(w.koszty.koszt).toBe(235_000)
    expect(w.koszty.zl_kg).toBe(23.5)
    expect(w.materialy.udzial).toBeCloseTo(102_000 / 235_000, 10)
    expect(w.cena).toBe(293_750)
    expect(w.zysk).toBe(58_750)
    expect(w.cena_koncowa_eur).toBe(73_437.5)
  })

  it('bez dostępu do marż liczy tylko koszty', () => {
    const w = policzWycene([a], PAR)
    expect(w.cena).toBeNull()
    expect(w.koszty.koszt).toBe(235_000)
  })
})

describe('cena: narzut zakupowy, zaokrąglenie, korekta prezesa, warianty (układ notatki dla prezesa, liczby fikcyjne)', () => {
  const a = aparat({
    masa_netto_kg: 2000, metoda_robocizny: 'szczegolowa',
    pozycje: [
      poz({ zakladka: 'projekt', nazwa: 'Projekt', wartosc_reczna: 5000 }),
      poz({ sekcja: 'blachy', nazwa: 'Materiał', ilosc: 2200, jm: 'kg', cena_jedn: 10, jednostka_ceny: 'kg' }),
      poz({ zakladka: 'robocizna', nazwa: 'Robocizna', ilosc: 300, cena_jedn: 100 }),
      poz({ zakladka: 'kooperacja', nazwa: 'Izolacja', wartosc_reczna: 20_000, opcjonalna: true, wariant: 'izolacja i montaż' }),
      poz({ zakladka: 'inne', nazwa: 'Demontaż i montaż', wartosc_reczna: 40_000, opcjonalna: true, wariant: 'izolacja i montaż' }),
    ],
    naddatki: { blachy: 0 },
  })
  const par = { ...PAR, narzut_zakupowy_proc: 0, narzut_zysk_proc: 10, zaokraglenie: 100, korekta_prezesa_kwota: 30_000 }

  it('razem → narzut → zaokrąglenie do 100 zł → + korekta prezesa', () => {
    const w = policzWycene([a], par)
    expect(w.koszty.koszt).toBe(5000 + 22_000 + 30_000 + 20_000 + 40_000) // 117 000
    expect(w.cena).toBe(128_700)        // 117 000 × 1,1
    expect(w.korekta).toBe(30_000)
    expect(w.cena_koncowa).toBe(158_700)
    expect(w.cena_koncowa_zl_kg).toBeCloseTo(79.35, 6)
  })

  it('wariant bez pozycji opcjonalnych (bez korekty prezesa)', () => {
    const w = policzWycene([a], par)
    expect(w.ma_opcje).toBe(true)
    expect(w.cena_bez_opcji).toBe(62_700) // (117 000 − 60 000) × 1,1 = 62 700
  })

  it('zaokrąglenie per aparat i ilość sztuk', () => {
    const b = aparat({ ilosc: 2, metoda_robocizny: 'szczegolowa', pozycje: [poz({ zakladka: 'inne', nazwa: 'x', wartosc_reczna: 100_123 })] })
    const w = policzWycene([b], { ...PAR, narzut_zysk_proc: 15, zaokraglenie: 100 })
    expect(w.aparaty[0].cena_szt).toBe(115_100)   // 115 141,45 → 115 100
    expect(w.cena).toBe(230_200)
  })

  it('narzut zakupowy i na kooperację', () => {
    const b = aparat({ metoda_robocizny: 'szczegolowa', pozycje: [
      poz({ sekcja: 'zlaczne', nazwa: 'm', wartosc_reczna: 1000 }), poz({ zakladka: 'kooperacja', nazwa: 'k', wartosc_reczna: 1000 }),
    ] })
    const k = policzAparat(b, { ...PAR, narzut_zakupowy_proc: 5, narzut_kooperacja_proc: 10 })
    expect(k.materialy.razem).toBe(1050)
    expect(k.kooperacja.razem).toBe(1100)
  })
})

describe('ostrzeżenia', () => {
  const o = { dzis: '2099-06-01', wiek_ceny_mies: 6, ryzyko_dni: 7, waznosc_oferty_klienta_dni: 30, termin_realizacji_tyg: 20, montaz_tyg: 4 }
  const lista = (p: Partial<PozycjaKalk>) => ostrzezenia([aparat({ metoda_robocizny: 'szczegolowa', pozycje: [poz(p)] })], o).map((x) => x.rodzaj)

  it('brak ceny', () => expect(lista({ nazwa: 'blacha' })).toContain('brak_ceny'))
  it('komplet bez masy', () => expect(lista({ nazwa: 'wypałki', jm: 'kpl', cena_jedn: 1 })).toContain('kpl_bez_masy'))
  it('komplet oznaczony "cena za komplet" - bez ostrzeżenia', () => expect(lista({ nazwa: 'wypałki', jm: 'kpl', cena_jedn: 1, cena_za_komplet: true })).toEqual([]))
  it('cena starsza niż 6 miesięcy', () => expect(lista({ nazwa: 'r', cena_jedn: 1, zrodlo_data: '2098-10-01' })).toContain('stara_cena'))
  it('krótko ważna oferta dostawcy = ryzyko cenowe', () => {
    expect(lista({ nazwa: 'r', cena_jedn: 1, zrodlo_ceny: 'oferta', zrodlo_data: '2099-05-30', zrodlo_waznosc_do: '2099-06-03' })).toContain('ryzyko_cenowe')
  })
  it('termin dostawy dłuższy niż termin realizacji minus montaż', () => {
    expect(lista({ nazwa: 'r', cena_jedn: 1, zrodlo_termin_dni: 120 })).toContain('termin_dostawy')
    expect(lista({ nazwa: 'r', cena_jedn: 1, zrodlo_termin_dni: 100 })).not.toContain('termin_dostawy')
  })
})

describe('masa z wymiarów', () => {
  it('blacha: g × b × l × ρ', () => {
    // 8 mm × 2000 × 2100 przy ρ = 8,0 (jak w arkuszu wzorcowym) = 268,8 kg
    expect(masaBlachy(8, 2000, 2100, 8.0)).toBeCloseTo(268.8, 6)
    expect(masaBlachy(10, 1000, 1000, 7.85)).toBeCloseTo(78.5, 6)
  })

  it('krążek i pierścień: π/4 × (D² − d²) × h × ρ', () => {
    // pełny krążek Ø1000 × 100, stal węglowa
    expect(masaKrazka(1000, 0, 100, 7.85)).toBeCloseTo((Math.PI / 4) * 1e6 * 100 * 7.85e-6, 6)
    // pierścień Ø740/640 × 238, ρ = 8 - arkusz wzorcowy liczył z π ≈ 3,14 (206,26 kg), wzór dokładny daje o 0,05% więcej
    expect(masaKrazka(740, 640, 238, 8.0)).toBeCloseTo(206.26, 0)
  })

  it('rura: π × (D − s) × s × l × ρ', () => {
    // 1 m rury 114,3 × 6 ze stali nierdzewnej
    expect(masaRury(114.3, 6, 1000, 7.93)).toBeCloseTo(Math.PI * 108.3 * 6 * 1000 * 7.93e-6, 6)
    expect(masaRury(114.3, 6, 1000, 7.93)).toBeCloseTo(16.19, 2)
  })

  it('pręt: π/4 × d² × l × ρ', () => {
    expect(masaPreta(20, 1000, 7.85)).toBeCloseTo(2.466, 3)
  })

  it('masaZWymiarow wybiera wzór wg sposobu i zwraca null bez wymiarów', () => {
    expect(masaZWymiarow('blacha', { grubosc: 10, szerokosc: 1000, dlugosc: 1000 }, 7.85)).toBeCloseTo(78.5, 6)
    expect(masaZWymiarow('krazek', { d_zew: 1000, d_wew: 900, grubosc: 50 }, 7.85)).toBeCloseTo(58.57, 2)
    expect(masaZWymiarow('rura', { d_zew: 20, grubosc: 2 }, 7.85)).toBeCloseTo(0.888, 3) // 1 m
    expect(masaZWymiarow('blacha', { grubosc: 10 }, 7.85)).toBeNull()
    expect(masaZWymiarow('brak', { grubosc: 10, szerokosc: 1, dlugosc: 1 }, 7.85)).toBeNull()
    expect(masaZWymiarow('krazek', { d_zew: 100, d_wew: 120, grubosc: 5 }, 7.85)).toBeNull()
  })
})

describe('zaokrąglenie ceny', () => {
  it('do wielokrotności kroku', () => {
    expect(zaokraglij(122877.5, 100)).toBe(122900)
    expect(zaokraglij(335060, 1000)).toBe(335000)
    expect(zaokraglij(1234.567, 0)).toBe(1234.57)
  })
})

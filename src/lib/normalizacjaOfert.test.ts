import { describe, expect, it } from 'vitest'
import { normalizujCene, uzupelnijMase } from './normalizacjaOfert'

// Ceny FIKCYJNE.
describe('normalizacja cen ofert', () => {
  it('przelicza EUR na PLN kursem oferty i liczy zł/kg z masy', () => {
    const c = normalizujCene({ ilosc: 1, jm: 'szt', cena_jedn: 1000, masa_calk: 250 }, 4.25)
    expect(c).toMatchObject({ wartosc_pln: 4250, cena_pln_jedn: 4250, cena_pln_szt: 4250, cena_pln_kg: 17 })
  })

  it('rury w metrach: zł/m i zł/szt dla sztuki 6 m', () => {
    const c = normalizujCene({ ilosc: 600, jm: 'm', cena_jedn: 10, dlugosc: 6000 }, 1)
    expect(c).toMatchObject({ cena_pln_m: 10, cena_pln_szt: 60, wartosc_pln: 6000 })
  })

  it('rury w sztukach z długością: zł/m', () => {
    expect(normalizujCene({ ilosc: 100, jm: 'szt.', cena_jedn: 60, dlugosc: 6000 }, 1).cena_pln_m).toBe(10)
  })

  it('usługa: cena za jednostkę odniesienia (np. zł/m²)', () => {
    expect(normalizujCene({ ilosc: 1, jm: 'kpl', cena_jedn: 6000, wielkosc_odniesienia: 50 }, 1).cena_pln_odniesienia).toBe(120)
  })

  it('pozycja w kg', () => {
    expect(normalizujCene({ ilosc: 100, jm: 'kg', cena_jedn: 2 }, 4).cena_pln_kg).toBe(8)
  })

  it('masa odkuwki z wymiarów, gdy dostawca jej nie podał', () => {
    const m = uzupelnijMase({ ilosc: 2, jm: 'szt', d_zew: 1000, grubosc: 100 }, 'krazek', 7.85)
    expect(m.wyliczona).toBe(true)
    expect(m.masa_jedn).toBeCloseTo(616.5, 1)
    expect(m.masa_calk).toBeCloseTo(1233.0, 0)
  })

  it('masa podana przez dostawcę ma pierwszeństwo', () => {
    expect(uzupelnijMase({ ilosc: 2, jm: 'szt', masa_jedn: 10, d_zew: 1000, grubosc: 100 }, 'krazek', 7.85)).toEqual({ masa_jedn: 10, masa_calk: 20, wyliczona: false })
  })

  it('rura w metrach: masa 1 m', () => {
    const m = uzupelnijMase({ ilosc: 10, jm: 'm', d_zew: 20, grubosc: 2, dlugosc: 6000 }, 'rura', 7.85)
    expect(m.masa_jedn).toBeCloseTo(0.888, 3)
    expect(m.masa_calk).toBeCloseTo(8.88, 2)
  })
})

import { describe, expect, it } from 'vitest'
import { kwotaZLinii, parsujNotatke } from './importNotatki'
import { policzWycene, type ParametryKalk } from './kalkulacja'

// Notatka w układzie "Wycena.docx" z danymi FIKCYJNYMI.
const NOTATKA = `ZO/001/2099 Klient testowy - zbiornik testowy T-1 S235JR o wadze 2000 kg
Projekt: 5 000,- zł
Materiał S235JR: 2000 kg x 1,1 = 2200 kg x 10 zł/kg = 22 000,- zł
Materiał spawalniczy: 1 000,- zł
Kooperacja (zwijanie blach): 1 000,- zł
Robocizna: 300 rbg x 100 zł/godz. = 30 000,- zł
Badania NDT spoin i koszty KJ: 2 000,- zł
Izolacja: 20 000,- zł
Pakowanie i transport: 4 000,- zł
Demontaż i montaż: 40 000,- zł
Razem: 125 000,- zł
Narzut 10%: 12 500,- zł
Łącznie: 137 500,00 zł + 10 000,00 zł (prezes) = 147 500,00 zł + vat
Waga: 2 000 kg
Cena z 10% narzutem bez izolacji i demontażu/montażu: 71 500,00 zł + vat
Oferta obejmuje:
Wykonanie zbiornika`.split('\n')

const PAR: ParametryKalk = { narzut_zakupowy_proc: 0, narzut_kooperacja_proc: 0, sposobMasy: () => 'brak', gestosc: () => 7.85, naddatekDomyslny: () => 0 }

describe('import notatki dla prezesa', () => {
  it('kwoty z linii', () => {
    expect(kwotaZLinii('Projekt: 10 000,- zł')).toBe(10000)
    expect(kwotaZLinii('Materiał: 3000 kg x 1,1 = 3300 kg x 14 zł/kg = 46 200,- zł')).toBe(46200)
    expect(kwotaZLinii('Łącznie: 293 500,00 zł')).toBe(293500)
  })

  it('pozycje, narzut, korekta prezesa, wariant', () => {
    const n = parsujNotatke(NOTATKA)
    expect(n.aparat.masa_netto_kg).toBe(2000)
    expect(n.narzut_zysk_proc).toBe(10)
    expect(n.korekta_prezesa_kwota).toBe(10000)
    expect(n.zaokraglenie).toBe(0)
    const mat = n.aparat.pozycje.find((p) => p.nazwa.startsWith('Materiał S235'))!
    expect(mat).toMatchObject({ zakladka: 'materialy', ilosc: 2200, jm: 'kg', cena_jedn: 10 })
    expect(n.aparat.pozycje.find((p) => p.zakladka === 'robocizna')).toMatchObject({ ilosc: 300, cena_jedn: 100 })
    expect(n.aparat.pozycje.filter((p) => p.opcjonalna).map((p) => p.nazwa)).toEqual(['Izolacja', 'Demontaż i montaż'])
  })

  it('nowa metoda odtwarza razem, łącznie, cenę końcową i wariant', () => {
    const n = parsujNotatke(NOTATKA)
    const w = policzWycene([n.aparat], { ...PAR, narzut_zysk_proc: n.narzut_zysk_proc, zaokraglenie: n.zaokraglenie, korekta_prezesa_kwota: n.korekta_prezesa_kwota })
    expect(w.koszty.koszt).toBe(125_000)
    expect(w.cena).toBe(137_500)
    expect(w.cena_koncowa).toBe(147_500)
    expect(w.cena_bez_opcji).toBe(71_500)
  })

  it('suma pośrednia materiałów nie jest sumą całkowitą', () => {
    const n = parsujNotatke(`Aparat X o wadze 5000 kg
Projekt: 1 000,- zł
Materiał hutniczy:
Dennice 500 kg: 5 000,- zł
Blachy 1000 kg: 10 000,- zł
Razem: 15 000,- zł
Robocizna: 100 rbg x 100 zł = 10 000,- zł
Całkowita kwota: 26 000,- zł
Narzut 10%: 2 600,- zł
Łącznie: 28 600,- zł`.split('\n'))
    expect(n.oczekiwane.razem).toBe(26_000)
    expect(n.aparat.pozycje.find((p) => p.nazwa === 'Dennice')).toMatchObject({ sekcja: 'dennice', masa_jedn: 500 })
    const w = policzWycene([n.aparat], { ...PAR, narzut_zysk_proc: 10, zaokraglenie: n.zaokraglenie })
    expect(w.koszty.koszt).toBe(26_000)
    expect(w.cena).toBe(28_600)
  })
})

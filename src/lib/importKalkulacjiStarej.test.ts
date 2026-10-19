import { describe, expect, it } from 'vitest'
import { importujStaraKalkulacje, narzutZNotatki, type Wiersz } from './importKalkulacjiStarej'
import { policzWycene, zaokraglij, type ParametryKalk } from './kalkulacja'

// Układ starej Kalkulacja.xlsx z danymi FIKCYJNYMI.
const v = (x: unknown, f?: string) => ({ v: x, f })
const NAGL = ['Urządzenie', 'Ilość szt.', 'Mat. S/T', 'OD', 'L', 'gpł', 'Q mat', 'Q apar.', 'Kden', 'Kkr', 'Ksit+prz', 'Kpł', 'Kkoł', 'Krurtech', 'Kśr', 'Kuszcz',
  'Materiały', 'Materiały +', 'Dokum', 'Badania spoin + KJ', 'Koszty UDT', 'Malowanie, trawienie i pasywacja', 'Izolacja', 'Transp.', 'Inne (zwijanie płaszczy)',
  'Koszty mat. + usług', 'Robocizna Rbh', 'Montaż', 'Koszt zł netto/szt.']
const WIERSZE: Wiersz[] = [
  [v('Klient testowy - aparaty testowe')],
  [],
  NAGL.map((n) => v(n)),
  [v('Aparat A'), v(2), v('S235JR'), v(1000), v(5000), v(8), v(2000), v(1800), v(1000), v(500), v(0), v(3000), v(0), v(0), v(400), v(100),
    v(5000, 'SUM(I4,J4,K4,L4,M4,N4,O4,P4)'), v(5500, 'Q4*1.1'), v(0), v(1000), v(1000), v(2000), v(0), v(500), v(300),
    v(10300, 'SUM(R4,S4,T4,U4,V4,W4,X4,Y4)'), v(100), v(0), v(18300, 'Z4+(AA4*80)+AB4')],
]

const PAR: ParametryKalk = { narzut_zakupowy_proc: 0, narzut_kooperacja_proc: 0, sposobMasy: () => 'brak', gestosc: () => 7.85, naddatekDomyslny: (s) => (s === 'blachy' ? 5 : 0) }

describe('import starej Kalkulacja.xlsx', () => {
  const k = importujStaraKalkulacje(WIERSZE)

  it('narzut zakupowy i stawka z formuł', () => {
    expect(k.narzut_zakupowy_proc).toBe(10)
    expect(k.aparaty[0].pozycje.find((p) => p.zakladka === 'robocizna')).toMatchObject({ ilosc: 100, cena_jedn: 80 })
  })

  it('kolumny kosztów trafiają do zakładek nowej metody', () => {
    const a = k.aparaty[0]
    expect(a).toMatchObject({ nazwa: 'Aparat A', ilosc: 2, masa_netto_kg: 1800 })
    expect(a.pozycje.filter((p) => p.zakladka === 'materialy').map((p) => p.sekcja)).toEqual(['dennice', 'rury_krocce', 'blachy', 'zlaczne', 'uszczelki'])
    expect(a.pozycje.find((p) => p.zakladka === 'kooperacja')?.nazwa).toBe('Malowanie, trawienie i pasywacja')
    expect(a.naddatki.blachy).toBe(0)
  })

  it('nowa metoda odtwarza koszt z arkusza', () => {
    const w = policzWycene(k.aparaty, { ...PAR, narzut_zakupowy_proc: k.narzut_zakupowy_proc, narzut_zysk_proc: 15, zaokraglenie: 100 })
    expect(w.aparaty[0].koszt_szt).toBe(18_300)
    expect(w.aparaty[0].cena_szt).toBe(zaokraglij(18_300 * 1.15, 100))  // 21 045 -> 21 000
    expect(w.cena).toBe(42_000)
  })

  it('narzut z notatki Word', () => {
    expect(narzutZNotatki(['Całkowita kwota: 36 600,- zł', 'Narzut 15%: 5 400,- zł', 'Łącznie: 42 000,- zł'])).toEqual({ zysk: 15, razem: 36_600, lacznie: 42_000 })
  })
})

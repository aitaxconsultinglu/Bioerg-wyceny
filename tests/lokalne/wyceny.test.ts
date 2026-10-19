// Test akceptacyjny etapu 3 na PRAWDZIWYCH plikach (lokalnie): nowa metoda (kalkulacja.ts)
// odtwarza wyniki dotychczasowych arkuszy wyceny, starych kalkulacji i notatek dla prezesa. Kwoty czytane z plików,
// nazwy plików z lokalnej konfiguracji (prywatne/testy.json) - repo nie zawiera ani jednych, ani drugich.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { wierszeZFormulami, wszystkieArkusze } from '../../src/lib/arkusz'
import { importujStaraKalkulacje, narzutZNotatki } from '../../src/lib/importKalkulacjiStarej'
import { importujArkuszWyceny } from '../../src/lib/importArkuszaWyceny'
import { importujNotatkeWyceny } from '../../src/lib/importNotatki'
import { policzAparat, policzWycene, type ParametryKalk } from '../../src/lib/kalkulacja'
import { TESTY, plikTestu } from './srodowisko'

// Domyślne naddatki jak w bazie (blachy 5%, odkuwki/kołnierze/pręty 2%) - importery muszą je
// jawnie wyzerować tam, gdzie stary dokument podawał kwoty już z naddatkiem.
const NADDATKI: Record<string, number> = { blachy: 5, odkuwki: 2, kolnierze: 2, prety: 2 }
const PAR: ParametryKalk = {
  narzut_zakupowy_proc: 0, narzut_kooperacja_proc: 0, zaokraglenie: 0,
  sposobMasy: () => 'brak', gestosc: () => 7.85, naddatekDomyslny: (s) => NADDATKI[s ?? ''] ?? 0,
}

const ARKUSZE = (TESTY.arkusze_wycen ?? []).filter((p) => plikTestu(p))
describe.skipIf(!ARKUSZE.length)('arkusze wycen: nowa metoda odtwarza arkusz', () => {
  for (const [i, plik] of ARKUSZE.entries()) {
    it(`arkusz ${i + 1}`, () => {
      const sciezka = plikTestu(plik)!
      const w = importujArkuszWyceny(wszystkieArkusze(readFileSync(sciezka)))
      const par = { ...PAR, narzut_zysk_proc: w.narzut_zysk_proc, kurs_eur: w.kurs_eur }
      const wynik = policzWycene([w.aparat], par)
      const o = w.oczekiwane
      expect(wynik.robocizna.koszt).toBeCloseTo(o.robocizna, 2)
      expect(wynik.materialy.koszt).toBeCloseTo(o.materialy, 2)
      expect(wynik.kooperacja.koszt).toBeCloseTo(o.kooperacja, 2)
      expect(wynik.badania.koszt).toBeCloseTo(o.badania, 2)
      expect(wynik.koszty.koszt).toBeCloseTo(o.koszty, 2)
      expect(wynik.zysk!).toBeCloseTo(o.zysk, 2)
      expect(wynik.cena!).toBeCloseTo(o.cena, 1)
      if (o.cena_eur) expect(wynik.cena_koncowa_eur!).toBeCloseTo(o.cena_eur, 1)
      if (o.masa_brutto) expect(policzAparat(w.aparat, par).materialy.masa_brutto).toBeCloseTo(o.masa_brutto, 2)
    })
  }
})

const PRZYPADKI = (TESTY.kalkulacje ?? []).filter((p) => plikTestu(p.kalk) && plikTestu(p.notatka))
describe.skipIf(!PRZYPADKI.length)('stara Kalkulacja.xlsx + notatka: nowa metoda odtwarza koszt i cenę', () => {
  for (const [i, p] of PRZYPADKI.entries()) {
    it(`kalkulacja ${i + 1}`, async () => {
      const sciezka = plikTestu(p.kalk)!
      const k = importujStaraKalkulacje(wierszeZFormulami(readFileSync(sciezka)))
      const mammoth = await import('mammoth')
      const { value } = await mammoth.extractRawText({ buffer: readFileSync(plikTestu(p.notatka)!) })
      const n = narzutZNotatki(value.split('\n'))
      const par = { ...PAR, narzut_zakupowy_proc: k.narzut_zakupowy_proc, narzut_zysk_proc: n.zysk }
      const koszty = policzWycene(k.aparaty, par)
      koszty.aparaty.forEach((a, i) => expect(a.koszt_szt).toBeCloseTo(k.koszty_szt[i], 2))
      expect(koszty.koszty.koszt).toBeCloseTo(n.razem!, 2)
      const zaokr = [0, 10, 100, 1000].find((z) => Math.abs((policzWycene(k.aparaty, { ...par, zaokraglenie: z }).cena ?? 0) - n.lacznie!) < 0.01)
      expect(zaokr).toBeDefined()
    })
  }
})

const NOTATKI = (TESTY.notatki ?? []).filter((p) => plikTestu(p))
describe.skipIf(!NOTATKI.length)('notatki dla prezesa (Wycena.docx): nowa metoda odtwarza razem / narzut / łącznie', () => {
  for (const [i, plik] of NOTATKI.entries()) {
    it(`notatka ${i + 1}`, async () => {
      const sciezka = plikTestu(plik)!
      const n = await importujNotatkeWyceny(new Uint8Array(readFileSync(sciezka)))
      const wynik = policzWycene([n.aparat], { ...PAR, narzut_zysk_proc: n.narzut_zysk_proc, zaokraglenie: n.zaokraglenie, korekta_prezesa_kwota: n.korekta_prezesa_kwota })
      expect(wynik.koszty.koszt).toBeCloseTo(n.oczekiwane.razem, 2)
      expect(wynik.cena!).toBeCloseTo(n.oczekiwane.lacznie, 2)
      if (n.oczekiwane.cena_koncowa) expect(wynik.cena_koncowa!).toBeCloseTo(n.oczekiwane.cena_koncowa, 2)
      if (n.oczekiwane.cena_bez_opcji) expect(wynik.cena_bez_opcji!).toBeCloseTo(n.oczekiwane.cena_bez_opcji, 2)
    })
  }
})

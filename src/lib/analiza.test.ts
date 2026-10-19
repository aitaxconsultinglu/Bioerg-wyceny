import { describe, expect, it } from 'vitest'
import {
  CHECKLISTA, podobnyTekst, postepKarty, pustaKarta, tekstDoAnalizy, terminOfertyISO, uslugiDoZapytan, uzupelnijKarte, zrodloTekst, zWynikuAnalizyAi, type AnalizaAi,
} from './analiza'

// Dane FIKCYJNE.
const AI: AnalizaAi = {
  podsumowanie: {
    przedmiot: 'Zbiornik buforowy V-1', klient: 'Zakłady Przykładowe S.A.', nr_zapytania_klienta: 'ZAP/1', ilosc_szt: 1, masa_kg: 4500, wymiary: 'Ø2000 x 4000', miejsce_dostawy: 'Zakład klienta',
    termin_oferty: '30.10.2026 godz. 12:00', termin_oferty_data: '2026-10-30', termin_realizacji: 'postój 2027', postoj: 'IV 2027', warunki_dostawy: 'DDP',
    waznosc_oferty: '90 dni', gwarancja: '36 miesięcy', platnosc: '60 dni', dokumenty_oferty: 'formularz cenowy',
  },
  aparaty: [{ nazwa: 'Zbiornik V-1', typ: 'zbiornik pionowy', ilosc: 1, masa_kg: 4500, srednica_mm: 2000, dlugosc_mm: null, wysokosc_mm: 4000, material: 'P265GH' }],
  wymagania: [
    { kod: 'wizja', nazwa: 'Wizja lokalna', stan: 'wymagane', wplyw: 'sredni', opis: 'obowiązkowa wizja lokalna', cytat: 'Wizja lokalna jest obowiązkowa', dokument: 'Specyfikacja.docx', strona: 2 },
    { kod: 'izolacja', nazwa: 'Izolacja', stan: 'wymagane', wplyw: 'wysoki', opis: 'wełna 100 mm + blacha', cytat: 'izolacja 100 mm', dokument: 'Specyfikacja.docx', strona: 3 },
    { kod: 'inne', nazwa: 'Plan jakości', stan: 'wymagane', wplyw: 'niski', opis: 'plan jakości przed produkcją', cytat: '', dokument: null, strona: null },
  ],
  uslugi: [{ kategoria: 'izolacja', opis: 'Izolacja zbiornika', ilosc: 1, jm: 'kpl', uwagi: 'wełna 100 mm' }, { kategoria: null, opis: 'Badanie NFT', ilosc: 120, jm: 'szt', uwagi: null }],
  pytania: [{ tresc: 'Czy zbiornik podlega UDT?', dokument: 'Specyfikacja.docx', strona: 5 }],
  niespojnosci: [{ opis: '„Nie podlega UDT”, a jednocześnie wymagany znak CE i JN', dokumenty: 'Specyfikacja.docx str. 5 / 7' }],
  dokumenty: [{ nazwa: 'Standard.pdf', istotny: false, uzasadnienie: 'ogólny standard' }],
  uwagi_analizy: '',
}

describe('karta analizy', () => {
  it('pusta karta ma całą checklistę z §7.2', () => {
    const k = pustaKarta()
    expect(k.wymagania.map((w) => w.kod)).toEqual(CHECKLISTA.map((c) => c.kod))
    expect(k.wymagania.every((w) => w.stan === 'brak_informacji')).toBe(true)
    expect(postepKarty(k)).toMatchObject({ sprawdzone: 0, razem: CHECKLISTA.length })
  })

  it('karta z bazy (niepełna) dostaje brakujące pola i pozycje checklisty; własne wymagania zostają na końcu', () => {
    const k = uzupelnijKarte({ wymagania: [{ kod: 'x1', nazwa: 'Własne', stan: 'wymagane', wplyw: null, opis: '', cytat: '', zrodlo: '' }, { kod: 'pwht', nazwa: 'stara nazwa', stan: 'nie', wplyw: null, opis: 'brak', cytat: '', zrodlo: '' }] })
    expect(k.wymagania).toHaveLength(CHECKLISTA.length + 1)
    expect(k.wymagania.find((w) => w.kod === 'pwht')).toMatchObject({ stan: 'nie', nazwa: 'PWHT (obróbka cieplna)' })
    expect(k.wymagania.at(-1)!.kod).toBe('x1')
    expect(k.ocena.terminy_materialow.length).toBeGreaterThan(0)
  })

  it('wynik AI: puste pola uzupełnione, poprawki człowieka zostają, listy bez duplikatów', () => {
    const obecna = pustaKarta()
    obecna.podsumowanie.przedmiot = 'Zbiornik (wpisane ręcznie)'
    obecna.wymagania = obecna.wymagania.map((w) => (w.kod === 'izolacja' ? { ...w, stan: 'nie', opis: 'bez izolacji - ustalone z klientem' } : w))
    obecna.pytania = [{ tresc: 'Czy zbiornik podlega UDT?', zrodlo: '', odpowiedz: 'tak' }]
    const k = zWynikuAnalizyAi(AI, obecna)
    expect(k.podsumowanie.przedmiot).toBe('Zbiornik (wpisane ręcznie)')
    expect(k.podsumowanie.termin_oferty_data).toBe('2026-10-30')
    expect(k.wymagania.find((w) => w.kod === 'wizja')).toMatchObject({ stan: 'wymagane', zrodlo: 'Specyfikacja.docx, str. 2', cytat: 'Wizja lokalna jest obowiązkowa' })
    expect(k.wymagania.find((w) => w.kod === 'izolacja')).toMatchObject({ stan: 'nie', opis: 'bez izolacji - ustalone z klientem' })
    expect(k.wymagania.at(-1)).toMatchObject({ nazwa: 'Plan jakości', stan: 'wymagane' })
    expect(k.pytania).toHaveLength(1)
    expect(k.uslugi).toHaveLength(2)
    expect(k.niespojnosci[0].opis).toContain('UDT')
    expect(k.aparaty[0].nazwa).toBe('Zbiornik V-1')
    // Drugi przebieg nie dubluje list.
    const k2 = zWynikuAnalizyAi(AI, k)
    expect([k2.uslugi.length, k2.niespojnosci.length, k2.wymagania.length]).toEqual([2, 1, k.wymagania.length])
    expect(postepKarty(k2)).toMatchObject({ wymagane: 2, niespojnosci: 1 })
  })

  it('źródło cytatu', () => {
    expect(zrodloTekst('Rys.pdf', 3)).toBe('Rys.pdf, str. 3')
    expect(zrodloTekst('Mail', null)).toBe('Mail')
  })

  it('uwagi AI tylko do pustego pola; termin oferty z godziną do karty zapytania', () => {
    expect(zWynikuAnalizyAi({ ...AI, uwagi_analizy: 'Ryzyko: postój' }, pustaKarta()).uwagi).toBe('Ryzyko: postój')
    expect(zWynikuAnalizyAi({ ...AI, uwagi_analizy: 'Ryzyko' }, { ...pustaKarta(), uwagi: 'moje' }).uwagi).toBe('moje')
    const iso = terminOfertyISO({ termin_oferty: '30.10.2026 godz. 10:30', termin_oferty_data: '2026-10-30' })!
    expect(new Date(iso).getHours()).toBe(10)
    expect(new Date(iso).getMinutes()).toBe(30)
    expect(new Date(terminOfertyISO({ termin_oferty: 'do 30.10.2026', termin_oferty_data: '2026-10-30' })!).getHours()).toBe(12)
    expect(terminOfertyISO({ termin_oferty: 'wkrótce', termin_oferty_data: null })).toBeNull()
  })
})

describe('tekst dokumentów do analizy', () => {
  it('kolejność wg typu, standardy na końcu, limit ucina i pomija', () => {
    const dok = [
      { nazwa: 'Standard.pdf', typ: 'standard_klienta', tekst: 's'.repeat(5000), skan: false },
      { nazwa: 'Spec.docx', typ: 'specyfikacja', tekst: 'wymagania '.repeat(300), skan: false },
      { nazwa: 'Mail', typ: 'korespondencja', tekst: 'termin oferty 30.10', skan: false },
      { nazwa: 'Skan.pdf', typ: 'rysunek', tekst: '', skan: true },
    ]
    const t = tekstDoAnalizy(dok, 6000)
    expect(t.tekst.indexOf('Spec.docx')).toBeLessThan(t.tekst.indexOf('Mail'))
    expect(t.tekst).not.toContain('Skan.pdf')
    expect(t.uciete.concat(t.pominiete)).toContain('Standard.pdf')
    expect(t.tekst.length).toBeLessThanOrEqual(6100)
    expect(tekstDoAnalizy(dok).uciete).toEqual([])
  })

  it('ta sama treść w kilku plikach idzie raz', () => {
    const t = tekstDoAnalizy([
      { nazwa: 'Rys.pdf', typ: 'rysunek', tekst: 'DNO GRUBOŚĆ 10', skan: false },
      { nazwa: 'Izolacja.pdf', typ: 'rysunek', tekst: 'DNO GRUBOŚĆ 10 ', skan: false },
    ]).tekst
    expect(t.match(/DNO GRUBOŚĆ/g)).toHaveLength(1)
    expect(t).toContain('<plik nazwa="Izolacja.pdf" typ="rysunek">\n(treść taka sama jak w pliku „Rys.pdf”)')
  })
})

describe('zgodność z funkcją AI', () => {
  it('checklista i typy aparatów w trybie analizuj_zapytanie są te same co w aplikacji', async () => {
    const { CHECKLISTA_ANALIZY, TYPY_APARATOW_AI, TRYBY } = await import('../../supabase/functions/ai/tryby')
    const { TYPY_APARATOW } = await import('./wyceny')
    expect(CHECKLISTA_ANALIZY.map(([kod]) => kod)).toEqual(CHECKLISTA.map((c) => c.kod))
    expect(TYPY_APARATOW_AI).toEqual(TYPY_APARATOW)
    const schemat = JSON.stringify(TRYBY.analizuj_zapytanie.schemat({ kategorieMaterialow: [], kategorieUslug: [{ kod: 'izolacja', nazwa: 'Izolacja', jednostka_odniesienia: 'm2' }] }))
    expect(schemat).toContain('"izolacja"')
    expect(TRYBY.analizuj_zapytanie.instrukcja({ kategorieMaterialow: [], kategorieUslug: [] })).toContain('prawa_autorskie')
  })

  it('każdy tryb mieści się w limicie API: najwyżej 16 pól z anyOf / tablicą typów', async () => {
    const { TRYBY } = await import('../../supabase/functions/ai/tryby')
    const kontekst = { kategorieMaterialow: [{ kod: 'blachy', nazwa: 'Blachy' }], kategorieUslug: [{ kod: 'izolacja', nazwa: 'Izolacja', jednostka_odniesienia: 'm2' }] }
    const unie = (s: unknown): number => {
      if (Array.isArray(s)) return s.reduce((n: number, x) => n + unie(x), 0)
      if (!s || typeof s !== 'object') return 0
      const o = s as Record<string, unknown>
      return (o.anyOf || Array.isArray(o.type) ? 1 : 0) + Object.values(o).reduce((n: number, x) => n + unie(x), 0)
    }
    for (const [tryb, d] of Object.entries(TRYBY)) {
      const wyslany = JSON.parse(JSON.stringify(d.schemat(kontekst)))
      expect(unie(wyslany), tryb).toBeLessThanOrEqual(16)
    }
  })

  it('wartości puste z odpowiedzi modelu wracają do aplikacji jako null', async () => {
    const { TRYBY, normalizujWynik } = await import('../../supabase/functions/ai/tryby')
    const schemat = TRYBY.wyciagnij_oferte.schemat({ kategorieMaterialow: [{ kod: 'blachy', nazwa: 'Blachy' }], kategorieUslug: [] })
    const wynik = normalizujWynik(schemat, {
      czy_oferta: true,
      dostawca: { nazwa: 'Huta X', nip: '', osoba: ' ', email: '', telefon: '' },
      oferta: { termin_dni: 0, waluta: 'PLN', doplaty: [{ opis: 'transport', kwota: 0, za: 'oferta' }], wymagania: { atest_31: 'tak', ped: 'nie', udt: 'brak', udarnosc_temp: 0 } },
      pozycje: [{ lp: 1, kategoria_materialu: '', kategoria_uslugi: '', d_zew: 0, grubosc: 10, ilosc: 2, cena_jedn: 0 }],
    }) as Record<string, any>
    expect(wynik.dostawca).toEqual({ nazwa: 'Huta X', nip: null, osoba: null, email: null, telefon: null })
    expect(wynik.oferta.termin_dni).toBeNull()
    expect(wynik.oferta.wymagania).toEqual({ atest_31: true, ped: false, udt: null, udarnosc_temp: 0 })
    expect(wynik.oferta.doplaty[0].kwota).toBe(0)
    expect(wynik.pozycje[0]).toMatchObject({ kategoria_materialu: null, kategoria_uslugi: null, d_zew: null, grubosc: 10, cena_jedn: 0 })
  })
})

describe('ponowna analiza nie dubluje list', () => {
  it('ta sama usługa / niespójność innymi słowami to duplikat; inna usługa z tej samej kategorii - nie', () => {
    expect(podobnyTekst('Badania RT punktowe spoin', 'Badania RT punktowe spoin i ew. inne NDT')).toBe(true)
    expect(podobnyTekst('Wymiary: specyfikacja fi 1800 x 2000 mm, rysunek 1500x2500 mm.', 'Wymiary: specyfikacja podaje średnicę 1800 i wysokość 2000, rysunek gabaryty 1500x2500 mm.')).toBe(true)
    expect(podobnyTekst('Badanie NFT rurek', 'Badania RT punktowe spoin')).toBe(false)
    const raz = zWynikuAnalizyAi(AI, pustaKarta())
    const dwa = zWynikuAnalizyAi({ ...AI, uslugi: AI.uslugi.map((u) => ({ ...u, opis: `${u.opis} (wg specyfikacji)` })) }, raz)
    expect(dwa.uslugi).toHaveLength(raz.uslugi.length)
  })
})

describe('aparaty z AI przy istniejącej karcie', () => {
  it('wpisane aparaty zostają, AI uzupełnia tylko puste pola i rysunki aparatu o tej samej nazwie', () => {
    const obecna = pustaKarta()
    obecna.aparaty = [{ nazwa: 'Zbiornik V-1', typ: null, ilosc: 2, masa_kg: 5000, srednica_mm: null, dlugosc_mm: null, wysokosc_mm: null, material: null }]
    const k = zWynikuAnalizyAi({ ...AI, aparaty: [{ ...AI.aparaty[0], rysunki: ['V-1.pdf'] }] }, obecna)
    expect(k.aparaty).toEqual([{ nazwa: 'Zbiornik V-1', typ: 'zbiornik pionowy', ilosc: 2, masa_kg: 5000, srednica_mm: 2000, dlugosc_mm: null, wysokosc_mm: 4000, material: 'P265GH', rysunki: ['V-1.pdf'] }])
  })
})

describe('usługi do zapytań', () => {
  it('usługi z karty jako pozycje generatora (rodzaj usługa, kategoria lub "inne")', () => {
    const k = zWynikuAnalizyAi(AI, pustaKarta())
    expect(uslugiDoZapytan(k)).toMatchObject([
      { opis: 'Izolacja zbiornika - wełna 100 mm', ilosc: 1, jm: 'kpl', kategoria: 'izolacja', rodzaj: 'usluga' },
      { opis: 'Badanie NFT', ilosc: 120, jm: 'szt', kategoria: 'inne', rodzaj: 'usluga' },
    ])
  })
})

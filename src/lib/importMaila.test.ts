import { describe, expect, it } from 'vitest'
import {
  adresyWTresci, domenaAdresu, nrZapytaniaZTresci, oczyscTemat, propozycjaZapytania, przedmiotZTematu, rozpoznajKlienta, terminOfertZTresci,
  type KlientImportu,
} from './importMaila'

// Dane FIKCYJNE.
const KLIENCI: KlientImportu[] = [
  { id: 'k1', nazwa: 'Zakłady Przykładowe S.A.', skrot: 'ZAKPRZ', domeny: ['zakprz.example'] },
  { id: 'k2', nazwa: 'Chemia Test Sp. z o.o.', skrot: 'Chemia Test', domeny: [] },
]
const WLASNE = ['firma.example']

describe('import zapytania z maila', () => {
  it('temat bez RE/FW/PD i przedmiot bez "Zapytanie ofertowe nr"', () => {
    expect(oczyscTemat('RE: FW: PD:  Zapytanie   ofertowe - zbiornik')).toBe('Zapytanie ofertowe - zbiornik')
    expect(przedmiotZTematu('FW: Zapytanie ofertowe nr 12/2026 - Zbiornik buforowy V-1')).toBe('Zbiornik buforowy V-1')
    expect(przedmiotZTematu('Zapytanie')).toBe('Zapytanie')
  })

  it('adresy i domeny z treści (cytowany mail klienta)', () => {
    expect(domenaAdresu('Jan <jan@Zakprz.Example>')).toBe('')
    expect(domenaAdresu('jan@zakprz.example')).toBe('zakprz.example')
    expect(adresyWTresci('From: Jan <jan@zakupy.zakprz.example>\nTo: x@firma.example')).toEqual(['jan@zakupy.zakprz.example', 'x@firma.example'])
  })

  it('klient po domenie (także subdomena, także w przekazanym mailu), potem po nazwie; własna i publiczna domena pomijana', () => {
    expect(rozpoznajKlienta({ temat: '', od: 'Jan', od_email: 'jan@zakprz.example', data: null, tekst: '' }, KLIENCI, WLASNE)).toMatchObject({ klient_id: 'k1', domena: 'zakprz.example' })
    expect(rozpoznajKlienta({ temat: 'FW: zapytanie', od: 'Pracownik', od_email: 'p@firma.example', data: null, tekst: 'From: a@zakupy.zakprz.example' }, KLIENCI, WLASNE))
      .toMatchObject({ klient_id: 'k1', domena: 'zakupy.zakprz.example' })
    expect(rozpoznajKlienta({ temat: 'Zapytanie od Chemia Test', od: '', od_email: 'nowy@inna.example', data: null, tekst: '' }, KLIENCI, WLASNE))
      .toMatchObject({ klient_id: 'k2', domena: 'inna.example' })
    expect(rozpoznajKlienta({ temat: 'Zapytanie', od: '', od_email: 'p@firma.example', data: null, tekst: 'chemiatestowa' }, KLIENCI, WLASNE)).toMatchObject({ klient_id: null, domena: null })
    expect(rozpoznajKlienta({ temat: 'Oferta', od: 'Jan', od_email: 'jan.kowalski@interia.pl', data: null, tekst: '' }, KLIENCI, WLASNE)).toMatchObject({ domena: null })
  })

  it('termin składania ofert z godziną i bez; błędna data odrzucona', () => {
    const z = new Date(terminOfertZTresci('Termin składania ofert: 30.10.2026 godz. 10:30.')!)
    expect([z.getFullYear(), z.getMonth() + 1, z.getDate(), z.getHours(), z.getMinutes()]).toEqual([2026, 10, 30, 10, 30])
    expect(new Date(terminOfertZTresci('Oferty prosimy złożyć do dnia 5.11.2026')!).getHours()).toBe(12)
    expect(terminOfertZTresci('termin składania ofert 31.02.2026')).toBeNull()
    expect(terminOfertZTresci('Prosimy o ofertę.')).toBeNull()
  })

  it('numer zapytania klienta', () => {
    expect(nrZapytaniaZTresci('Zapytanie ofertowe nr ZO-123/2026: zbiornik', '')).toBe('ZO-123/2026')
    expect(nrZapytaniaZTresci('Zbiornik', 'Numer postępowania: 4500123.')).toBe('4500123')
    expect(nrZapytaniaZTresci('Zbiornik', 'proszę o ofertę')).toBe('')
  })

  it('propozycja karty zapytania', () => {
    expect(propozycjaZapytania({ temat: 'FW: Zapytanie ofertowe nr 7/2026 - Wymiennik W-1', od: 'P', od_email: 'p@firma.example', data: null,
      tekst: 'From: zakupy@zakprz.example\nTermin składania ofert: 12.11.2026 godz. 12:00' }, KLIENCI, WLASNE))
      .toMatchObject({ przedmiot: 'Wymiennik W-1', klient_id: 'k1', nr_zapytania_klienta: '7/2026' })
  })
})

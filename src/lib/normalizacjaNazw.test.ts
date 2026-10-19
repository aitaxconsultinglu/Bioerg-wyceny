import { describe, expect, it } from 'vitest'
import { masaPozycji, normalizujNazwe, znajdzGatunek } from './normalizacjaNazw'

describe('normalizacja nazw z kart dostawy', () => {
  it('kołnierz szyjkowy: kategoria, typ, DN, PN, gatunek', () => {
    const p = normalizujNazwe('KOŁNIERZ SZYJK. 11B1 DN400/PN16  1.4307')
    expect(p).toMatchObject({ rodzaj: 'material', kategoria: 'kolnierze', typ_elementu: 'kołnierz szyjkowy 11B1', dn: '400', pn: '16', gatunek: '1.4307' })
  })

  it('rura bez szwu 20×2,0', () => {
    const p = normalizujNazwe('RURA 20X2,0 1.4307  B/SZW')
    expect(p).toMatchObject({ kategoria: 'rury_technologiczne', typ_elementu: 'rura', d_zew: 20, grubosc: 2, gatunek: '1.4307', bez_szwu: true })
  })

  it('duża rura ze szwem trafia do rur na króćce', () => {
    const p = normalizujNazwe('RURA 219,1X5,0  1.4307  Z/SZW')
    expect(p).toMatchObject({ kategoria: 'rury_krocce', d_zew: 219.1, grubosc: 5, bez_szwu: false })
  })

  it('dennica Ø406, s = 5', () => {
    expect(normalizujNazwe('DENNICA 406X5 1.4307')).toMatchObject({ kategoria: 'dennice', d_zew: 406, grubosc: 5 })
  })

  it('kątownik to kształtownik', () => {
    expect(normalizujNazwe('KĄTOWNIK 80X80X8  1.4301 g/w')).toMatchObject({ kategoria: 'ksztaltowniki', szerokosc: 80, grubosc: 8, gatunek: '1.4301' })
  })

  it('wypałki w komplecie - bez masy (kolejka "uzupełnij masę")', () => {
    const p = normalizujNazwe('Wypałki 1.4301/1.4307 wg EN 10028-7')
    expect(p).toMatchObject({ rodzaj: 'material', kategoria: 'blachy', gatunek: '1.4301/1.4307' })
    expect(masaPozycji(p, 1, 'kpl')).toBeNull()
  })

  it('wypałka #3 220×220 - masa z wymiarów', () => {
    const p = normalizujNazwe('Wypałka #3 220x220 S235')
    expect(p).toMatchObject({ kategoria: 'blachy', grubosc: 3, szerokosc: 220, dlugosc: 220 })
    expect(masaPozycji(p, 6, 'szt')!.masa).toBeCloseTo(6 * 3 * 220 * 220 * 7.85e-6, 3)
  })

  it('pręt Ø16 L=3m w kg - masa z jednostki', () => {
    const p = normalizujNazwe('Pręt D16 L=3m gat 1.4301 EN 10088-2')
    expect(p).toMatchObject({ kategoria: 'prety', d_zew: 16, dlugosc: 3000, gatunek: '1.4301', norma: 'EN 10088-2' })
    expect(masaPozycji(p, 4.9, 'kg')).toEqual({ masa: 4.9, zrodlo: 'jm' })
  })

  it('rura w metrach - masa z wymiarów', () => {
    const p = normalizujNazwe('Rura 114,3x6 L=2m 1.4301/1.4307 EN 10216-5 TC1')
    const m = masaPozycji(p, 2, 'm')!
    expect(m.zrodlo).toBe('wymiary')
    expect(m.masa).toBeCloseTo(2 * 16.19, 1)
  })

  it('kolano i trójnik to kształtki rur', () => {
    expect(normalizujNazwe('Kolano 90 st 3D 114,3x6 304L')).toMatchObject({ kategoria: 'rury_krocce', typ_elementu: 'kolano', gatunek: '304L' })
    expect(normalizujNazwe('Trójnik 33,7x2,6 P235GH EN10253-2/A')).toMatchObject({ kategoria: 'rury_krocce', typ_elementu: 'trójnik', gatunek: 'P235GH' })
  })

  it('atest, transport i kurier w zamówieniu materiałowym to dopłaty', () => {
    for (const n of ['ATEST 3.1', 'ATEST 2.2', 'USŁUGA TRANSPORTOWA', 'USŁUGA TRANSPRTOWA', 'Kurier', 'Koszt transportu']) {
      expect(normalizujNazwe(n, { typZamowienia: 'ZM' }).rodzaj, n).toBe('doplata')
    }
  })

  it('w zamówieniu usługi (ZJ) transport jest usługą projektu', () => {
    expect(normalizujNazwe('USŁUGA TRANSPORTOWA', { typZamowienia: 'ZJ' })).toMatchObject({ rodzaj: 'usluga', kategoria_uslugi: 'transport' })
    expect(normalizujNazwe('Usługa zwijania', { typZamowienia: 'ZJ' })).toMatchObject({ rodzaj: 'usluga', kategoria_uslugi: 'zwijanie' })
    expect(normalizujNazwe('Wykonanie dokumentacji koncesyjno-wykonawczej zbiornika', { typZamowienia: 'ZJ' }).kategoria_uslugi).toBe('projekt')
  })

  it('usługi w zamówieniu materiałowym rozpoznawane po początku nazwy', () => {
    expect(normalizujNazwe('Usługa spawalnicza', { typZamowienia: 'ZM' }).rodzaj).toBe('usluga')
    expect(normalizujNazwe('Obróbka elementów', { typZamowienia: 'ZM' })).toMatchObject({ rodzaj: 'usluga', kategoria_uslugi: 'obrobka' })
    // "uchwyt transportowy" to nie dopłata
    expect(normalizujNazwe('Uchwyt transportowy OC', { typZamowienia: 'ZM' }).rodzaj).toBe('material')
  })

  it('wypałki cięte laserem kupione jako usługa to nadal materiał', () => {
    expect(normalizujNazwe('Wypałki z blachy cięte laserem', { typZamowienia: 'ZM' })).toMatchObject({ rodzaj: 'material', kategoria: 'blachy' })
  })

  it('narzędzia i ścierniwa to materiały pomocnicze', () => {
    for (const n of ['PŁYTKA APKT 1604 PDR7 ACP200', 'PŁYTKA SNMG 190612-RSP-TP35S', 'TARCZA DO CIĘCIA 125', 'DYSK FIBROWY 125 P40', 'PĘDZEL 50MM', 'TRYBOTAŚMA IGLIDUR V-400']) {
      expect(normalizujNazwe(n).rodzaj, n).toBe('pomocnicze')
    }
  })

  it('elementy złączne i uszczelki', () => {
    expect(normalizujNazwe('ŚRUBA M20X80 A2-70  ISO 4017')).toMatchObject({ kategoria: 'zlaczne', gatunek: 'A2-70' })
    expect(normalizujNazwe('NAKRĘTKA M16 A2').kategoria).toBe('zlaczne')
    expect(normalizujNazwe('USZCZELKA PŁASKA DN500 PN6 01B, 3MM')).toMatchObject({ kategoria: 'uszczelki', dn: '500', pn: '6' })
  })

  it('odkuwki: krążek i pierścień z wymiarami', () => {
    expect(normalizujNazwe('Odkuwka, krążek Ø1110x126 mm ASTM A-350 Gr. LF2')).toMatchObject({ kategoria: 'odkuwki', typ_elementu: 'krążek', d_zew: 1110, grubosc: 126, gatunek: 'A350 LF2' })
    expect(normalizujNazwe('Odkuwka, pierścień Ø1080/Ø955x71 mm ASTM A-350 Gr. LF2')).toMatchObject({ typ_elementu: 'pierścień', d_zew: 1080, d_wew: 955, grubosc: 71 })
  })

  it('zapis gatunków', () => {
    expect(znajdzGatunek('RURA 20X2,2 P355NL2 EN 10216-3')).toBe('P355NL2')
    expect(znajdzGatunek('BLACHA SA 516 GR70 10MM')).toBe('SA516Gr70')
    expect(znajdzGatunek('RURA SA106 GR.B 2"')).toBe('SA106 Gr.B')
    expect(znajdzGatunek('PŁASKOWNIK 50X5 S235JR')).toBe('S235JR')
    expect(znajdzGatunek('KRATA POMOSTOWA OC')).toBeNull()
  })
})

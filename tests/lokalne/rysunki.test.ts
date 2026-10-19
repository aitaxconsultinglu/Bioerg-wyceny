// Test etapu 4 (lokalnie, na prawdziwych rysunkach z folderu materiałów - repo ich nie zawiera):
// render skanu w 300 DPI i cięcie na kafle (bez AI) oraz odczyt tabel z warstwy tekstowej PDF wektorowego.
// Wartości oczekiwane nie są wpisane w test - sprawdzamy strukturę odczytu z samego pliku.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { elementyWObszarze, krocceZTabeli, parametryZTabeli, tokenyObrazu, ulozWTabele } from '../../src/lib/rysunki'
import { infoStrony, kafleObszaru, natywneDpi, otworzRysunek, renderujPodglad, tekstStrony } from '../../src/lib/rysunkiPdf'
import { TESTY, plikTestu } from './srodowisko'

// Nazwy plików z lokalnej konfiguracji (prywatne/testy.json) - repo ich nie zawiera.
const SKAN = plikTestu(TESTY.skan_wykaz?.plik)
const WEKTOR = plikTestu(TESTY.rysunek_wektorowy?.plik)
const wczytaj = async (p: string) => otworzRysunek(new Uint8Array(readFileSync(p)))

describe.skipIf(!SKAN)('skan rysunku: render i kafle (bez AI)', () => {
  it('strona bez warstwy tekstowej, podgląd i prawa połowa w 300 DPI pocięta na kafle <= 1500 px', async () => {
    const doc = await wczytaj(SKAN!)
    const info = await infoStrony(doc, 1)
    expect(info.elementowTekstu).toBe(0)
    const podglad = await renderujPodglad(doc, 1)
    expect(podglad.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(Math.max(podglad.szer, podglad.wys)).toBeLessThanOrEqual(3200)

    const obszar = { x: 0.5, y: 0, w: 0.5, h: 1 }
    const k = await kafleObszaru(doc, 1, obszar)
    expect(k.dpi).toBe(300)
    expect(k.szer).toBe(Math.round(info.szerPt * 300 / 72 * 0.5))
    expect(k.kafle.length).toBeGreaterThan(1)
    for (const x of k.kafle) {
      expect(Math.max(x.prostokat.w, x.prostokat.h)).toBeLessThanOrEqual(1500)
      expect(x.base64.slice(0, 4)).toBe('/9j/')          // JPEG
    }
    // Kafle wycinka to ułamek kosztu całego arkusza w jednym obrazie i są czytelne (bez zmniejszania).
    const tokeny = k.kafle.reduce((s, x) => s + tokenyObrazu(x.prostokat.w, x.prostokat.h), 0)
    expect(tokeny).toBeLessThan(40_000)

    // Natywna rozdzielczość skanu jest odczytywana; mały wycinek jest powiększany do ~1500 px.
    const natywne = await natywneDpi(doc, 1)
    expect(natywne).toBeGreaterThan(100)
    const maly = await kafleObszaru(doc, 1, { x: 0.7, y: 0.05, w: 0.25, h: 0.15 }, { natywne })
    expect(maly.dpi).toBeGreaterThan(300)
    expect(Math.max(maly.szer, maly.wys)).toBeGreaterThanOrEqual(1400)
    expect(maly.kafle).toHaveLength(1)
  }, 60_000)
})

describe.skipIf(!WEKTOR)('PDF wektorowy: tabele z warstwy tekstowej', () => {
  it('dane projektowe: kod projektowy, ciśnienie, temperatura, MDMT z jednostkami', async () => {
    const doc = await wczytaj(WEKTOR!)
    const el = await tekstStrony(doc, 1)
    const kotwica = el.find((e) => /^Design Conditions$/i.test(e.str.trim()))!
    expect(kotwica).toBeDefined()
    const t = ulozWTabele(elementyWObszarze(el, { x: kotwica.x - 170, y: kotwica.y - 5, w: 430, h: 115 }))
    const p = parametryZTabeli(t.wiersze)
    const znajdz = (w: RegExp) => p.find((x) => w.test(x.nazwa))
    expect(znajdz(/design code/i)?.wartosc).toMatch(/\w{3,}/)
    expect(znajdz(/pressure/i)?.jednostka).toMatch(/MPa|bar/i)
    expect(znajdz(/temperature/i)?.jednostka).toMatch(/°C/)
    expect(znajdz(/MDMT/i)?.wartosc).toMatch(/-?\d+/)
    expect(p.every((x) => /[a-z]{2}/i.test(x.nazwa))).toBe(true)
  }, 60_000)

  it('tabela króćców: oznaczenia, średnica nominalna, klasa, typ kołnierza; reszta kolumn w uwagach', async () => {
    const doc = await wczytaj(WEKTOR!)
    const el = await tekstStrony(doc, 3)
    const kotwica = el.find((e) => /^Nozzle Neck$/i.test(e.str.trim()))!
    expect(kotwica).toBeDefined()
    const t = ulozWTabele(elementyWObszarze(el, { x: kotwica.x - 180, y: kotwica.y - 15, w: 560, h: 260 }))
    const k = krocceZTabeli(t.wiersze)
    expect(k.length).toBeGreaterThanOrEqual(3)
    for (const x of k) expect(x.oznaczenie).toMatch(/^[A-Z]\d?$|^N\d+/)
    expect(k.filter((x) => x.dn && /NPS|DN|\d/.test(x.dn)).length).toBeGreaterThanOrEqual(3)
    expect(k.every((x) => x.pn && /\d/.test(x.pn))).toBe(true)
    expect(k.every((x) => x.przylacze)).toBe(true)
    expect(k.every((x) => x.uwagi && /Thk/i.test(x.uwagi))).toBe(true)
  }, 60_000)
})

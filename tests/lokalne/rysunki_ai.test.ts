// Testy akceptacyjne §7.1 (odczyt AI z rysunków) - wywołują prawdziwe Claude API, więc kosztują
// (kilkadziesiąt groszy). Uruchamiane tylko na życzenie:  AI_TESTY=1 npm run test:lokalne
// i tylko gdy klucz ANTHROPIC_API_KEY jest ustawiony w sekretach funkcji. Wartości oczekiwane dla
// PDF-u wektorowego bierzemy z jego warstwy tekstowej - nie są wpisane w repo.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RysunekAi } from '../../src/lib/ai'
import { elementyWObszarze, opisKafla, parametryZTabeli, ulozWTabele, zWynikuAi, type Prostokat, type RodzajObszaru } from '../../src/lib/rysunki'
import { infoStrony, kafleObszaru, natywneDpi, otworzRysunek, tekstStrony } from '../../src/lib/rysunkiPdf'
import { TESTY, env, maMaterialy, maSupabase, plikTestu } from './srodowisko'

// Pliki i oczekiwania z lokalnej konfiguracji (prywatne/testy.json) - repo ich nie zawiera.
const SKAN = plikTestu(TESTY.skan_wykaz?.plik)
const WEKTOR = plikTestu(TESTY.rysunek_wektorowy?.plik)

async function ai(dane: Record<string, unknown>): Promise<{ status: number; wynik?: RysunekAi; error?: string; koszt_pln?: number }> {
  const odp = await fetch(`${env.SUPABASE_URL}/functions/v1/ai`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_JWT}`, apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tryb: 'wyciagnij_liste_z_rysunku', ...dane }),
  })
  return { status: odp.status, ...(await odp.json()) }
}

const wlaczone = process.env.AI_TESTY === '1' && maSupabase && maMaterialy
// Bez klucza funkcja odpowiada 503 jeszcze przed modelem (bez kosztów) - wtedy testy pomijamy.
const maKlucz = wlaczone && (await ai({ szacuj: true, tekst: 'test' })).status !== 503

async function kafleDlaAi(plik: string, strona: number, obszar: Prostokat, rodzaj: RodzajObszaru) {
  const doc = await otworzRysunek(new Uint8Array(readFileSync(plik)))
  const k = await kafleObszaru(doc, strona, obszar, { natywne: await natywneDpi(doc, strona) })
  const prost = k.kafle.map((x) => x.prostokat)
  return k.kafle.map((x, i) => ({ media_type: 'image/jpeg', dane: x.base64, opis: opisKafla(i + 1, rodzaj, x.prostokat, prost) }))
}

describe.skipIf(!maKlucz || !SKAN)('§7.1 AI: wykaz części ze skanu', () => {
  it('tabela części: wszystkie wiersze, gatunki z rysunku', async () => {
    // Sam wykaz części - tak jak zaznacza go technolog (obszar z konfiguracji lokalnej).
    const t = TESTY.skan_wykaz!
    const obrazy = await kafleDlaAi(SKAN!, 1, t.obszar, 'czesci')
    const odp = await ai({ obrazy, metadane: { plik: 'skan', strona: 1, obszar: 'wykaz części' } })
    expect(odp.status, odp.error).toBe(200)
    const w = zWynikuAi(odp.wynik!, [], [])
    // Model nie może "streszczać" wykazu (effort low pomijał większość wierszy).
    expect(w.pozycje.length).toBeGreaterThanOrEqual(t.min_pozycji)
    const materialy = w.pozycje.map((p) => (p.material ?? '').toUpperCase().replace(/[\s-]/g, '')).join(' ')
    // Gatunki, które są na tym rysunku (z konfiguracji lokalnej).
    for (const g of t.gatunki) expect(materialy).toContain(g)
    expect(w.pozycje.every((p) => p.poz && p.nazwa)).toBe(true)
  }, 240_000)
})

describe.skipIf(!maKlucz || !WEKTOR)('§7.1 AI: rysunek wektorowy - dane projektowe i króćce', () => {
  it('dane projektowe ze skanu strony (obraz) zgodne z warstwą tekstową PDF', async () => {
    const doc = await otworzRysunek(new Uint8Array(readFileSync(WEKTOR!)))
    const info = await infoStrony(doc, 1)
    const el = await tekstStrony(doc, 1)
    const kotwica = el.find((e) => /^Design Conditions$/i.test(e.str.trim()))!
    const pt = { x: kotwica.x - 180, y: kotwica.y - 5, w: 440, h: 290 }
    const oczek = parametryZTabeli(ulozWTabele(elementyWObszarze(el, pt)).wiersze)
    const wart = (w: RegExp) => oczek.find((p) => w.test(p.nazwa))?.wartosc ?? ''
    // Obraz, nie tekst - sprawdzamy czytanie wzrokiem (tak jak dla skanów).
    const obszar = { x: pt.x / info.szerPt, y: pt.y / info.wysPt, w: pt.w / info.szerPt, h: pt.h / info.wysPt }
    const obrazy = await kafleDlaAi(WEKTOR!, 1, obszar, 'parametry')
    const odp = await ai({ obrazy, metadane: { plik: 'rysunek', strona: 1, obszar: 'dane projektowe' } })
    expect(odp.status, odp.error).toBe(200)
    const d = odp.wynik!.dane_projektowe
    const bez = (s: string | null) => (s ?? '').toUpperCase().replace(/[\s.]/g, '')
    expect(bez(d.kod_projektowy)).toContain(bez(wart(/design code/i)).slice(0, 8))
    expect(d.cisnienie_obliczeniowe).toMatch(/\d/)
    expect(d.temperatura_obliczeniowa).toMatch(/\d/)
    expect(d.mdmt ?? '').toContain(wart(/MDMT/i).replace(/\s/g, ''))
    expect(d.naddatek_korozyjny ?? '').toContain(wart(/corrosion allowance/i))
    expect(d.pwht).toBeTruthy()
  }, 240_000)

  it('tabela króćców ze strony 3: oznaczenia i średnice jak w warstwie tekstowej', async () => {
    const doc = await otworzRysunek(new Uint8Array(readFileSync(WEKTOR!)))
    const info = await infoStrony(doc, 3)
    const el = await tekstStrony(doc, 3)
    const kotwica = el.find((e) => /^Nozzle Neck$/i.test(e.str.trim()))!
    const pt = { x: kotwica.x - 180, y: kotwica.y - 15, w: 560, h: 260 }
    const obrazy = await kafleDlaAi(WEKTOR!, 3, { x: pt.x / info.szerPt, y: pt.y / info.wysPt, w: pt.w / info.szerPt, h: pt.h / info.wysPt }, 'krocce')
    const odp = await ai({ obrazy, metadane: { plik: 'rysunek', strona: 3, obszar: 'tabela króćców' } })
    expect(odp.status, odp.error).toBe(200)
    const k = odp.wynik!.krocce
    expect(k.map((x) => x.oznaczenie).sort()).toEqual(expect.arrayContaining(TESTY.rysunek_wektorowy!.krocce))
    expect(k.filter((x) => /NPS|"|DN/.test(x.dn ?? '')).length).toBeGreaterThanOrEqual(3)
  }, 240_000)
})

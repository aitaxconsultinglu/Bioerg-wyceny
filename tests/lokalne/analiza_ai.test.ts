// Test akceptacyjny etapu 4: analiza zapytania (zbiornik do wymiany w postoju, z seeda) przez AI wskazuje m.in. wizję lokalną, termin montażu
// w postoju, izolację, dwa systemy malarskie i niespójność UDT/CE. Wywołuje prawdziwe Claude API (koszt rzędu
// złotówki), więc tylko na życzenie:  AI_TESTY=1 npm run test:lokalne  - i tylko z ustawionym kluczem.
// Dokumenty bierze z zapytania zaimportowanego seedem (teksty w bazie, skany z bucketu).
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { przygotujAnalize } from '../../src/lib/analizaZapytania'
import type { AnalizaAi } from '../../src/lib/analiza'
import { TESTY, env, maSupabase } from './srodowisko'

async function ai(dane: Record<string, unknown>) {
  const odp = await fetch(`${env.SUPABASE_URL}/functions/v1/ai`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_JWT}`, apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tryb: 'analizuj_zapytanie', ...dane }),
  })
  return { status: odp.status, ...(await odp.json()) } as { status: number; wynik?: AnalizaAi; error?: string }
}

const wlaczone = process.env.AI_TESTY === '1' && maSupabase
const maKlucz = wlaczone && (await ai({ szacuj: true, tekst: 'test' })).status !== 503

describe.skipIf(!maKlucz || !TESTY.analiza_ai)('etap 4 AI: analiza zapytania', () => {
  it('wizja lokalna, montaż w postoju, izolacja, dwa systemy malarskie, niespójność UDT / CE', async () => {
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const { data: z } = await db.from('zapytania').select('id, numer, przedmiot').ilike('przedmiot', TESTY.analiza_ai!.przedmiot).single()
    expect(z, 'brak zapytania z konfiguracji testów - uruchom seed').toBeTruthy()
    const p = await przygotujAnalize({ ...z!, klient: null }, db)
    const odp = await ai(p.dane as Record<string, unknown>)
    expect(odp.status, odp.error).toBe(200)
    const w = odp.wynik!
    const wym = (kod: string) => w.wymagania.find((x) => x.kod === kod)
    expect(wym('wizja')?.stan).toBe('wymagane')
    expect(wym('izolacja')?.stan).toBe('wymagane')
    expect(`${wym('montaz')?.opis ?? ''} ${w.podsumowanie.postoj} ${w.podsumowanie.termin_realizacji}`).toMatch(/post[oó]j/i)
    expect(wym('antykorozja')?.opis ?? '').toMatch(/dw(a|óch)\s+system|2\s+system|system\w*\s.+system/i)
    expect(w.niespojnosci.map((n) => n.opis).join(' ')).toMatch(/UDT/)
    expect(w.niespojnosci.map((n) => n.opis).join(' ')).toMatch(/CE|Jednostk|notyfik/i)
  }, 300_000)
})

// Kursy średnie NBP (tabela A) dla EUR i USD, zapisywane z datą publikacji.
// Wywołuje ją pg_cron w dni robocze oraz przycisk „Odśwież kursy” w ustawieniach.
// Jedyne dane od wywołującego to opcjonalna data { data: "RRRR-MM-DD" } - wtedy pobiera kursy z 10 dni do tej
// daty (oferta z datą starszą niż kursy w bazie). Pobiera tylko publiczne kursy, dlatego działa bez tokenu
// użytkownika (verify_jwt = false w supabase/config.toml).
import { klientSerwisowy, NAGLOWKI_CORS, odpowiedz } from '../_wspolne/klienci.ts'

const WALUTY = ['EUR', 'USD']

interface OdpowiedzNbp {
  code: string
  rates: { no: string; effectiveDate: string; mid: number }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: NAGLOWKI_CORS })

  const serwisowy = klientSerwisowy()
  const zapisane: { waluta: string; data: string; kurs: number }[] = []
  const bledy: string[] = []
  const cialo = req.method === 'POST' ? ((await req.json().catch(() => ({}))) as { data?: unknown }) : {}
  const dzien = typeof cialo.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cialo.data) && !Number.isNaN(Date.parse(cialo.data)) ? cialo.data : null
  // Ostatnie 5 publikacji: uzupełnia luki po weekendzie, święcie albo awarii crona. Z datą - 10 dni do niej
  // (NBP nie publikuje w weekendy i święta, a kurs na dzień oferty to ostatni opublikowany przed nią).
  const zakres = dzien ? `${new Date(Date.parse(dzien) - 10 * 86_400_000).toISOString().slice(0, 10)}/${dzien}` : 'last/5'

  for (const waluta of WALUTY) {
    try {
      const odp = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${waluta.toLowerCase()}/${zakres}/?format=json`, {
        headers: { Accept: 'application/json' },
      })
      if (!odp.ok) throw new Error(`NBP odpowiedział ${odp.status}`)
      const dane = (await odp.json()) as OdpowiedzNbp
      const wiersze = dane.rates.map((r) => ({
        waluta, data: r.effectiveDate, kurs: r.mid, tabela: r.no, zrodlo: 'NBP', pobrano: new Date().toISOString(),
      }))
      const { error } = await serwisowy.from('kursy_walut').upsert(wiersze, { onConflict: 'waluta,data' })
      if (error) throw new Error(error.message)
      const ostatni = wiersze[wiersze.length - 1]
      zapisane.push({ waluta, data: ostatni.data, kurs: ostatni.kurs })
    } catch (e) {
      bledy.push(`${waluta}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return odpowiedz({ ok: bledy.length === 0, zapisane, bledy }, bledy.length && !zapisane.length ? 502 : 200)
})

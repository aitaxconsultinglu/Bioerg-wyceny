// Test bezpieczeństwa na prawdziwym projekcie Supabase: dane z ofert, wycen, dokumentów i ustawień nie wychodzą poza
// bazę do nikogo bez nadanej roli. Sprawdza osobę z kluczem publishable (ten sam co w przeglądarce, jawny z założenia),
// konto bez roli (np. założone samodzielnie, gdy rejestracja w Supabase jest jeszcze włączona), pliki w bucketcie,
// funkcje brzegowe i to, że funkcja AI nie zapisuje treści dokumentów w logach. Konta tymczasowe *.test usuwane na końcu.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)
const KORZEN = join(__dirname, '..', '..')
const bezSesji = { auth: { persistSession: false, autoRefreshToken: false } }

/** Tabele i widoki wystawione przez API (PostgREST) - z opisu OpenAPI, czytanego kluczem serwisowym. */
async function tabeleApi(): Promise<string[]> {
  const odp = await fetch(`${env.SUPABASE_URL}/rest/v1/`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } })
  const spec = (await odp.json()) as { paths?: Record<string, unknown> }
  return Object.keys(spec.paths ?? {}).filter((p) => p !== '/' && !p.startsWith('/rpc/')).map((p) => p.slice(1))
}

describe.skipIf(!maSupabase)('bezpieczeństwo: dane nie wychodzą poza aplikację', () => {
  let serwis: SupabaseClient
  let anonim: SupabaseClient
  let obcy: SupabaseClient
  let obcyToken = ''
  let obcyId = ''
  let tabele: string[] = []
  let sciezkaDokumentu: string | null = null
  const email = `obcy-bezp-${znacznik}@wyceny.test`

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, bezSesji)
    anonim = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, bezSesji)
    tabele = await tabeleApi()
    // Konto bez wpisu w uprawnieniach startowych = stan po samodzielnej rejestracji (bez profilu i roli).
    const haslo = `Test-${crypto.randomUUID()}!`
    const { data, error } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
    if (error) throw error
    obcyId = data.user!.id
    obcy = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, bezSesji)
    const { data: s, error: e } = await obcy.auth.signInWithPassword({ email, password: haslo })
    if (e) throw e
    obcyToken = s.session!.access_token
    const { data: dok } = await serwis.from('dokumenty').select('sciezka').not('sciezka', 'is', null).limit(1).maybeSingle()
    sciezkaDokumentu = (dok?.sciezka as string | undefined) ?? null
  }, 60_000)

  afterAll(async () => {
    if (obcyId) await serwis.auth.admin.deleteUser(obcyId)
  }, 60_000)

  it('API wystawia tabele z danymi (lista do sprawdzenia nie jest pusta)', () => {
    expect(tabele).toEqual(expect.arrayContaining(['oferty_dostawcow', 'pozycje_ofert', 'zakupy', 'wyceny', 'dokumenty', 'ustawienia', 'zapytania']))
  })

  it('osoba z samym kluczem publishable nie czyta żadnej tabeli ani widoku', async () => {
    const przecieki: string[] = []
    for (const t of tabele) {
      const { data } = await anonim.from(t).select('*').limit(1)
      if (data?.length) przecieki.push(t)
    }
    expect(przecieki).toEqual([])
  }, 120_000)

  it('konto bez roli nie ma profilu i nie czyta żadnej tabeli ani widoku', async () => {
    expect((await obcy.from('profiles').select('id')).data).toEqual([])
    const przecieki: string[] = []
    for (const t of tabele) {
      const { data } = await obcy.from(t).select('*').limit(1)
      if (data?.length) przecieki.push(t)
    }
    expect(przecieki).toEqual([])
  }, 120_000)

  it('konto bez roli i anonim nie zapisują danych (zapytania, dostawcy, oferty, ustawienia)', async () => {
    for (const k of [anonim, obcy]) {
      expect((await k.from('zapytania').insert({ numer: '', przedmiot: `TEST ${znacznik}`, status: 'nowe' })).error).not.toBeNull()
      expect((await k.from('dostawcy').insert({ nazwa: `TEST ${znacznik}` })).error).not.toBeNull()
      expect((await k.from('oferty_dostawcow').insert({ waluta: 'PLN' })).error).not.toBeNull()
      const { data } = await k.from('ustawienia').update({ wartosc: 1 }).eq('klucz', 'narzut_zakupowy_proc').select()
      expect(data ?? []).toEqual([])
    }
    expect((await serwis.from('zapytania').select('id').eq('przedmiot', `TEST ${znacznik}`)).data).toEqual([])
  }, 60_000)

  it('funkcje bazy z danymi odmawiają kontu bez roli (lista pracowników, użytkowników, cena zatwierdzona, zużycie AI)', async () => {
    expect((await obcy.rpc('lista_uzytkownikow')).data ?? []).toEqual([])
    expect((await obcy.rpc('lista_pracownikow')).data ?? []).toEqual([])
    const { data: w } = await serwis.from('wyceny').select('id').eq('status', 'zatwierdzona').limit(1).maybeSingle()
    if (w) {
      const { data } = await obcy.rpc('cena_zatwierdzona', { p_wycena: w.id })
      expect((data as unknown[] | null) ?? []).toEqual([])
    }
    const { data: zu, error } = await obcy.rpc('ai_zuzycie')
    expect(error !== null || !zu || (Array.isArray(zu) && zu.length === 0)).toBe(true)
  })

  it('dokumenty: bucket prywatny - adres publiczny nie działa, lista i pobranie odmówione bez roli', async () => {
    const { data: b } = await serwis.storage.getBucket('dokumenty')
    expect(b?.public).toBe(false)
    expect((await anonim.storage.from('dokumenty').list('', { limit: 5 })).data ?? []).toEqual([])
    expect((await obcy.storage.from('dokumenty').list('', { limit: 5 })).data ?? []).toEqual([])
    if (sciezkaDokumentu) {
      const publiczny = anonim.storage.from('dokumenty').getPublicUrl(sciezkaDokumentu).data.publicUrl
      expect((await fetch(publiczny)).ok).toBe(false)
      expect((await obcy.storage.from('dokumenty').download(sciezkaDokumentu)).error).not.toBeNull()
      expect((await obcy.storage.from('dokumenty').createSignedUrl(sciezkaDokumentu, 60)).error).not.toBeNull()
      expect((await anonim.storage.from('dokumenty').download(sciezkaDokumentu)).error).not.toBeNull()
    }
    // Aplikacja wydaje linki do plików ważne 60 s.
    expect(readFileSync(join(KORZEN, 'src', 'lib', 'magazyn.ts'), 'utf8')).toMatch(/WAZNOSC_LINKU_S = 60\b/)
  })

  it('funkcja AI: bez logowania 401, konto bez roli 403 (nie wyda budżetu i nie dostanie wyniku)', async () => {
    const cialo = JSON.stringify({ tryb: 'klasyfikuj_mail', szacuj: true, tekst: 'test' })
    const bez = await fetch(`${env.SUPABASE_URL}/functions/v1/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cialo })
    expect(bez.status).toBe(401)
    const zObcym = await fetch(`${env.SUPABASE_URL}/functions/v1/ai`, {
      method: 'POST', headers: { Authorization: `Bearer ${obcyToken}`, apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: cialo,
    })
    expect([401, 403]).toContain(zObcym.status)
  }, 60_000)

  it('funkcja zarządzania użytkownikami odmawia kontu bez roli', async () => {
    const odp = await fetch(`${env.SUPABASE_URL}/functions/v1/zarzadzanie-uzytkownikami`, {
      method: 'POST', headers: { Authorization: `Bearer ${obcyToken}`, apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ akcja: 'dodaj', email: `x-${znacznik}@wyceny.test`, rola: 'administrator' }),
    })
    expect([401, 403]).toContain(odp.status)
    expect((await serwis.from('uprawnienia_startowe').select('email').eq('email', `x-${znacznik}@wyceny.test`)).data).toEqual([])
  }, 60_000)

  it('funkcja AI nie zapisuje treści dokumentów: log ai_uzycie i logi funkcji tylko z metadanymi', async () => {
    const { data } = await serwis.from('ai_uzycie').select('*').limit(1)
    const kolumny = Object.keys(data?.[0] ?? {})
    for (const k of ['tekst', 'obrazy', 'pdfy', 'wynik', 'tresc', 'dane']) expect(kolumny).not.toContain(k)
    const zrodlo = readFileSync(join(KORZEN, 'supabase', 'functions', 'ai', 'index.ts'), 'utf8')
    const logi = zrodlo.split('\n').filter((l) => /console\.(log|info|warn|error)/.test(l))
    expect(logi.length).toBeGreaterThan(0)
    for (const l of logi) expect(l).not.toMatch(/tekst|obrazy|pdfy|wynik|blok|zadanie\)/)
  })

  it('w ustawieniach: rejestracja kont w Supabase (informacyjnie) - konto z rejestracji i tak nie ma dostępu', async () => {
    const odp = await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } })
    const s = (await odp.json()) as { disable_signup?: boolean }
    // Wyłączenie rejestracji to zadanie właściciela projektu (docs/PYTANIA.md) - do tego czasu chronią testy powyżej.
    if (!s.disable_signup) console.warn('Rejestracja nowych kont w Supabase jest WŁĄCZONA - wyłącz ją w panelu (Authentication → Sign In / Providers).')
    expect(typeof s).toBe('object')
  })
})

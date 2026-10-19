// Test akceptacyjny etapu 1 na prawdziwym projekcie Supabase: role, flaga marż, RLS ustawień,
// zarządzanie kontami. Zakłada tymczasowe konta w domenie .test i usuwa je na końcu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)
const KONTA = {
  technolog: { email: `technolog-${znacznik}@wyceny.test`, rola: 'technolog', widzi_marze: false },
  handlowyMarze: { email: `handlowy-${znacznik}@wyceny.test`, rola: 'handlowy', widzi_marze: true },
  admin: { email: `admin-${znacznik}@wyceny.test`, rola: 'administrator', widzi_marze: true },
  obcy: { email: `obcy-${znacznik}@wyceny.test`, rola: null, widzi_marze: false },
} as const
type Nazwa = keyof typeof KONTA

const haslo = () => `Test-${crypto.randomUUID()}!`

describe.skipIf(!maSupabase)('etap 1: uprawnienia w bazie (RLS)', () => {
  let serwis: SupabaseClient
  const klienci = {} as Record<Nazwa, SupabaseClient>
  const id = {} as Record<Nazwa, string>

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const [nazwa, k] of Object.entries(KONTA) as [Nazwa, (typeof KONTA)[Nazwa]][]) {
      if (k.rola) {
        const { error } = await serwis.from('uprawnienia_startowe').insert({ email: k.email, nazwa: `test ${nazwa}`, rola: k.rola, widzi_marze: k.widzi_marze })
        if (error) throw error
      }
      const h = haslo()
      const { data, error } = await serwis.auth.admin.createUser({ email: k.email, password: h, email_confirm: true })
      if (error) throw error
      id[nazwa] = data.user!.id
      const klient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
      const { error: bladLogowania } = await klient.auth.signInWithPassword({ email: k.email, password: h })
      if (bladLogowania) throw bladLogowania
      klienci[nazwa] = klient
    }
  }, 60_000)

  afterAll(async () => {
    if (!serwis) return
    for (const nazwa of Object.keys(KONTA) as Nazwa[]) {
      if (id[nazwa]) await serwis.auth.admin.deleteUser(id[nazwa])
      await serwis.from('uprawnienia_startowe').delete().eq('email', KONTA[nazwa].email)
    }
  }, 60_000)

  it('konto spoza listy uprawnień nie ma profilu i nie widzi żadnych danych', async () => {
    const k = klienci.obcy
    expect((await k.from('profiles').select('id')).data).toEqual([])
    expect((await k.from('ustawienia').select('klucz')).data).toEqual([])
    expect((await k.from('stawki_robocizny').select('id')).data).toEqual([])
    expect((await k.from('kursy_walut').select('waluta')).data).toEqual([])
  })

  it('technolog czyta słowniki, ale nie widzi ustawień poufnych (zysk, zaokrąglenie)', async () => {
    const { data } = await klienci.technolog.from('ustawienia').select('klucz')
    const klucze = (data ?? []).map((w) => w.klucz)
    expect(klucze).toContain('narzut_zakupowy_proc')
    expect(klucze).not.toContain('narzut_zysk_proc')
    expect(klucze).not.toContain('zaokraglenie_ceny')
    expect((await klienci.technolog.from('stawki_robocizny').select('id')).data?.length).toBeGreaterThan(0)
    expect((await klienci.technolog.from('gatunki').select('kod')).data?.length).toBeGreaterThan(0)
  })

  it('flaga „widzi marże” odsłania ustawienia poufne także dla handlowego', async () => {
    const { data } = await klienci.handlowyMarze.from('ustawienia').select('klucz')
    expect((data ?? []).map((w) => w.klucz)).toContain('narzut_zysk_proc')
  })

  it('technolog nie zmieni ustawień ani słowników', async () => {
    const { data } = await klienci.technolog.from('ustawienia').update({ wartosc: 99 }).eq('klucz', 'narzut_zakupowy_proc').select()
    expect(data ?? []).toEqual([])
    const { error } = await klienci.technolog.from('mpk').insert({ kod: 'X99' })
    expect(error).not.toBeNull()
    const { data: bezZmian } = await serwis.from('ustawienia').select('wartosc').eq('klucz', 'narzut_zakupowy_proc').single()
    expect(bezZmian?.wartosc).not.toBe(99)
  })

  it('technolog nie nada sobie roli i nie widzi listy użytkowników', async () => {
    const { error } = await klienci.technolog.rpc('zmien_uprawnienia', { p_user: id.technolog, p_rola: 'prezes', p_widzi_marze: true, p_nazwa: '' })
    expect(error?.message).toMatch(/Tylko administrator/)
    const { data: profilPo } = await serwis.from('profiles').select('rola').eq('id', id.technolog).single()
    expect(profilPo?.rola).toBe('technolog')
    expect((await klienci.technolog.rpc('lista_uzytkownikow')).data).toEqual([])
    // Profile innych osób są niewidoczne.
    expect((await klienci.technolog.from('profiles').select('id')).data?.map((p) => p.id)).toEqual([id.technolog])
  })

  it('funkcja zarzadzanie-uzytkownikami odmawia technologowi', async () => {
    const { error } = await klienci.technolog.functions.invoke('zarzadzanie-uzytkownikami', {
      body: { akcja: 'dodaj', email: `x-${znacznik}@wyceny.test`, rola: 'administrator' },
    })
    expect(error).not.toBeNull()
    const status = (error as { context?: Response }).context?.status
    expect(status).toBe(403)
  })

  it('administrator zakłada konto technologa przez funkcję i zmienia mu uprawnienia', async () => {
    const email = `nowy-${znacznik}@wyceny.test`
    const { data, error } = await klienci.admin.functions.invoke('zarzadzanie-uzytkownikami', {
      body: { akcja: 'dodaj', email, rola: 'technolog', nazwa: 'Dział technologów (test)' },
    })
    expect(error).toBeNull()
    expect(data.haslo_tymczasowe).toMatch(/^Wyceny-/)
    const lista = (await klienci.admin.rpc('lista_uzytkownikow')).data as { id: string; email: string; rola: string; wymaga_zmiany_hasla: boolean }[]
    const nowy = lista.find((u) => u.email === email)!
    expect(nowy.rola).toBe('technolog')
    expect(nowy.wymaga_zmiany_hasla).toBe(true)

    const { error: bladZmiany } = await klienci.admin.rpc('zmien_uprawnienia', { p_user: nowy.id, p_rola: 'technolog', p_widzi_marze: true, p_nazwa: '' })
    expect(bladZmiany).toBeNull()

    const { error: bladUsuniecia } = await klienci.admin.functions.invoke('zarzadzanie-uzytkownikami', { body: { akcja: 'usun', user_id: nowy.id } })
    expect(bladUsuniecia).toBeNull()
    await serwis.from('uprawnienia_startowe').delete().eq('email', email)
  })

  it('bazę cen zmienia dział handlowy i klucz serwisowy, technolog tylko czyta (moze_baze_cen w SECURITY DEFINER)', async () => {
    expect((await klienci.technolog.rpc('moze_baze_cen')).data).toBe(false)
    expect((await klienci.handlowyMarze.rpc('moze_baze_cen')).data).toBe(true)
    expect((await serwis.rpc('moze_baze_cen')).data).toBe(true)
    const nazwa = `TEST dostawca ${znacznik}`
    const { error } = await klienci.technolog.from('dostawcy').insert({ nazwa })
    expect(error?.message).toMatch(/row-level security/i)
    const { data, error: e2 } = await klienci.handlowyMarze.from('dostawcy').insert({ nazwa }).select('id').single()
    expect(e2).toBeNull()
    await klienci.technolog.from('dostawcy').update({ uwagi: 'zmiana technologa' }).eq('id', data!.id)
    expect((await serwis.from('dostawcy').select('uwagi').eq('id', data!.id).single()).data!.uwagi).toBeNull()
    await serwis.from('dostawcy').delete().eq('id', data!.id)
  })

  it('zmiany ustawień trafiają do audit_log z adresem autora', async () => {
    const { data: przed } = await serwis.from('ustawienia').select('wartosc').eq('klucz', 'wiek_ceny_ostrzezenie_mies').single()
    await klienci.admin.from('ustawienia').update({ wartosc: Number(przed!.wartosc) + 1 }).eq('klucz', 'wiek_ceny_ostrzezenie_mies')
    await klienci.admin.from('ustawienia').update({ wartosc: przed!.wartosc }).eq('klucz', 'wiek_ceny_ostrzezenie_mies')
    const { data: wpisy } = await serwis.from('audit_log').select('user_email, akcja, rekord_id')
      .eq('tabela', 'ustawienia').eq('rekord_id', 'wiek_ceny_ostrzezenie_mies').order('czas', { ascending: false }).limit(2)
    expect(wpisy?.every((w) => w.user_email === KONTA.admin.email && w.akcja === 'update')).toBe(true)
  })
})

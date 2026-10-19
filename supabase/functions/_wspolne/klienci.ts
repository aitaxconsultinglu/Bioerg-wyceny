// Wspólne elementy funkcji brzegowych: CORS, odpowiedzi JSON, klient serwisowy, kto wywołuje.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const NAGLOWKI_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function odpowiedz(tresc: unknown, status = 200) {
  return new Response(JSON.stringify(tresc), {
    status,
    headers: { ...NAGLOWKI_CORS, 'Content-Type': 'application/json' },
  })
}

/** Klucz serwisowy: stary JWT service_role albo nowy klucz sb_secret_ (projekty z nowymi kluczami API). */
function kluczSerwisowy() {
  const stary = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (stary) return stary
  try {
    const nowe = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    return nowe.default ?? Object.values(nowe)[0]
  } catch {
    return undefined
  }
}

export function klientSerwisowy(): SupabaseClient {
  const klucz = kluczSerwisowy()
  if (!klucz) throw new Error('Brak klucza serwisowego w środowisku funkcji.')
  return createClient(Deno.env.get('SUPABASE_URL')!, klucz, { auth: { persistSession: false } })
}

export interface Wywolujacy {
  /** null = wywołanie serwisowe (lokalny skrypt seed z kluczem service_role). */
  id: string | null
  email: string
  rola: 'technolog' | 'handlowy' | 'prezes' | 'administrator'
  widzi_marze: boolean
  serwis?: boolean
}

/** Rola z ładunku JWT. Podpis sprawdziła już bramka funkcji (verify_jwt = true). */
function rolaZJwt(token: string): string | null {
  try {
    const czesc = token.split('.')[1]
    return JSON.parse(atob(czesc.replace(/-/g, '+').replace(/_/g, '/'))).role ?? null
  } catch {
    return null
  }
}

/** Ustala zalogowanego użytkownika z nagłówka Authorization. Sam ważny token nie wystarcza - liczy się rola z profilu. */
export async function ktoWywoluje(req: Request, serwisowy: SupabaseClient, { dopuscSerwis = false } = {}): Promise<Wywolujacy | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  if (dopuscSerwis && rolaZJwt(token) === 'service_role') {
    return { id: null, email: 'seed', rola: 'administrator', widzi_marze: true, serwis: true }
  }
  const { data: { user } } = await serwisowy.auth.getUser(token)
  if (!user) return null
  const { data: profil } = await serwisowy.from('profiles').select('rola, widzi_marze').eq('id', user.id).maybeSingle()
  if (!profil) return null
  return {
    id: user.id,
    email: user.email ?? '',
    rola: profil.rola,
    widzi_marze: profil.widzi_marze || profil.rola === 'prezes' || profil.rola === 'administrator',
  }
}

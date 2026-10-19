import { createClient } from '@supabase/supabase-js'
import { komunikatPL, SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

/**
 * Wywołanie funkcji brzegowej z polskim komunikatem błędu. Przy statusie != 2xx treść
 * błędu siedzi w error.context (Response), a nie w data.
 */
export async function wywolajFunkcje<T = Record<string, unknown>>(
  nazwa: string,
  body: Record<string, unknown>,
): Promise<{ dane: T | null; blad: string | null }> {
  const { data, error } = await supabase.functions.invoke(nazwa, { body })
  const odp = data as (T & { error?: string }) | null
  if (error || odp?.error) {
    let tresc = odp?.error ?? error?.message ?? 'Operacja nie powiodła się.'
    const ctx = (error as { context?: Response } | null)?.context
    if (ctx && typeof ctx.json === 'function') {
      try { tresc = ((await ctx.json()) as { error?: string }).error ?? tresc } catch { /* zostaje ogólny */ }
    }
    return { dane: null, blad: komunikatPL(tresc) }
  }
  return { dane: odp, blad: null }
}

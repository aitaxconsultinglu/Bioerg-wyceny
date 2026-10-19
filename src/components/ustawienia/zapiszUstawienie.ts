import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'

/** Zapisuje wartości wielu kluczy tabeli `ustawienia`. Zwraca komunikat błędu albo null. */
export async function zapiszUstawienia(wartosci: Record<string, unknown>): Promise<string | null> {
  for (const [klucz, wartosc] of Object.entries(wartosci)) {
    const { error } = await supabase.from('ustawienia').update({ wartosc }).eq('klucz', klucz)
    if (error) return komunikatPL(error.message)
  }
  return null
}

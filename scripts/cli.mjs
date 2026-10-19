// Wspólne wywołanie Supabase CLI z node_modules (bez npx i bez zależności od powłoki).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const KORZEN = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(KORZEN, 'node_modules', 'supabase', 'dist', 'supabase.js')

/** Ref projektu: zmienna SUPABASE_PROJECT_REF albo projekt połączony przez `supabase link`. */
export function refProjektu() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF
  const plik = join(KORZEN, 'supabase', '.temp', 'linked-project.json')
  if (existsSync(plik)) return JSON.parse(readFileSync(plik, 'utf8')).ref
  throw new Error('Brak projektu: uruchom `npx supabase link --project-ref <ref>` albo ustaw SUPABASE_PROJECT_REF.')
}

/** Adres aplikacji: SITE_URL z .env (GitHub Pages), inaczej serwer deweloperski. */
export function adresAplikacji() {
  const plik = join(KORZEN, '.env')
  const z = existsSync(plik) ? /^SITE_URL=(.+)$/m.exec(readFileSync(plik, 'utf8'))?.[1]?.trim() : null
  return z || 'http://localhost:5190/'
}

/** Uruchamia CLI; przy `pokaz` wyjście idzie prosto do terminala. */
export function supabase(args, { pokaz = false } = {}) {
  if (!existsSync(CLI)) throw new Error('Brak Supabase CLI - uruchom `npm install`.')
  const wynik = spawnSync(process.execPath, [CLI, ...args], {
    cwd: KORZEN,
    // config.toml czyta adres aplikacji z env(SITE_URL) - bez niego CLI nie wczyta konfiguracji.
    env: { ...process.env, SITE_URL: process.env.SITE_URL || adresAplikacji() },
    encoding: 'utf8',
    stdio: pokaz ? 'inherit' : 'pipe',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (wynik.status !== 0) {
    const blad = new Error(`supabase ${args.slice(0, 3).join(' ')} zakończone kodem ${wynik.status}`)
    blad.stderr = wynik.stderr
    blad.stdout = wynik.stdout
    throw blad
  }
  return wynik.stdout ?? ''
}

/** Zapytanie SQL przez Management API (bez hasła do bazy). Zwraca wiersze. */
export function sql(zapytanie, { plik } = {}) {
  const args = ['db', 'query', '--linked', '--project-ref', refProjektu(), '-o', 'json']
  if (plik) args.push('-f', plik)
  else args.push(zapytanie)
  const wyjscie = supabase(args)
  const start = wyjscie.indexOf('{')
  if (start < 0) return []
  return JSON.parse(wyjscie.slice(start)).rows ?? []
}

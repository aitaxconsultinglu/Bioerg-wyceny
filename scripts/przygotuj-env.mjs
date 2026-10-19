// Zapisuje lokalny plik .env z adresem projektu i kluczami pobranymi przez Supabase CLI.
// Sekretów nie wyświetla - trafiają wyłącznie do pliku .env (który jest w .gitignore).
//   node scripts/przygotuj-env.mjs [ścieżka-do-materiałów]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { KORZEN, refProjektu, supabase } from './cli.mjs'

const ref = refProjektu()
const klucze = JSON.parse(supabase(['projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json']))
const publishable = klucze.find((k) => k.type === 'publishable')?.api_key
const sekretny = klucze.find((k) => k.type === 'secret')?.api_key ?? klucze.find((k) => k.name === 'service_role')?.api_key
// JWT service_role: do wywołań funkcji brzegowych z lokalnego seeda (bramka verify_jwt przyjmuje tylko JWT).
const jwtSerwisowy = klucze.find((k) => k.name === 'service_role')?.api_key ?? ''
if (!publishable || !sekretny) throw new Error('Nie udało się odczytać kluczy projektu.')

const plik = join(KORZEN, '.env')
const poprzednie = existsSync(plik) ? readFileSync(plik, 'utf8') : ''
const materialy = process.argv[2] ?? /^FOLDER_MATERIALOW=(.*)$/m.exec(poprzednie)?.[1] ?? ''
const adres = /^SITE_URL=(.*)$/m.exec(poprzednie)?.[1] ?? ''

writeFileSync(plik, [
  `SUPABASE_URL=https://${ref}.supabase.co`,
  `SUPABASE_PUBLISHABLE_KEY=${publishable}`,
  `SUPABASE_SERVICE_ROLE_KEY=${sekretny}`,
  `SUPABASE_SERVICE_ROLE_JWT=${jwtSerwisowy}`,
  `FOLDER_MATERIALOW=${materialy}`,
  `SITE_URL=${adres}`,
  '',
].join('\n'))
console.log(`Zapisano ${plik} (projekt ${ref}). Klucz serwisowy nie został wyświetlony.`)

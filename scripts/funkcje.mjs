// Wdraża funkcje brzegowe z supabase/functions (wszystkie albo wskazane z nazwy).
// Używa Management API (--use-api), więc nie potrzebuje Dockera.
//   node scripts/funkcje.mjs                 - wszystkie
//   node scripts/funkcje.mjs kursy-walut     - jedna
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { KORZEN, refProjektu, supabase } from './cli.mjs'

const katalog = join(KORZEN, 'supabase', 'functions')
const wszystkie = readdirSync(katalog).filter((n) => !n.startsWith('_') && statSync(join(katalog, n)).isDirectory())
const wybrane = process.argv.slice(2).length ? process.argv.slice(2) : wszystkie
const ref = refProjektu()

for (const nazwa of wybrane) {
  if (!wszystkie.includes(nazwa)) {
    console.error(`Nie ma funkcji ${nazwa}. Dostępne: ${wszystkie.join(', ')}`)
    process.exit(1)
  }
  console.log(`Wdrażam ${nazwa} -> ${ref}`)
  supabase(['functions', 'deploy', nazwa, '--project-ref', ref, '--use-api'], { pokaz: true })
}

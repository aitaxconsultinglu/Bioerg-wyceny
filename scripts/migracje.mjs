// Stosuje brakujące migracje z supabase/migrations na połączonym projekcie.
//
// Działa przez Management API (`supabase db query --linked`), więc nie wymaga hasła do bazy.
// Historię zapisuje w supabase_migrations.schema_migrations - w tym samym formacie co
// `supabase db push`, więc na nowym serwerze (Pro, Docker) można użyć dowolnej z dróg.
//
//   node scripts/migracje.mjs            - zastosuj brakujące
//   node scripts/migracje.mjs --sprawdz  - tylko pokaż, co zostałoby zastosowane
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KORZEN, refProjektu, sql } from './cli.mjs'

const tylkoSprawdz = process.argv.includes('--sprawdz')
const KATALOG = join(KORZEN, 'supabase', 'migrations')

const ref = refProjektu()
console.log(`Projekt: ${ref}`)

sql(`create schema if not exists supabase_migrations;
     create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`)
const zastosowane = new Set(sql('select version from supabase_migrations.schema_migrations').map((w) => w.version))

const pliki = readdirSync(KATALOG).filter((p) => /^\d+_.+\.sql$/.test(p)).sort()
const brakujace = pliki.filter((p) => !zastosowane.has(p.split('_')[0]))

if (brakujace.length === 0) console.log('Wszystkie migracje są już zastosowane.')
const tmp = mkdtempSync(join(tmpdir(), 'wyceny-migracje-'))

for (const plik of brakujace) {
  const wersja = plik.split('_')[0]
  const nazwa = plik.replace(/^\d+_/, '').replace(/\.sql$/, '')
  if (tylkoSprawdz) { console.log(`  do zastosowania: ${plik}`); continue }

  const tresc = readFileSync(join(KATALOG, plik), 'utf8')
  const znacznik = `$mig${Date.now()}$`
  // Migracja i wpis w historii w jednej transakcji: albo obie, albo żadna.
  const calosc = `begin;\n${tresc}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements)
values ('${wersja}', '${nazwa}', array[${znacznik}${tresc}${znacznik}]);\ncommit;\n`
  const sciezka = join(tmp, plik)
  writeFileSync(sciezka, calosc)
  process.stdout.write(`  ${plik} ... `)
  try {
    sql(null, { plik: sciezka })
    console.log('OK')
  } catch (e) {
    console.log('BŁĄD')
    console.error(e.stderr || e.stdout || e.message)
    process.exit(1)
  }
}

// Adres projektu dla zadań pg_cron (patrz 0002_kursy_cron.sql).
if (!tylkoSprawdz) {
  const url = process.env.SUPABASE_URL || `https://${ref}.supabase.co`
  sql(`do $$ begin
         if exists (select 1 from vault.secrets where name = 'url_projektu') then
           perform vault.update_secret((select id from vault.secrets where name = 'url_projektu'), '${url}');
         else
           perform vault.create_secret('${url}', 'url_projektu', 'Adres projektu dla zadań pg_cron');
         end if;
       end $$;`)
  console.log(`Sekret Vault url_projektu = ${url}`)
}

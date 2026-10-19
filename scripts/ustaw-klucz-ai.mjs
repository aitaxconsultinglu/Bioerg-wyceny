// Ustawia klucz Claude API jako sekret funkcji Supabase w projekcie aplikacji i sprawdza, czy działa.
//   node scripts/ustaw-klucz-ai.mjs     (uruchom we własnym terminalu)
// Klucz wpisujesz/wklejasz w ukryte pole - nie trafia do historii poleceń, do repo ani do czatu.
// Do CLI idzie przez plik tymczasowy (usuwany od razu), nie przez argumenty polecenia.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import readline from 'node:readline'
import { KORZEN, refProjektu, supabase } from './cli.mjs'

function zapytajUkryte(pytanie) {
  return new Promise((ok) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let wyciszone = false
    rl._writeToOutput = (s) => { if (wyciszone && !['\r\n', '\n', '\r'].includes(s)) rl.output.write('*'); else rl.output.write(s) }
    rl.question(pytanie, (odp) => { rl.close(); process.stdout.write('\n'); ok(odp.trim()) })
    wyciszone = true
  })
}

const ref = refProjektu()
let nazwa = ref
try {
  const p = JSON.parse(readFileSync(join(KORZEN, 'supabase', '.temp', 'linked-project.json'), 'utf8'))
  nazwa = `${p.name} (${p.ref})`
} catch { /* sam ref */ }
console.log(`Projekt Supabase: ${nazwa}`)

const klucz = process.env.ANTHROPIC_API_KEY?.trim() || await zapytajUkryte('Wklej klucz Claude API (sk-ant-...) i Enter: ')
if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(klucz)) {
  console.error('To nie wygląda na klucz Claude API (powinien zaczynać się od "sk-ant-" i nie mieć spacji). Nic nie zmieniono.')
  process.exit(1)
}

// 1. Sekret przez plik tymczasowy (--env-file), usuwany zaraz potem.
const katalog = mkdtempSync(join(tmpdir(), 'wyceny-klucz-'))
const plik = join(katalog, 'ai.env')
try {
  writeFileSync(plik, `ANTHROPIC_API_KEY=${klucz}\n`, { mode: 0o600 })
  supabase(['secrets', 'set', '--env-file', plik, '--project-ref', ref])
} catch (e) {
  console.error(`Nie udało się ustawić sekretu: ${(e.stderr || e.message || '').toString().trim().slice(0, 400)}`)
  console.error('Sprawdź logowanie: npx.cmd supabase login (konto z dostępem do organizacji projektu).')
  process.exit(1)
} finally {
  rmSync(katalog, { recursive: true, force: true })
}

// 2. Czy jest na liście sekretów projektu (same nazwy).
const lista = supabase(['secrets', 'list', '--project-ref', ref, '-o', 'json'])
if (!/"ANTHROPIC_API_KEY"/.test(lista)) {
  console.error('Sekret nie pojawił się na liście projektu - coś poszło nie tak.')
  process.exit(1)
}
console.log('OK: ANTHROPIC_API_KEY jest w sekretach projektu.')

// 3. Czy funkcja "ai" go widzi i klucz działa (liczenie tokenów - bez kosztów, bez dokumentów).
const envPlik = join(KORZEN, '.env')
if (!existsSync(envPlik)) { console.log('Brak .env - pomijam test funkcji. Status widać w aplikacji: Ustawienia → AI i budżet.'); process.exit(0) }
const env = Object.fromEntries(readFileSync(envPlik, 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const odp = await fetch(`${env.SUPABASE_URL}/functions/v1/ai`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_JWT}`, apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tryb: 'klasyfikuj_mail', szacuj: true, tekst: 'test klucza' }),
})
const tresc = await odp.json().catch(() => ({}))
if (odp.ok) console.log(`OK: funkcja AI działa z kluczem (model ${tresc.model}, test bez kosztów).`)
else {
  console.error(`Funkcja AI odpowiedziała ${odp.status}: ${tresc.error ?? ''}`)
  console.error('Jeśli to błąd 401 z Claude API - klucz jest nieprawidłowy albo wyłączony w Claude Console.')
  process.exit(1)
}

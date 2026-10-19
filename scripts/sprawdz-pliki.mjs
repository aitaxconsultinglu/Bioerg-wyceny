// Strażnik poufności publicznego repozytorium.
// Blokuje: dokumenty (*.pdf, *.xls*, *.msg, *.eml, *.docx, ...) poza public/, treści wyglądające na klucze
// (sb_secret_, service_role, sk-ant-) oraz słowa zakazane - nazwy firmy, klientów, dostawców, oznaczenia projektów.
// Lista słów zakazanych NIE jest w repo: lokalnie prywatne/zakazane.txt (jedno słowo / fraza w wierszu,
// # = komentarz), w GitHub Actions sekret ZAKAZANE_SLOWA.
//   node scripts/sprawdz-pliki.mjs             - pliki przygotowane do commita (hook pre-commit)
//   node scripts/sprawdz-pliki.mjs --wszystkie - wszystkie pliki śledzone przez git
//   node scripts/sprawdz-pliki.mjs --build     - zbudowana aplikacja (dist/) przed publikacją
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ZAKAZANE_ROZSZERZENIA = /\.(pdf|xls|xlsx|xlsm|xlsb|msg|eml|docx|doc|zip|rar|7z|dwg|csv)$/i

const WZORCE_SEKRETOW = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'klucz sekretny Supabase (sb_secret_)'],
  [/sk-ant-[A-Za-z0-9_-]{10,}/, 'klucz Anthropic API (sk-ant-)'],
  // Ładunek JWT z "role":"service_role" zakodowany base64.
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\./, 'klucz service_role (JWT)'],
]

/** Lista słów zakazanych (bez rozróżniania wielkości liter, całe słowa / frazy). */
export function wczytajZakazane(korzen) {
  const plik = join(korzen, 'prywatne', 'zakazane.txt')
  const tekst = process.env.ZAKAZANE_SLOWA ?? (existsSync(plik) ? readFileSync(plik, 'utf8') : '')
  return tekst.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}

/** Całe słowo / fraza; gwiazdka na końcu = początek słowa (np. "firma*" łapie też odmiany "firmy", "firmą"). */
function wzorzecSlowa(s) {
  const prefiks = s.endsWith('*')
  const rdzen = (prefiks ? s.slice(0, -1) : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${rdzen}${prefiks ? '' : '(?=[^\\p{L}\\p{N}]|$)'}`, 'iu')
}

/** Problemy w treści pliku: klucze i słowa zakazane. */
export function sprawdzTresc(nazwa, tresc, zakazane = []) {
  const problemy = []
  for (const [wzorzec, opis] of WZORCE_SEKRETOW) if (wzorzec.test(tresc)) problemy.push(`${nazwa}: wygląda na ${opis}`)
  for (const s of zakazane) {
    if (wzorzecSlowa(s).test(tresc)) problemy.push(`${nazwa}: słowo zakazane z listy poufności (${s.slice(0, 2)}…)`)
  }
  return problemy
}

/** Zwraca listę problemów dla podanych ścieżek (względnych wobec korzenia repo). */
export function sprawdzSciezki(sciezki, czytaj, zakazane = []) {
  const problemy = []
  for (const s of sciezki) {
    const unix = s.replace(/\\/g, '/')
    if (ZAKAZANE_ROZSZERZENIA.test(unix) && !unix.startsWith('public/')) {
      problemy.push(`${unix}: dokument poza public/ - dane firmowe nie mogą trafić do publicznego repo`)
      continue
    }
    if (unix.startsWith('prywatne/')) { problemy.push(`${unix}: folder prywatne/ nie może trafić do repo`); continue }
    if (unix === '.env.example' || unix.endsWith('sprawdz-pliki.mjs') || unix.endsWith('pliki.test.ts')) continue
    let tresc
    try { tresc = czytaj(unix) } catch { continue }
    if (tresc.includes('\u0000')) continue // plik binarny (np. ikona)
    problemy.push(...sprawdzTresc(unix, tresc, zakazane))
  }
  return problemy
}

function plikiKatalogu(katalog) {
  return readdirSync(katalog).flatMap((n) => {
    const p = join(katalog, n)
    return statSync(p).isDirectory() ? plikiKatalogu(p) : [p]
  })
}

function uruchom() {
  const korzen = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const zakazane = wczytajZakazane(korzen)
  let problemy
  if (process.argv.includes('--build')) {
    const dist = join(korzen, 'dist')
    if (!existsSync(dist)) { console.error('Brak dist/ - najpierw npm run build.'); process.exit(1) }
    problemy = plikiKatalogu(dist).filter((p) => /\.(js|mjs|html|css|json|svg|map|txt)$/i.test(p))
      .flatMap((p) => sprawdzTresc(relative(korzen, p).replace(/\\/g, '/'), readFileSync(p, 'utf8'), zakazane))
  } else {
    const wszystkie = process.argv.includes('--wszystkie')
    const args = wszystkie ? ['ls-files'] : ['diff', '--cached', '--name-only', '--diff-filter=ACMR']
    const sciezki = execFileSync('git', args, { encoding: 'utf8', cwd: korzen }).split('\n').filter(Boolean)
    const czytaj = wszystkie
      ? (s) => readFileSync(join(korzen, s), 'utf8')
      : (s) => execFileSync('git', ['show', `:${s}`], { encoding: 'utf8', cwd: korzen, maxBuffer: 64 * 1024 * 1024 })
    problemy = sprawdzSciezki(sciezki, czytaj, zakazane)
    // Komunikat commita sprawdza hook commit-msg (ten sam skrypt z --wiadomosc).
  }
  if (process.argv.includes('--wiadomosc')) {
    const plik = process.argv[process.argv.indexOf('--wiadomosc') + 1]
    problemy = sprawdzTresc('komunikat commita', readFileSync(plik, 'utf8'), zakazane)
  }
  if (!zakazane.length) console.warn('Uwaga: brak listy słów zakazanych (prywatne/zakazane.txt albo ZAKAZANE_SLOWA) - sprawdzam tylko pliki i klucze.')
  if (problemy.length) {
    console.error('Zablokowane - repozytorium i aplikacja są publiczne:\n' + problemy.map((p) => `  - ${p}`).join('\n'))
    process.exit(1)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) uruchom()

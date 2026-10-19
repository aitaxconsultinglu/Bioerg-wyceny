// Zakłada pierwsze konto administratora (albo nadaje mu nowe hasło tymczasowe z --reset).
// Uruchamia je użytkownik we własnym terminalu - hasło tymczasowe pojawia się tylko tam,
// a przy pierwszym logowaniu aplikacja wymusza ustawienie własnego.
//   node scripts/utworz-administratora.mjs [email] [--reset]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { KORZEN, adresAplikacji } from './cli.mjs'

const env = Object.fromEntries(
  readFileSync(join(KORZEN, '.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const email = (process.argv.slice(2).find((a) => a.includes('@')) ?? 'aitaxconsultinglu@gmail.com').toLowerCase()
const reset = process.argv.includes('--reset')
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function hasloTymczasowe() {
  const znaki = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const losowe = new Uint32Array(10)
  crypto.getRandomValues(losowe)
  return `Wyceny-${[...losowe].map((n) => znaki[n % znaki.length]).join('')}`
}

const { data: wpis } = await db.from('uprawnienia_startowe').select('rola').eq('email', email).maybeSingle()
if (!wpis) {
  // Bez wpisu konto nie dostałoby profilu (migracja 0003) - zakładamy go jako administratora.
  const { error } = await db.from('uprawnienia_startowe').insert({ email, nazwa: 'Administrator', rola: 'administrator', widzi_marze: true })
  if (error) throw error
}

const haslo = hasloTymczasowe()
const { data: lista } = await db.auth.admin.listUsers({ perPage: 1000 })
const istniejacy = lista?.users.find((u) => u.email?.toLowerCase() === email)

if (istniejacy && !reset) {
  console.log(`Konto ${email} już istnieje. Aby nadać nowe hasło tymczasowe: node scripts/utworz-administratora.mjs ${email} --reset`)
  process.exit(0)
}
const id = istniejacy
  ? (await db.auth.admin.updateUserById(istniejacy.id, { password: haslo })).data.user?.id
  : (await db.auth.admin.createUser({ email, password: haslo, email_confirm: true })).data.user?.id
if (!id) throw new Error('Nie udało się utworzyć ani zaktualizować konta.')
await db.from('profiles').update({ wymaga_zmiany_hasla: true }).eq('id', id)

const { data: profil } = await db.from('profiles').select('rola').eq('id', id).maybeSingle()
console.log('')
console.log(`Adres aplikacji:   ${adresAplikacji()}`)
console.log(`Login:             ${email}`)
console.log(`Hasło tymczasowe:  ${haslo}`)
console.log(`Rola:              ${profil?.rola ?? '(brak profilu!)'}`)
console.log('')
console.log('Przy pierwszym logowaniu aplikacja poprosi o ustawienie własnego hasła.')

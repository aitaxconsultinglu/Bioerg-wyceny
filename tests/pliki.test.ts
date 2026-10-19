import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sprawdzSciezki } from '../scripts/sprawdz-pliki.mjs'

const KORZEN = join(__dirname, '..')

describe('strażnik poufności repozytorium', () => {
  it('blokuje dokumenty poza public/', () => {
    const problemy = sprawdzSciezki(
      ['docs/rysunek.pdf', 'scripts/seed/karta.XLS', 'mail.msg', 'oferta.eml', 'Wycena.docx', 'public/wzor.pdf', 'src/App.tsx'],
      () => 'zwykły tekst',
    )
    expect(problemy).toHaveLength(5)
    expect(problemy.join()).not.toContain('public/wzor.pdf')
  })

  it('wykrywa klucze w treści plików', () => {
    const tresc = (s: string) => (s === 'a.ts' ? 'const k = "sb_secret_abcdefghijklmnop"' : 'const k = "sk-ant-api03-abcdefghijk"')
    expect(sprawdzSciezki(['a.ts', 'b.ts'], tresc)).toHaveLength(2)
  })

  it('w repozytorium nie ma dokumentów ani kluczy', () => {
    let sledzone: string[] = []
    try {
      sledzone = execFileSync('git', ['ls-files'], { cwd: KORZEN, encoding: 'utf8' }).split('\n').filter(Boolean)
    } catch {
      return // poza repozytorium git (np. rozpakowane archiwum) - nie ma czego sprawdzać
    }
    expect(sprawdzSciezki(sledzone, (s: string) => readFileSync(join(KORZEN, s), 'utf8'))).toEqual([])
  })
})

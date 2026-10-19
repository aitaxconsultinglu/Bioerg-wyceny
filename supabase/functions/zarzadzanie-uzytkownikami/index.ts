// Zakładanie, reset hasła i usuwanie kont. Operacje na auth.users wymagają klucza
// serwisowego, który nie może trafić do przeglądarki - dlatego siedzi wyłącznie tutaj,
// a funkcja sama sprawdza, czy wywołujący jest administratorem.
import { klientSerwisowy, ktoWywoluje, NAGLOWKI_CORS, odpowiedz } from '../_wspolne/klienci.ts'

const ROLE = ['technolog', 'handlowy', 'prezes', 'administrator']

/** Hasło tymczasowe spełniające wymagania aplikacji: min. 6 znaków, min. 1 znak specjalny. */
function hasloTymczasowe() {
  const znaki = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const losowe = new Uint32Array(8)
  crypto.getRandomValues(losowe)
  return `Wyceny-${[...losowe].map((n) => znaki[n % znaki.length]).join('')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: NAGLOWKI_CORS })

  const serwisowy = klientSerwisowy()
  const wolajacy = await ktoWywoluje(req, serwisowy)
  if (!wolajacy) return odpowiedz({ error: 'Brak autoryzacji' }, 401)
  if (wolajacy.rola !== 'administrator') {
    return odpowiedz({ error: 'Tylko administrator może zarządzać kontami.' }, 403)
  }

  const { akcja, email, nazwa, rola, widzi_marze, user_id } = await req.json()

  if (akcja === 'dodaj') {
    const adres = String(email ?? '').trim().toLowerCase()
    if (!adres.includes('@')) return odpowiedz({ error: 'Nieprawidłowy adres e-mail.' }, 400)
    const rolaDocelowa = ROLE.includes(rola) ? rola : 'technolog'

    // Wpis na liście dostępu MUSI powstać przed kontem: trigger przy zakładaniu
    // użytkownika czyta z niej rolę, nazwę i flagę marż.
    const { error: bladListy } = await serwisowy.from('uprawnienia_startowe').upsert({
      email: adres,
      nazwa: String(nazwa ?? '').trim() || null,
      rola: rolaDocelowa,
      widzi_marze: Boolean(widzi_marze),
    })
    if (bladListy) return odpowiedz({ error: bladListy.message }, 400)

    const haslo = hasloTymczasowe()
    const { data: utworzony, error } = await serwisowy.auth.admin.createUser({
      email: adres, password: haslo, email_confirm: true,
    })
    if (error) return odpowiedz({ error: error.message }, 400)

    // Hasło nadane przez administratora jest tymczasowe - własne ustawia się przy 1. logowaniu.
    await serwisowy.from('profiles').update({ wymaga_zmiany_hasla: true }).eq('id', utworzony.user.id)
    return odpowiedz({ ok: true, email: adres, haslo_tymczasowe: haslo })
  }

  if (akcja === 'resetuj') {
    if (!user_id) return odpowiedz({ error: 'Brak identyfikatora konta.' }, 400)
    const { data: konto } = await serwisowy.from('profiles').select('email').eq('id', user_id).single()
    if (!konto) return odpowiedz({ error: 'Nie znaleziono konta.' }, 404)
    const haslo = hasloTymczasowe()
    const { error } = await serwisowy.auth.admin.updateUserById(user_id, { password: haslo })
    if (error) return odpowiedz({ error: error.message }, 400)
    await serwisowy.from('profiles').update({ wymaga_zmiany_hasla: true }).eq('id', user_id)
    return odpowiedz({ ok: true, email: konto.email, haslo_tymczasowe: haslo })
  }

  if (akcja === 'usun') {
    if (!user_id) return odpowiedz({ error: 'Brak identyfikatora konta.' }, 400)
    if (user_id === wolajacy.id) return odpowiedz({ error: 'Nie możesz usunąć własnego konta.' }, 400)

    const { data: doUsuniecia } = await serwisowy.from('profiles').select('email, rola').eq('id', user_id).single()
    if (!doUsuniecia) return odpowiedz({ error: 'Nie znaleziono konta.' }, 404)

    // Bez administratora nikt nie założy kont ani nie zmieni ustawień.
    if (doUsuniecia.rola === 'administrator') {
      const { count } = await serwisowy.from('profiles').select('id', { count: 'exact', head: true }).eq('rola', 'administrator')
      if ((count ?? 0) <= 1) return odpowiedz({ error: 'To ostatnie konto administratora - nie można go usunąć.' }, 400)
    }

    const { error } = await serwisowy.auth.admin.deleteUser(user_id)
    if (error) return odpowiedz({ error: error.message }, 400)
    await serwisowy.from('uprawnienia_startowe').delete().eq('email', doUsuniecia.email)
    return odpowiedz({ ok: true })
  }

  return odpowiedz({ error: 'Nieznana akcja.' }, 400)
})

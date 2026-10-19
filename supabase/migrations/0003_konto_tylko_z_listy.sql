-- =============================================================================
-- 0003: profil (czyli jakikolwiek dostęp do danych) tylko dla kont z listy uprawnień
-- =============================================================================
-- Rejestrację wyłącza się w ustawieniach Auth projektu (enable_signup = false). Gdyby
-- była włączona, ktoś z kluczem publishable mógłby założyć konto sam. Bez wpisu
-- w uprawnienia_startowe takie konto nie dostaje profilu, więc RLS (jest_pracownikiem())
-- nie pokaże mu żadnych danych - niezależnie od konfiguracji Auth.

create or replace function public.obsluz_nowego_uzytkownika() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_seed public.uprawnienia_startowe%rowtype;
begin
  select * into v_seed from public.uprawnienia_startowe where lower(email) = lower(new.email);
  if not found then
    return new;
  end if;
  insert into public.profiles (id, email, nazwa, rola, widzi_marze, chroniony)
  values (new.id, new.email, coalesce(v_seed.nazwa, split_part(new.email, '@', 1)),
          v_seed.rola, v_seed.widzi_marze, v_seed.chroniony)
  on conflict (id) do nothing;
  return new;
end $$;

revoke execute on function public.obsluz_nowego_uzytkownika() from public, anon, authenticated;

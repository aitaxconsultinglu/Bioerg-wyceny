-- =============================================================================
-- 0005: AI (Claude API) - rejestr zużycia, budżet, konfigurowalne modele i ceny
-- =============================================================================
-- Klucz ANTHROPIC_API_KEY żyje wyłącznie w sekretach funkcji (supabase secrets set).
-- Każde wywołanie funkcji "ai" zapisuje tu tokeny i koszt; po przekroczeniu budżetu funkcja odmawia.

create table public.ai_uzycie (
  id                 bigint generated always as identity primary key,
  user_id            uuid references public.profiles(id) on delete set null,
  tryb               text not null,
  model              text,
  tokeny_wejscie     integer not null default 0,
  tokeny_wyjscie     integer not null default 0,
  tokeny_cache_odczyt integer not null default 0,
  tokeny_cache_zapis integer not null default 0,
  koszt_usd          numeric(12,6) not null default 0,
  koszt_pln          numeric(12,4) not null default 0,
  obrazow            integer not null default 0,
  zapytanie_id       uuid references public.zapytania(id) on delete set null,
  dokument_id        uuid references public.dokumenty(id) on delete set null,
  czas_ms            integer,
  status             text not null default 'ok' check (status in ('ok', 'blad', 'odmowa_budzetu', 'odmowa_modelu')),
  komunikat          text,                 -- przy błędzie; nigdy treść dokumentu
  utworzono          timestamptz not null default now()
);
create index on public.ai_uzycie (utworzono);
create index on public.ai_uzycie (user_id, utworzono);

-- Modele i ceny za 1 mln tokenów [USD] - do aktualizacji przez administratora, bez zmian w kodzie.
insert into public.ustawienia (klucz, wartosc, opis, poufne) values
  ('ai', '{
     "modele": {
       "tani": "claude-haiku-5-5",
       "standard": "claude-sonnet-5-5",
       "najlepszy": "claude-opus-5-5"
     },
     "tryby": {
       "klasyfikuj_mail": "tani",
       "normalizuj_pozycje": "tani",
       "wyciagnij_oferte": "standard",
       "wyciagnij_liste_z_rysunku": "standard",
       "analizuj_zapytanie": "standard",
       "zaproponuj_klauzule": "standard"
     },
     "ceny_usd_za_mln": {
       "claude-haiku-5-5":  {"wejscie": 0.10, "wyjscie": 0.50, "cache_odczyt": 0.01,  "cache_zapis": 0.125},
       "claude-sonnet-5-5": {"wejscie": 2.00, "wyjscie": 10.00, "cache_odczyt": 0.20, "cache_zapis": 2.50},
       "claude-opus-5-5":   {"wejscie": 4.00, "wyjscie": 20.00, "cache_odczyt": 0.20, "cache_zapis": 5.00}
     },
     "limit_miesieczny_pln": 200,
     "limit_dzienny_uzytkownika_pln": 30,
     "max_stron_na_wywolanie": 30,
     "max_obrazow_na_wywolanie": 20,
     "kurs_usd_awaryjny": 4.0
   }', 'Claude API: modele per tryb, ceny [USD / 1 mln tokenów], budżet [PLN] i limity jednego wywołania.', false);

-- Zużycie w bieżącym miesiącu i dniu - dla paska w ustawieniach i dla funkcji "ai" przed wywołaniem.
create function public.ai_zuzycie(p_user uuid default auth.uid())
returns table (miesiac_pln numeric, dzis_uzytkownik_pln numeric, wywolan_miesiac bigint,
               limit_miesieczny_pln numeric, limit_dzienny_pln numeric)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select sum(koszt_pln) from ai_uzycie where utworzono >= date_trunc('month', now())), 0),
    coalesce((select sum(koszt_pln) from ai_uzycie where user_id = p_user and utworzono >= date_trunc('day', now())), 0),
    (select count(*) from ai_uzycie where utworzono >= date_trunc('month', now()) and status = 'ok'),
    (select (wartosc ->> 'limit_miesieczny_pln')::numeric from ustawienia where klucz = 'ai'),
    (select (wartosc ->> 'limit_dzienny_uzytkownika_pln')::numeric from ustawienia where klucz = 'ai')
  where public.jest_pracownikiem() and (p_user = auth.uid() or public.jest_administratorem());
$$;

alter table public.ai_uzycie enable row level security;
-- Zapis tylko przez funkcję brzegową (klucz serwisowy) - brak polityki INSERT.
create policy ai_select on public.ai_uzycie for select to authenticated
  using (public.jest_administratorem() or user_id = auth.uid());

revoke execute on function public.ai_zuzycie(uuid) from public, anon;
grant execute on function public.ai_zuzycie(uuid) to authenticated;

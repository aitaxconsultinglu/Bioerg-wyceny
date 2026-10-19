-- Etap 4: odczyty list materiałowych, króćców i danych projektowych z rysunków PDF.
-- Wynik (poprawiany przez człowieka) i surowy wynik AI zapisujemy, żeby nie liczyć go ponownie
-- bez decyzji użytkownika. Obrazy kafli NIE są zapisywane - powstają w przeglądarce.

create table public.odczyty_rysunkow (
  id            uuid primary key default gen_random_uuid(),
  zapytanie_id  uuid not null references public.zapytania(id) on delete cascade,
  dokument_id   uuid references public.dokumenty(id) on delete set null,
  nazwa_pliku   text not null,                       -- zostaje po archiwizacji / usunięciu pliku
  strona        integer not null default 1 check (strona >= 1),
  -- [{id, rodzaj: czesci|krocce|parametry|tabliczka, x, y, w, h}] - współrzędne względne 0..1 strony po obrocie
  obszary       jsonb not null default '[]',
  wynik         jsonb not null default '{"pozycje": [], "krocce": [], "parametry": [], "uwagi": []}',
  ekstrakcja_ai jsonb,                               -- surowa odpowiedź modelu (do porównania z poprawkami)
  zrodlo        text not null default 'recznie' check (zrodlo in ('recznie', 'tekst', 'ai')),
  model         text,
  koszt_pln     numeric,
  sprawdzony    boolean not null default false,      -- człowiek przejrzał wynik
  utworzyl      uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono     timestamptz not null default now(),
  zmodyfikowano timestamptz not null default now()
);
create index on public.odczyty_rysunkow (zapytanie_id);
create index on public.odczyty_rysunkow (dokument_id);

create trigger trg_zmodyfikowano before update on public.odczyty_rysunkow
  for each row execute function public.dotknij_rekord();
create trigger trg_audyt after insert or update or delete on public.odczyty_rysunkow
  for each row execute function public.audytuj('zapytanie_id');

alter table public.odczyty_rysunkow enable row level security;
create policy or_select on public.odczyty_rysunkow for select to authenticated using (public.jest_pracownikiem());
create policy or_insert on public.odczyty_rysunkow for insert to authenticated with check (public.jest_pracownikiem());
create policy or_update on public.odczyty_rysunkow for update to authenticated
  using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());
create policy or_delete on public.odczyty_rysunkow for delete to authenticated
  using (public.jest_administratorem() or utworzyl = auth.uid());

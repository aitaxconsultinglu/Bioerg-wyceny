-- Etap 4: karta analizy zapytania (następca zakładki "Opinia o zapytaniu" z dotychczasowego arkusza wyceny).
-- Jedna karta na zapytanie, edytowalna przez technologa; wynik AI wypełnia ją, a surowa odpowiedź
-- modelu zostaje osobno (poza audytem) do porównania z poprawkami człowieka.
create table public.analizy_zapytan (
  zapytanie_id   uuid primary key references public.zapytania(id) on delete cascade,
  -- Struktura: src/lib/analiza.ts (podsumowanie, aparaty, wymagania, uslugi, pytania, niespojnosci, dokumenty, ocena).
  dane           jsonb not null default '{}',
  ekstrakcja_ai  jsonb,
  model          text,
  koszt_pln      numeric,
  przeanalizowano timestamptz,                -- kiedy ostatnio wypełniła ją analiza AI
  utworzono      timestamptz not null default now(),
  zmodyfikowano  timestamptz not null default now(),
  zmodyfikowal   uuid default auth.uid() references public.profiles(id) on delete set null
);

create function public.dotknij_analize() returns trigger
language plpgsql set search_path = public as $$
begin
  new.zmodyfikowano := clock_timestamp();
  new.zmodyfikowal := auth.uid();
  return new;
end $$;
create trigger trg_zmodyfikowano before update on public.analizy_zapytan
  for each row execute function public.dotknij_analize();
create trigger trg_audyt after insert or update or delete on public.analizy_zapytan
  for each row execute function public.audytuj('zapytanie_id');

-- Kartę czyta i poprawia każdy pracownik (analizę robi dział technologów), usuwa administrator.
alter table public.analizy_zapytan enable row level security;
create policy az_select on public.analizy_zapytan for select to authenticated using (public.jest_pracownikiem());
create policy az_insert on public.analizy_zapytan for insert to authenticated with check (public.jest_pracownikiem());
create policy az_update on public.analizy_zapytan for update to authenticated
  using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());
create policy az_delete on public.analizy_zapytan for delete to authenticated using (public.jest_administratorem());

-- Lista usług z karty analizy może być źródłem zapytań do kooperantów.
alter table public.zapytania_dostawcow add column analiza boolean not null default false;

-- =============================================================================
-- 0004: bazy cen - klienci, zapytania (rdzeń), dokumenty + Storage, dostawcy i oferty,
--       zakupy z kart dostawy Optimy, czas pracy z Registo, projekty zrealizowane
-- =============================================================================

-- --- Uprawnienia pomocnicze ------------------------------------------------------------
-- Baza ofert, importy z Optimy i Registo: dział handlowy, prezes, administrator.
create function public.moze_baze_cen() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ma_role('handlowy', 'prezes', 'administrator');
$$;

create function public.dotknij_rekord() returns trigger
language plpgsql set search_path = public as $$
begin
  new.zmodyfikowano := clock_timestamp();
  return new;
end $$;

-- Audyt bez dużych pól (tekst dokumentu, surowy wynik AI) - inaczej log dublowałby treść
-- dokumentów i szybko zjadał limit bazy planu Free.
create or replace function public.audytuj() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'tekst' - 'ekstrakcja_ai' end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'tekst' - 'ekstrakcja_ai' end;
  v_rek jsonb := coalesce(v_new, v_old);
  v_kol text := coalesce(tg_argv[0], '-');
  v_zmiany jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('z', v_old -> n.key, 'na', n.value))
      into v_zmiany
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key and n.key not in ('zmodyfikowano');
    if v_zmiany is null then return null; end if;
  else
    v_zmiany := v_rek;
  end if;

  insert into public.audit_log (tabela, rekord_id, akcja, zapytanie_id, poufne, user_id, user_email, zmiany)
  values (tg_table_name,
          coalesce(v_rek ->> 'id', v_rek ->> 'klucz', v_rek ->> 'kod'),
          lower(tg_op),
          case when v_kol <> '-' then nullif(v_rek ->> v_kol, '')::uuid end,
          coalesce(tg_argv[1], '') = 'poufne',
          auth.uid(), auth.jwt() ->> 'email', v_zmiany);
  return null;
end $$;
revoke execute on function public.audytuj() from public, anon, authenticated;

-- Kody MPK z importów (Registo) dopisywane do słownika, który zmienia tylko administrator.
create function public.dopisz_brakujace_mpk(p_kody text[]) returns void
language sql security definer set search_path = public as $$
  insert into public.mpk (kod)
  select distinct upper(k) from unnest(p_kody) k
  where public.moze_baze_cen() and upper(k) ~ '^[A-Z][0-9]{2}$'
  on conflict (kod) do nothing;
$$;

-- --- Klienci ------------------------------------------------------------------------
create table public.klienci (
  id          uuid primary key default gen_random_uuid(),
  nazwa       text not null unique,
  skrot       text,
  nip         text,
  uwagi       text,
  -- Streszczenie standardów technicznych klienta (etap 4) - liczone raz, używane wielokrotnie.
  profil_wymagan jsonb,
  utworzono   timestamptz not null default now()
);

-- --- Zapytania ofertowe (rdzeń; formularz, analiza i wyceny w etapie 3) ---------------------
create type public.status_zapytania as enum (
  'nowe', 'w_analizie', 'zapytania_do_dostawcow', 'kalkulacja', 'do_zatwierdzenia',
  'zatwierdzona', 'wyslana', 'wygrana', 'przegrana', 'rezygnacja');
create type public.zrodlo_zapytania as enum ('mail', 'platforma', 'wizja_lokalna', 'inne');

create table public.zapytania (
  id                    uuid primary key default gen_random_uuid(),
  numer                 text not null unique,           -- ZO/nnn/rrrr (nadawany automatycznie, edytowalny)
  klient_id             uuid references public.klienci(id) on delete set null,
  przedmiot             text not null default '',
  nr_zapytania_klienta  text,
  nr_zapotrzebowania    text,
  zrodlo                public.zrodlo_zapytania not null default 'mail',
  link_platformy        text,
  termin_oferty         timestamptz,
  termin_pytan          timestamptz,
  prowadzacy            uuid references public.profiles(id) on delete set null,
  status                public.status_zapytania not null default 'nowe',
  uwagi                 text,
  utworzyl              uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono             timestamptz not null default now(),
  zmodyfikowano         timestamptz not null default now()
);
create index on public.zapytania (status, termin_oferty);
create trigger trg_zmodyfikowano before update on public.zapytania
  for each row execute function public.dotknij_rekord();
create trigger trg_audyt after insert or update or delete on public.zapytania
  for each row execute function public.audytuj('id');

-- Kolejny numer ZO w danym roku: ZO/nnn/rrrr. Numery spoza wzorca (np. z Optimy) nie przeszkadzają.
create function public.nastepny_numer_zo(p_rok integer default extract(year from now())::int)
returns text language sql stable security invoker set search_path = public as $$
  select format('ZO/%s/%s', lpad((coalesce(max((regexp_match(numer, '^ZO/(\d+)/' || p_rok || '$'))[1]::int), 0) + 1)::text, 3, '0'), p_rok)
  from public.zapytania;
$$;

-- Wyciąga numer ZO z tekstu (temat maila): "ZO/123-Rury", "ZO123", "ZO/123/2026", "123/2026".
-- Zwraca numer w postaci kanonicznej tylko, gdy takie zapytanie istnieje.
create function public.znajdz_zapytanie_po_tekscie(p_tekst text)
returns uuid language plpgsql stable security invoker set search_path = public as $$
declare
  v_nr text;
  v_rok text;
  v_id uuid;
begin
  v_nr := (regexp_match(p_tekst, 'ZO\s*/?\s*(\d{2,4})', 'i'))[1];
  v_rok := (regexp_match(p_tekst, 'ZO\s*/?\s*\d{2,4}\s*/\s*(\d{4})', 'i'))[1];
  if v_nr is null then
    v_nr := (regexp_match(p_tekst, '(?<!\d)(\d{3})\s*/\s*(20\d{2})(?!\d)'))[1];
    v_rok := (regexp_match(p_tekst, '(?<!\d)\d{3}\s*/\s*(20\d{2})(?!\d)'))[1];
  end if;
  if v_nr is null then return null; end if;
  select id into v_id from public.zapytania
   where (regexp_match(numer, '^ZO/0*(\d+)/(\d{4})$'))[1] = ltrim(v_nr, '0')
     and (v_rok is null or (regexp_match(numer, '^ZO/\d+/(\d{4})$'))[1] = v_rok)
   order by utworzono desc limit 1;
  return v_id;
end $$;

-- --- Dostawcy i kooperanci -------------------------------------------------------------
create table public.dostawcy (
  id          uuid primary key default gen_random_uuid(),
  nazwa       text not null,
  skrot       text,
  nip         text,
  -- Kontakty handlowe dostawcy: [{osoba, email, telefon}] - do generatora zapytań.
  kontakty    jsonb not null default '[]',
  -- Kody kategorii materiałów i usług, w których dostawca składa oferty.
  kategorie   text[] not null default '{}',
  -- Nazwy z kart dostawy Optimy (obcięte) i z maili - do automatycznego dopasowania.
  aliasy      text[] not null default '{}',
  uwagi       text,
  aktywny     boolean not null default true,
  utworzono   timestamptz not null default now()
);
create unique index dostawcy_nazwa on public.dostawcy (lower(nazwa));
create trigger trg_audyt after insert or update or delete on public.dostawcy
  for each row execute function public.audytuj('-');

-- --- Dokumenty (Storage: prywatny bucket "dokumenty") -------------------------------------
create type public.typ_dokumentu as enum (
  'rysunek', 'karta_danych', 'specyfikacja', 'formularz_wymagan', 'standard_klienta', 'obliczenia',
  'korespondencja', 'oferta_dostawcy', 'karta_dostawy', 'raport_registo', 'inne');
-- zapisany = plik w Storage; tylko_tekst = zapisano wyekstrahowany tekst (np. treść maila);
-- pominiety_limit = za duży na plan Free; zarchiwizowany = oryginał pobrany w ZIP i usunięty.
create type public.stan_pliku as enum ('zapisany', 'tylko_tekst', 'pominiety_limit', 'zarchiwizowany');

create table public.oferty_dostawcow (
  id                 uuid primary key default gen_random_uuid(),
  dostawca_id        uuid references public.dostawcy(id) on delete restrict,
  zapytanie_id       uuid references public.zapytania(id) on delete set null,
  nr_zo              text,                 -- numer zapytania z tematu maila, gdy brak zapytania w aplikacji
  numer_oferty       text,                 -- numer oferty dostawcy
  data_oferty        date,
  waluta             text not null default 'PLN' check (waluta ~ '^[A-Z]{3}$'),
  kurs               numeric(10,4) not null default 1 check (kurs > 0),  -- PLN za 1 jednostkę waluty
  kurs_data          date,
  kurs_zrodlo        text,
  warunki_dostawy    text,                 -- EXW / CPT / DAP / DDP ...
  miejsce_dostawy    text,
  platnosc           text,
  waznosc_do         date,
  waznosc_opis       text,                 -- np. "3 dni robocze"
  termin_realizacji  text,                 -- np. "8-10 tygodni"
  termin_dni         integer,              -- górna granica terminu w dniach kalendarzowych
  doplaty            jsonb not null default '[]',  -- [{opis, kwota, za: 'oferta'|'szt'|'m'}] w walucie oferty
  wymagania          jsonb not null default '{}',  -- spełnione wymagania na poziomie oferty
  zrodlo             text not null default 'reczne' check (zrodlo in ('mail', 'pdf', 'skan', 'reczne', 'skrzynka')),
  status             text not null default 'zatwierdzona' check (status in ('do_przejrzenia', 'zatwierdzona', 'odrzucona')),
  czy_zakupiono      boolean not null default false,
  uwagi              text,
  ekstrakcja_ai      jsonb,                -- surowy wynik ekstrakcji (do porównania z poprawkami człowieka)
  utworzyl           uuid default auth.uid() references public.profiles(id) on delete set null,
  zatwierdzil        uuid references public.profiles(id) on delete set null,
  utworzono          timestamptz not null default now(),
  zmodyfikowano      timestamptz not null default now()
);
create index on public.oferty_dostawcow (zapytanie_id);
create index on public.oferty_dostawcow (dostawca_id, data_oferty);
create trigger trg_zmodyfikowano before update on public.oferty_dostawcow
  for each row execute function public.dotknij_rekord();
create trigger trg_audyt after insert or update or delete on public.oferty_dostawcow
  for each row execute function public.audytuj('zapytanie_id');

create table public.pozycje_ofert (
  id                  bigint generated always as identity primary key,
  oferta_id           uuid not null references public.oferty_dostawcow(id) on delete cascade,
  lp                  integer not null default 0,
  kategoria_materialu text references public.kategorie_materialow(kod),
  kategoria_uslugi    text references public.kategorie_uslug(kod),
  opis                text not null,          -- opis oryginalny z oferty
  gatunek             text,
  norma               text,
  -- Wymiary strukturalne [mm]: D zewn., d wewn., grubość/ścianka, szerokość, długość; DN/PN/klasa/schedule.
  d_zew numeric, d_wew numeric, grubosc numeric, szerokosc numeric, dlugosc numeric,
  dn text, pn text, klasa text, sch text,
  ilosc               numeric not null default 1,
  jm                  text not null default 'szt',
  cena_jedn           numeric not null default 0,   -- w walucie oferty, za jm
  wartosc             numeric,                      -- w walucie oferty
  masa_jedn           numeric,                      -- kg / jm
  masa_calk           numeric,                      -- kg
  masa_wyliczona      boolean not null default false,
  -- Wielkość odniesienia usług (m², mb spoiny, szt rurek...) do porównań kooperacji.
  wielkosc_odniesienia numeric,
  jednostka_odniesienia text,
  -- Ceny znormalizowane w PLN (liczone przy zapisie przez src/lib/normalizacja.ts).
  cena_pln_jedn       numeric,
  cena_pln_kg         numeric,
  cena_pln_m          numeric,
  cena_pln_szt        numeric,
  cena_pln_odniesienia numeric,
  wymagania           jsonb not null default '{}',  -- {atest_31, ped, udarnosc_temp, ut, nft, pochodzenie_ue, udt}
  termin_dni          integer,
  uwagi               text
);
create index on public.pozycje_ofert (oferta_id);
create index on public.pozycje_ofert (kategoria_materialu);
create index on public.pozycje_ofert (kategoria_uslugi);
create index on public.pozycje_ofert (upper(gatunek));
create trigger trg_audyt after insert or update or delete on public.pozycje_ofert
  for each row execute function public.audytuj('-');

-- --- Projekty zrealizowane (zlecenia Optimy, np. UJW/000034/2026) ---------------------------
create table public.projekty (
  id                uuid primary key default gen_random_uuid(),
  numer             text not null unique,
  tytul             text,
  klient_id         uuid references public.klienci(id) on delete set null,
  typ_aparatu       text,
  masa_kg           numeric,
  material_wiodacy  text,
  zapytanie_id      uuid references public.zapytania(id) on delete set null,
  uwagi             text,
  utworzono         timestamptz not null default now(),
  zmodyfikowano     timestamptz not null default now()
);
create trigger trg_zmodyfikowano before update on public.projekty
  for each row execute function public.dotknij_rekord();
create trigger trg_audyt after insert or update or delete on public.projekty
  for each row execute function public.audytuj('zapytanie_id');

create table public.dokumenty (
  id             uuid primary key default gen_random_uuid(),
  zapytanie_id   uuid references public.zapytania(id) on delete cascade,
  oferta_id      uuid references public.oferty_dostawcow(id) on delete cascade,
  projekt_id     uuid references public.projekty(id) on delete cascade,
  nadrzedny_id   uuid references public.dokumenty(id) on delete cascade,  -- załącznik maila / plik z ZIP
  nazwa_pliku    text not null,
  typ            public.typ_dokumentu not null default 'inne',
  mime           text,
  rozmiar        bigint,
  sciezka        text unique,               -- ścieżka w bucket "dokumenty" (null, gdy pliku nie zapisano)
  stan           public.stan_pliku not null default 'zapisany',
  -- Standardy po 60 stron domyślnie NIE idą w całości do AI.
  istotny        boolean not null default true,
  tekst          text,                      -- tekst wyciągnięty w przeglądarce (mail, PDF, DOCX, XLSX)
  metadane       jsonb not null default '{}',  -- np. mail: {temat, od, data, message_id}; PDF: {stron}
  utworzyl       uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono      timestamptz not null default now(),
  check (num_nonnulls(zapytanie_id, oferta_id, projekt_id, nadrzedny_id) >= 1)
);
create index on public.dokumenty (zapytanie_id);
create index on public.dokumenty (oferta_id);
create index on public.dokumenty (projekt_id);
create index on public.dokumenty (nadrzedny_id);
-- Duplikaty maili rozpoznajemy po Message-ID.
create unique index dokumenty_message_id on public.dokumenty ((metadane ->> 'message_id'))
  where metadane ->> 'message_id' is not null and nadrzedny_id is null;
create trigger trg_audyt after insert or update or delete on public.dokumenty
  for each row execute function public.audytuj('zapytanie_id');

alter table public.oferty_dostawcow add column dokument_id uuid references public.dokumenty(id) on delete set null;

-- --- Zakupy historyczne: karty dostawy Optimy ------------------------------------------------
create table public.importy_optima (
  id              uuid primary key default gen_random_uuid(),
  numer_karty     text not null,            -- = numer zlecenia / projektu
  nazwa_pliku     text,
  suma_stopka     numeric,
  suma_pozycji    numeric,
  zgodna          boolean,
  liczba_pozycji  integer,
  nowych          integer,
  zaktualizowanych integer,
  usunietych      integer,
  utworzyl        uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono       timestamptz not null default now()
);

create table public.zakupy (
  id                  bigint generated always as identity primary key,
  klucz               text not null unique,  -- karta | zamówienie | nazwa | ilość | cena | wystąpienie
  numer_karty         text not null,
  nr_zamowienia       text not null,
  typ_zamowienia      text not null,         -- ZM (materiał) / ZJ (usługa)
  dostawca_nazwa      text,                  -- z karty (bywa obcięta)
  dostawca_id         uuid references public.dostawcy(id) on delete set null,
  nazwa               text not null,
  ilosc               numeric not null,
  jm                  text,
  ilosc_zrealizowana  numeric,
  cena_jedn           numeric not null,
  wartosc             numeric not null,
  status              text,
  data_dostawy        date,
  -- material / usluga / doplata (atest, transport, kurier) / pomocnicze (narzędzia, ścierniwa)
  rodzaj              text not null check (rodzaj in ('material', 'usluga', 'doplata', 'pomocnicze')),
  kategoria           text references public.kategorie_materialow(kod),
  kategoria_uslugi    text references public.kategorie_uslug(kod),
  typ_elementu        text,
  gatunek             text,
  norma               text,
  d_zew numeric, d_wew numeric, grubosc numeric, szerokosc numeric, dlugosc numeric,
  dn text, pn text, klasa text,
  bez_szwu            boolean,
  masa_kg             numeric,               -- null = kolejka "uzupełnij masę" (porównania zł/kg pomijają)
  masa_zrodlo         text,                  -- 'jm' (pozycja w kg) / 'wymiary' / 'reczna'
  cena_kg             numeric generated always as (case when masa_kg > 0 then round(wartosc / masa_kg, 4) end) stored,
  poprawiona_recznie  boolean not null default false,
  import_id           uuid references public.importy_optima(id) on delete set null,
  zmodyfikowano       timestamptz not null default now()
);
create index on public.zakupy (numer_karty);
create index on public.zakupy (kategoria, rodzaj);
create index on public.zakupy (upper(gatunek));
create trigger trg_zmodyfikowano before update on public.zakupy
  for each row execute function public.dotknij_rekord();

-- Import (albo ponowny import rosnącej karty) jedną transakcją. Wiersze o tym samym kluczu
-- aktualizują się, a ręcznie poprawione masa/kategoria zostają. Wiersze tej karty, których
-- nie ma już w pliku, są usuwane.
create function public.importuj_karte_dostawy(p_naglowek jsonb, p_pozycje jsonb)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_import uuid;
  v_karta text := p_naglowek ->> 'numer_karty';
  v_nowe int; v_zmienione int; v_usuniete int;
  v_klucze text[];
begin
  if not public.moze_baze_cen() then
    raise exception 'Import kart dostawy: brak uprawnień (dział handlowy, prezes, administrator).';
  end if;
  if coalesce(v_karta, '') = '' then
    raise exception 'Brak numeru karty dostawy w pliku.';
  end if;

  insert into importy_optima (numer_karty, nazwa_pliku, suma_stopka, suma_pozycji, zgodna, liczba_pozycji)
  values (v_karta, p_naglowek ->> 'nazwa_pliku', nullif(p_naglowek ->> 'suma_stopka', '')::numeric,
          (p_naglowek ->> 'suma_pozycji')::numeric, (p_naglowek ->> 'zgodna')::boolean, jsonb_array_length(p_pozycje))
  returning id into v_import;

  select coalesce(array_agg(e ->> 'klucz'), '{}') into v_klucze from jsonb_array_elements(p_pozycje) e;
  delete from zakupy where numer_karty = v_karta and klucz <> all (v_klucze);
  get diagnostics v_usuniete = row_count;

  select count(*) into v_nowe from jsonb_array_elements(p_pozycje) e
   where not exists (select 1 from zakupy z where z.klucz = e ->> 'klucz');

  insert into zakupy (klucz, numer_karty, nr_zamowienia, typ_zamowienia, dostawca_nazwa, dostawca_id, nazwa, ilosc, jm,
                      ilosc_zrealizowana, cena_jedn, wartosc, status, data_dostawy, rodzaj, kategoria, kategoria_uslugi,
                      typ_elementu, gatunek, norma, d_zew, d_wew, grubosc, szerokosc, dlugosc, dn, pn, klasa, bez_szwu,
                      masa_kg, masa_zrodlo, import_id)
  select e ->> 'klucz', v_karta, e ->> 'nr_zamowienia', e ->> 'typ_zamowienia', e ->> 'dostawca_nazwa',
         (select d.id from dostawcy d where lower(d.nazwa) = lower(e ->> 'dostawca_nazwa')
                                         or lower(e ->> 'dostawca_nazwa') = any (select lower(a) from unnest(d.aliasy) a) limit 1),
         e ->> 'nazwa', (e ->> 'ilosc')::numeric, e ->> 'jm', nullif(e ->> 'ilosc_zrealizowana', '')::numeric,
         (e ->> 'cena_jedn')::numeric, (e ->> 'wartosc')::numeric, e ->> 'status', nullif(e ->> 'data_dostawy', '')::date,
         e ->> 'rodzaj', nullif(e ->> 'kategoria', ''), nullif(e ->> 'kategoria_uslugi', ''), e ->> 'typ_elementu',
         e ->> 'gatunek', e ->> 'norma',
         nullif(e ->> 'd_zew', '')::numeric, nullif(e ->> 'd_wew', '')::numeric, nullif(e ->> 'grubosc', '')::numeric,
         nullif(e ->> 'szerokosc', '')::numeric, nullif(e ->> 'dlugosc', '')::numeric,
         e ->> 'dn', e ->> 'pn', e ->> 'klasa', nullif(e ->> 'bez_szwu', '')::boolean,
         nullif(e ->> 'masa_kg', '')::numeric, e ->> 'masa_zrodlo', v_import
  from jsonb_array_elements(p_pozycje) e
  on conflict (klucz) do update set
    ilosc_zrealizowana = excluded.ilosc_zrealizowana,
    status = excluded.status,
    data_dostawy = excluded.data_dostawy,
    dostawca_nazwa = excluded.dostawca_nazwa,
    import_id = excluded.import_id,
    -- Poprawki człowieka (masa, kategoria) mają pierwszeństwo przed automatem.
    rodzaj = case when zakupy.poprawiona_recznie then zakupy.rodzaj else excluded.rodzaj end,
    kategoria = case when zakupy.poprawiona_recznie then zakupy.kategoria else excluded.kategoria end,
    kategoria_uslugi = case when zakupy.poprawiona_recznie then zakupy.kategoria_uslugi else excluded.kategoria_uslugi end,
    masa_kg = case when zakupy.poprawiona_recznie then zakupy.masa_kg else excluded.masa_kg end,
    masa_zrodlo = case when zakupy.poprawiona_recznie then zakupy.masa_zrodlo else excluded.masa_zrodlo end;

  v_zmienione := jsonb_array_length(p_pozycje) - v_nowe;
  update importy_optima set nowych = v_nowe, zaktualizowanych = v_zmienione, usunietych = v_usuniete where id = v_import;

  -- Projekt zrealizowany dla tej karty (tytuł uzupełnia import Registo albo człowiek).
  insert into projekty (numer) values (v_karta) on conflict (numer) do nothing;
  return v_import;
end $$;

-- --- Czas pracy z Registo (tylko agregaty - bez nazwisk pracowników) ----------------------------
create table public.importy_registo (
  id            uuid primary key default gen_random_uuid(),
  miesiac       date not null,               -- pierwszy dzień miesiąca
  nazwa_pliku   text,
  wierszy       integer,
  pominietych   integer,                     -- wiersze bez numeru projektu
  godzin        numeric,
  utworzyl      uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono     timestamptz not null default now()
);

create table public.registo_godziny (
  id            bigint generated always as identity primary key,
  projekt_numer text not null,
  projekt_nazwa text,
  miesiac       date not null,
  mpk           text,
  wydzial       text,
  rodzaj_umowy  text,                        -- umowa o pracę / podwykonawca / umowa cywilnoprawna
  firma         text,
  godziny       numeric not null,
  import_id     uuid references public.importy_registo(id) on delete cascade
);
create index on public.registo_godziny (projekt_numer);
create index on public.registo_godziny (miesiac);

-- Import miesiąca zastępuje poprzedni import tego samego miesiąca.
create function public.importuj_registo(p_naglowek jsonb, p_wiersze jsonb)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_import uuid;
  v_miesiac date := (p_naglowek ->> 'miesiac')::date;
begin
  if not public.moze_baze_cen() then
    raise exception 'Import Registo: brak uprawnień (dział handlowy, prezes, administrator).';
  end if;
  delete from importy_registo where miesiac = v_miesiac;   -- kaskadowo usuwa godziny
  insert into importy_registo (miesiac, nazwa_pliku, wierszy, pominietych, godzin)
  values (v_miesiac, p_naglowek ->> 'nazwa_pliku', (p_naglowek ->> 'wierszy')::int,
          (p_naglowek ->> 'pominietych')::int, (p_naglowek ->> 'godzin')::numeric)
  returning id into v_import;

  insert into registo_godziny (projekt_numer, projekt_nazwa, miesiac, mpk, wydzial, rodzaj_umowy, firma, godziny, import_id)
  select e ->> 'projekt_numer', e ->> 'projekt_nazwa', v_miesiac, e ->> 'mpk', e ->> 'wydzial',
         e ->> 'rodzaj_umowy', e ->> 'firma', (e ->> 'godziny')::numeric, v_import
  from jsonb_array_elements(p_wiersze) e;

  -- Nieznane kody MPK trafiają do słownika (opis uzupełnia administrator).
  perform public.dopisz_brakujace_mpk(array(select e ->> 'mpk' from jsonb_array_elements(p_wiersze) e));

  -- Tytuły projektów, których jeszcze nie znamy (np. karta dostawy bez nazwy).
  update projekty p set tytul = s.nazwa
  from (select distinct on (e ->> 'projekt_numer') e ->> 'projekt_numer' as numer, e ->> 'projekt_nazwa' as nazwa
        from jsonb_array_elements(p_wiersze) e where coalesce(e ->> 'projekt_nazwa', '') <> '') s
  where p.numer = s.numer and coalesce(p.tytul, '') = '';
  return v_import;
end $$;

-- --- Podsumowanie projektów: koszty z kart dostawy + godziny z Registo --------------------------
create view public.projekty_podsumowanie with (security_invoker = true) as
select p.id, p.numer, p.tytul, p.klient_id, p.typ_aparatu, p.masa_kg, p.material_wiodacy, p.zapytanie_id,
       coalesce(z.materialy, 0) as koszt_materialow,
       coalesce(z.uslugi, 0) as koszt_uslug,
       coalesce(z.doplaty, 0) as koszt_doplat,
       coalesce(z.pomocnicze, 0) as koszt_pomocniczych,
       coalesce(z.razem, 0) as koszt_zakupow,
       coalesce(z.bez_masy, 0) as pozycji_bez_masy,
       coalesce(r.godziny, 0) as godziny,
       coalesce(r.godziny_wlasne, 0) as godziny_wlasne,
       coalesce(r.godziny_podwykonawcow, 0) as godziny_podwykonawcow,
       case when p.masa_kg > 0 then round(coalesce(r.godziny, 0) / (p.masa_kg / 1000), 1) end as rbh_na_t,
       case when p.masa_kg > 0 then round(coalesce(z.razem, 0) / p.masa_kg, 2) end as zakupy_zl_na_kg
from public.projekty p
left join (
  select numer_karty,
         sum(wartosc) filter (where rodzaj = 'material') as materialy,
         sum(wartosc) filter (where rodzaj = 'usluga') as uslugi,
         sum(wartosc) filter (where rodzaj = 'doplata') as doplaty,
         sum(wartosc) filter (where rodzaj = 'pomocnicze') as pomocnicze,
         sum(wartosc) as razem,
         count(*) filter (where rodzaj = 'material' and masa_kg is null) as bez_masy
  from public.zakupy group by numer_karty
) z on z.numer_karty = p.numer
left join (
  select projekt_numer,
         sum(godziny) as godziny,
         sum(godziny) filter (where rodzaj_umowy = 'umowa o pracę') as godziny_wlasne,
         sum(godziny) filter (where rodzaj_umowy <> 'umowa o pracę') as godziny_podwykonawcow
  from public.registo_godziny group by projekt_numer
) r on r.projekt_numer = p.numer;

-- --- Storage --------------------------------------------------------------------------------
-- Prywatny bucket; pliki pobiera się wyłącznie przez krótkotrwałe signed URL-e.
-- Ścieżka: <id dokumentu>/<nazwa pliku>, więc uprawnienie wynika z wiersza w tabeli dokumenty.
insert into storage.buckets (id, name, public, file_size_limit)
values ('dokumenty', 'dokumenty', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create function public.dokument_z_sciezki(p_nazwa text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p_nazwa, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create policy dok_odczyt on storage.objects for select to authenticated
  using (bucket_id = 'dokumenty' and public.jest_pracownikiem());
create policy dok_dodanie on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumenty' and public.jest_pracownikiem()
              and exists (select 1 from public.dokumenty d where d.id = public.dokument_z_sciezki(name)));
create policy dok_usuniecie on storage.objects for delete to authenticated
  using (bucket_id = 'dokumenty' and (public.jest_administratorem()
         or exists (select 1 from public.dokumenty d where d.id = public.dokument_z_sciezki(name) and d.utworzyl = auth.uid())));

-- --- RLS ------------------------------------------------------------------------------------
alter table public.klienci          enable row level security;
alter table public.zapytania        enable row level security;
alter table public.dostawcy         enable row level security;
alter table public.oferty_dostawcow enable row level security;
alter table public.pozycje_ofert    enable row level security;
alter table public.projekty         enable row level security;
alter table public.dokumenty        enable row level security;
alter table public.importy_optima   enable row level security;
alter table public.zakupy           enable row level security;
alter table public.importy_registo  enable row level security;
alter table public.registo_godziny  enable row level security;

-- Klienci, zapytania, projekty, dokumenty: wspólna praca wszystkich działów.
create policy kl_select on public.klienci for select to authenticated using (public.jest_pracownikiem());
create policy kl_write on public.klienci for all to authenticated
  using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());

create policy zap_select on public.zapytania for select to authenticated using (public.jest_pracownikiem());
create policy zap_insert on public.zapytania for insert to authenticated with check (public.jest_pracownikiem());
create policy zap_update on public.zapytania for update to authenticated
  using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());
create policy zap_delete on public.zapytania for delete to authenticated using (public.jest_administratorem());

create policy prj_select on public.projekty for select to authenticated using (public.jest_pracownikiem());
create policy prj_write on public.projekty for all to authenticated
  using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());

create policy dk_select on public.dokumenty for select to authenticated using (public.jest_pracownikiem());
create policy dk_insert on public.dokumenty for insert to authenticated with check (public.jest_pracownikiem());
create policy dk_update on public.dokumenty for update to authenticated
  using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());
create policy dk_delete on public.dokumenty for delete to authenticated
  using (public.jest_administratorem() or utworzyl = auth.uid());

-- Baza cen: czytają wszyscy (podpowiedzi cen w wycenie), zmienia dział handlowy / prezes / administrator.
create policy dos_select on public.dostawcy for select to authenticated using (public.jest_pracownikiem());
create policy dos_write on public.dostawcy for all to authenticated
  using (public.moze_baze_cen()) with check (public.moze_baze_cen());

create policy of_select on public.oferty_dostawcow for select to authenticated using (public.jest_pracownikiem());
create policy of_write on public.oferty_dostawcow for all to authenticated
  using (public.moze_baze_cen()) with check (public.moze_baze_cen());

create policy po_select on public.pozycje_ofert for select to authenticated using (public.jest_pracownikiem());
create policy po_write on public.pozycje_ofert for all to authenticated
  using (public.moze_baze_cen()) with check (public.moze_baze_cen());

create policy io_select on public.importy_optima for select to authenticated using (public.jest_pracownikiem());
create policy io_write on public.importy_optima for all to authenticated
  using (public.moze_baze_cen()) with check (public.moze_baze_cen());

-- Zakupy: masę i kategorię może poprawić każdy dział (kolejka "uzupełnij masę"); import - baza cen.
create policy zak_select on public.zakupy for select to authenticated using (public.jest_pracownikiem());
create policy zak_insert on public.zakupy for insert to authenticated with check (public.moze_baze_cen());
create policy zak_update on public.zakupy for update to authenticated
  using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());
create policy zak_delete on public.zakupy for delete to authenticated using (public.moze_baze_cen());

create policy ir_select on public.importy_registo for select to authenticated using (public.jest_pracownikiem());
create policy ir_write on public.importy_registo for all to authenticated
  using (public.moze_baze_cen()) with check (public.moze_baze_cen());
create policy rg_select on public.registo_godziny for select to authenticated using (public.jest_pracownikiem());
create policy rg_write on public.registo_godziny for all to authenticated
  using (public.moze_baze_cen()) with check (public.moze_baze_cen());

-- --- Uprawnienia do funkcji ---------------------------------------------------------------------
revoke execute on function public.dotknij_rekord(), public.dokument_z_sciezki(text) from public, anon, authenticated;
grant execute on function public.dokument_z_sciezki(text) to authenticated;
revoke execute on function public.moze_baze_cen(), public.nastepny_numer_zo(integer), public.znajdz_zapytanie_po_tekscie(text),
  public.importuj_karte_dostawy(jsonb, jsonb), public.importuj_registo(jsonb, jsonb), public.dopisz_brakujace_mpk(text[]) from public, anon;
grant execute on function public.moze_baze_cen(), public.nastepny_numer_zo(integer), public.znajdz_zapytanie_po_tekscie(text),
  public.importuj_karte_dostawy(jsonb, jsonb), public.importuj_registo(jsonb, jsonb), public.dopisz_brakujace_mpk(text[]) to authenticated;

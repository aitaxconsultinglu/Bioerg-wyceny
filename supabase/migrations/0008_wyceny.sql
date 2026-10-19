-- =============================================================================
-- 0008: wyceny (wersje, aparaty, pozycje), marże (poufne), zatwierdzanie przez prezesa,
--       zamrożenie zatwierdzonej wersji, biblioteka klauzul ofertowych
-- =============================================================================
-- Obliczenia (koszty, cena) liczy jeden moduł src/lib/kalkulacja.ts. Baza pilnuje reguł:
-- kto co może zmienić, zamrożenie, kopiowanie cen ze źródłem (bez referencji).

-- Numer ZO nadawany automatycznie, gdy nie podano.
create function public.nadaj_numer_zo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.numer), '') = '' then
    new.numer := public.nastepny_numer_zo(extract(year from coalesce(new.utworzono, now()))::int);
  end if;
  return new;
end $$;
create trigger trg_numer_zo before insert on public.zapytania
  for each row execute function public.nadaj_numer_zo();

create type public.status_wyceny as enum ('robocza', 'do_zatwierdzenia', 'zwrocona', 'zatwierdzona');

create table public.wyceny (
  id                     uuid primary key default gen_random_uuid(),
  zapytanie_id           uuid not null references public.zapytania(id) on delete cascade,
  wersja                 integer not null,
  nazwa                  text,
  status                 public.status_wyceny not null default 'robocza',
  narzut_zakupowy_proc   numeric not null default 5,
  narzut_kooperacja_proc numeric not null default 0,
  kurs_eur               numeric,
  kurs_eur_data          date,
  kurs_eur_zrodlo        text,
  termin_realizacji_tyg  numeric,          -- deklarowany termin dla klienta (ostrzeżenia o terminach dostaw)
  montaz_tyg             numeric,          -- część terminu na montaż/odbiory
  uwagi                  text,
  komentarz_prezesa      text,
  oferta                 jsonb not null default '{}',   -- edytor oferty: klauzule, zmienne, warunki (etap 3)
  podsumowanie           jsonb,            -- migawka kosztów w chwili złożenia / zatwierdzenia (bez marż)
  skopiowana_z           uuid references public.wyceny(id) on delete set null,
  utworzyl               uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono              timestamptz not null default now(),
  zmodyfikowano          timestamptz not null default now(),
  zlozono                timestamptz,
  zatwierdzil            uuid references public.profiles(id) on delete set null,
  zatwierdzono           timestamptz,
  unique (zapytanie_id, wersja)
);
create index on public.wyceny (status);

-- Marże i korekta prezesa - osobna tabela, bo RLS działa na wiersze, a nie kolumny.
create table public.wyceny_marze (
  wycena_id              uuid primary key references public.wyceny(id) on delete cascade,
  narzut_zysk_proc       numeric not null default 10,
  zaokraglenie           numeric not null default 100,
  korekta_prezesa_kwota  numeric not null default 0,
  korekta_prezesa_proc   numeric not null default 0,
  -- migawka w chwili zatwierdzenia
  koszt_calkowity        numeric,
  cena                   numeric,
  cena_koncowa           numeric,
  cena_bez_opcji         numeric,
  zmodyfikowano          timestamptz not null default now()
);

create table public.aparaty (
  id                  uuid primary key default gen_random_uuid(),
  wycena_id           uuid not null references public.wyceny(id) on delete cascade,
  lp                  integer not null default 1,
  nazwa               text not null default '',
  typ                 text,               -- zbiornik pionowy / poziomy / wymiennik płaszczowo-rurowy / wkład rurowy / reaktor / separator / kolumna / inne
  tema                text,               -- typ TEMA wymiennika (AES, BEM, U...)
  ilosc               numeric not null default 1 check (ilosc > 0),
  masa_netto_kg       numeric,
  srednica_mm         numeric,
  wysokosc_mm         numeric,
  dlugosc_mm          numeric,
  szerokosc_mm        numeric,
  material_wiodacy    text,
  metoda_robocizny    text not null default 'wskaznikowa' check (metoda_robocizny in ('szczegolowa', 'wskaznikowa')),
  wskaznik_rbh_t      numeric,
  stawka_wskaznikowa  numeric,
  liczba_osob         numeric not null default 8,
  naddatki            jsonb not null default '{}',   -- {kod_kategorii: procent} - nadpisanie domyślnych
  uwagi               text
);
create index on public.aparaty (wycena_id);

create table public.pozycje_wyceny (
  id               bigint generated always as identity primary key,
  aparat_id        uuid not null references public.aparaty(id) on delete cascade,
  zakladka         text not null check (zakladka in ('materialy', 'robocizna', 'kooperacja', 'projekt', 'badania', 'transport', 'inne')),
  sekcja           text,                -- kod kategorii materiału / usługi
  lp               integer not null default 0,
  nazwa            text not null default '',   -- przeznaczenie / nazwa elementu / rodzaj pracy
  rodzaj           text,                       -- rodzaj materiału
  gatunek          text,
  d_zew numeric, d_wew numeric, grubosc numeric, szerokosc numeric, dlugosc numeric,
  dn text, pn text, klasa text, sch text,
  ilosc            numeric not null default 0,
  jm               text not null default 'szt',
  masa_jedn        numeric,
  masa_reczna      boolean not null default false,   -- true = masa wpisana, false = z wymiarów (gdy się da)
  cena_jedn        numeric not null default 0,
  -- jak liczyć koszt: kg = masa × cena; m = metry × cena; jm = ilość × cena
  jednostka_ceny   text not null default 'jm' check (jednostka_ceny in ('kg', 'm', 'jm')),
  wartosc_reczna   numeric,                 -- wpisana wartość zamiast ilość × cena
  cena_za_komplet  boolean not null default false,  -- "kpl" bez masy - jawnie
  mpk              text,
  stawka_id        bigint references public.stawki_robocizny(id) on delete set null,
  dodatkowe        jsonb not null default '{}',     -- np. transport: {km, trasa, ponadgabaryt}
  -- Źródło ceny: KOPIA w chwili wyboru (zmiana oferty w bazie nie zmienia wyceny).
  zrodlo_ceny      text not null default 'recznie' check (zrodlo_ceny in ('oferta', 'zakup', 'recznie')),
  zrodlo_opis      text,
  zrodlo_dostawca  text,
  zrodlo_data      date,
  zrodlo_waznosc_do date,
  zrodlo_termin_dni integer,
  zrodlo_id        text,
  opcjonalna       boolean not null default false,  -- pozycja wariantu (np. izolacja, montaż)
  wariant          text,
  uwagi            text,
  pewnosc          numeric                          -- z importu listy (AI) - niepewne do sprawdzenia
);
create index on public.pozycje_wyceny (aparat_id, zakladka);

create table public.klauzule (
  id         bigint generated always as identity primary key,
  kategoria  text not null check (kategoria in ('obejmuje', 'nie_obejmuje', 'uwagi')),
  tekst      text not null,
  tagi       text[] not null default '{}',
  kolejnosc  integer not null default 0,
  aktywna    boolean not null default true
);

-- Klauzule ze wzorcowych ofert; {zmienne} uzupełnia edytor oferty.
insert into public.klauzule (kategoria, tekst, tagi, kolejnosc) values
  ('obejmuje', 'Sporządzenie dokumentacji koncesyjno-warsztatowej', '{projekt,udt}', 10),
  ('obejmuje', 'Sporządzenie dokumentacji warsztatowej', '{projekt}', 11),
  ('obejmuje', 'Sporządzenie projektu modernizacji', '{projekt}', 12),
  ('obejmuje', 'Wykonanie projektu warsztatowego', '{projekt}', 13),
  ('obejmuje', 'Zakup materiału z atestem 3.1, producent UE', '{material}', 20),
  ('obejmuje', 'Zakup materiału z atestem 3.1', '{material}', 21),
  ('obejmuje', 'Zakup materiału hutniczego w gatunku {gatunki} z atestem 3.1', '{material}', 22),
  ('obejmuje', 'Zakup materiału z atestem 3.1 z gwarantowaną udarnością w temp. {temp_udarnosci} °C', '{material,udarnosc}', 23),
  ('obejmuje', 'Wykonanie {przedmiot} o łącznej wadze {masa_kg} kg wg {podstawa_wykonania}', '{wykonanie}', 30),
  ('obejmuje', 'Montaż dostarczonych przez zamawiającego {elementy_powierzone}', '{montaz}', 31),
  ('obejmuje', 'Badania NDT spoin: {zakres_NDT}', '{ndt}', 40),
  ('obejmuje', 'Badania NDT spoin', '{ndt}', 41),
  ('obejmuje', 'Uzgodnienie dokumentacji i odbiory UDT', '{udt}', 42),
  ('obejmuje', 'Wykonanie próby ciśnieniowej', '{proba}', 43),
  ('obejmuje', 'Wykonanie hydrostatycznej próby szczelności', '{proba}', 44),
  ('obejmuje', 'Sekafenowanie wkładu i głowicy', '{antykorozja}', 50),
  ('obejmuje', 'Zabezpieczenie antykorozyjne zewnętrzne', '{antykorozja}', 51),
  ('obejmuje', 'Zabezpieczenie antykorozyjne powierzchni wewnętrznej i zewnętrznej', '{antykorozja}', 52),
  ('obejmuje', 'Wykonanie izolacji', '{izolacja}', 53),
  ('obejmuje', 'Dokumentację powykonawczą i jakościową', '{dokumentacja}', 60),
  ('obejmuje', 'Dokumentację jakościową', '{dokumentacja}', 61),
  ('obejmuje', 'Dokumentację KJ', '{dokumentacja}', 62),
  ('obejmuje', 'Pakowanie i transport', '{transport}', 70),
  ('obejmuje', 'Transport do {miejsce_dostawy}', '{transport}', 71),
  ('obejmuje', 'Demontaż istniejącego {przedmiot_stary} i montaż nowego w miejscu docelowym', '{montaz}', 80),
  ('obejmuje', 'Sprzęt niezbędny do wykonania prac', '{montaz}', 81),
  ('nie_obejmuje', 'Rozładunku i montażu na instalacji', '{montaz}', 10),
  ('nie_obejmuje', 'Rozładunku i montażu', '{montaz}', 11),
  ('nie_obejmuje', 'Montażu aparatów na instalacji', '{montaz}', 12),
  ('nie_obejmuje', 'Sporządzenia dokumentacji koncesyjno-warsztatowej', '{projekt}', 20),
  ('nie_obejmuje', 'Zakupu {elementy_powierzone}', '{material}', 30),
  ('nie_obejmuje', 'Wykonania izolacji', '{izolacja}', 40),
  ('uwagi', 'Zbiornik nie podlega wykonaniu pod dyrektywę ciśnieniową 2014/68/UE, więc dokumentacja nie podlega zatwierdzeniu przez Jednostkę Notyfikowaną', '{ped}', 10),
  ('uwagi', 'Zbiornik nie podlega ocenie zgodności, więc nie będzie posiadał oznakowania CE', '{ped,ce}', 11),
  ('uwagi', 'W ofercie uwzględniono zakres wykonania zgodny z zapytaniem ofertowym.', '{}', 20),
  ('uwagi', 'Termin realizacji liczony od daty otrzymania zamówienia i kompletnej dokumentacji.', '{termin}', 30);

-- --- Uprawnienia do wyceny ---------------------------------------------------------------------
-- Funkcje systemowe (zatwierdzanie, kopiowanie) ustawiają flagę transakcji - strażniki ją przepuszczają.
create function public.tryb_systemowy() returns boolean
language sql stable as $$ select coalesce(current_setting('wyceny.system', true), '') = 'tak' $$;

create function public.status_wyceny_aparatu(p_aparat uuid) returns public.status_wyceny
language sql stable security definer set search_path = public as $$
  select w.status from public.aparaty a join public.wyceny w on w.id = a.wycena_id where a.id = p_aparat;
$$;

-- Edycja treści wyceny: robocza/zwrócona - wszyscy pracownicy; do zatwierdzenia - tylko prezes;
-- zatwierdzona - nikt (zmiana wymaga skopiowania wersji).
create function public.moze_edytowac_wycene(p_wycena uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.wyceny w where w.id = p_wycena and public.jest_pracownikiem()
      and (w.status in ('robocza', 'zwrocona') or (w.status = 'do_zatwierdzenia' and public.ma_role('prezes')))
  );
$$;

create function public.pilnuj_wyceny() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.zmodyfikowano := clock_timestamp();
  if auth.uid() is null or public.tryb_systemowy() then return new; end if;   -- seed / SQL / funkcje systemowe
  if new.status is distinct from old.status then
    raise exception 'Status wyceny zmienia się wyłącznie funkcją zmien_status_wyceny.';
  end if;
  if old.status = 'zatwierdzona' then
    -- Po zatwierdzeniu można już tylko redagować ofertę dla klienta (cena się nie zmienia).
    if (to_jsonb(new) - 'oferta' - 'zmodyfikowano') is distinct from (to_jsonb(old) - 'oferta' - 'zmodyfikowano') then
      raise exception 'Zatwierdzona wersja wyceny jest zamrożona. Skopiuj ją jako nową wersję, aby wprowadzić zmiany.';
    end if;
  elsif not public.moze_edytowac_wycene(old.id)
        and (to_jsonb(new) - 'oferta' - 'zmodyfikowano') is distinct from (to_jsonb(old) - 'oferta' - 'zmodyfikowano') then
    raise exception 'Wycena czeka na zatwierdzenie - zmieniać ją może tylko prezes (albo zwróć ją do poprawy).';
  end if;
  return new;
end $$;
create trigger trg_pilnuj_wyceny before update on public.wyceny
  for each row execute function public.pilnuj_wyceny();

-- Dział handlowy w wycenie edytuje ceny (materiały) i kooperację - reszta należy do technologów.
create function public.pilnuj_pozycji_wyceny() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rek public.pozycje_wyceny := coalesce(new, old);
  v_dozwolone jsonb;
begin
  if auth.uid() is null or public.tryb_systemowy() or not public.ma_role('handlowy') then
    return coalesce(new, old);
  end if;
  if v_rek.zakladka = 'kooperacja' then
    return coalesce(new, old);
  end if;
  if tg_op <> 'UPDATE' or v_rek.zakladka <> 'materialy' then
    raise exception 'Dział handlowy może w wycenie zmieniać ceny materiałów i kooperację.';
  end if;
  v_dozwolone := '["cena_jedn","jednostka_ceny","wartosc_reczna","zrodlo_ceny","zrodlo_opis","zrodlo_dostawca","zrodlo_data","zrodlo_waznosc_do","zrodlo_termin_dni","zrodlo_id","uwagi"]';
  if exists (
    select 1 from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from to_jsonb(old) -> n.key and not v_dozwolone ? n.key
  ) then
    raise exception 'Dział handlowy może w pozycjach materiałowych zmieniać tylko cenę i jej źródło.';
  end if;
  return new;
end $$;
create trigger trg_pilnuj_pozycji before insert or update or delete on public.pozycje_wyceny
  for each row execute function public.pilnuj_pozycji_wyceny();

-- Marże: korektę prezesa zmienia tylko prezes; nic po zatwierdzeniu.
create function public.pilnuj_marz() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status public.status_wyceny;
begin
  new.zmodyfikowano := clock_timestamp();
  if auth.uid() is null or public.tryb_systemowy() then return new; end if;
  select status into v_status from public.wyceny where id = new.wycena_id;
  if v_status = 'zatwierdzona' then
    raise exception 'Zatwierdzona wersja wyceny jest zamrożona.';
  end if;
  if (new.korekta_prezesa_kwota is distinct from old.korekta_prezesa_kwota or new.korekta_prezesa_proc is distinct from old.korekta_prezesa_proc)
     and not public.ma_role('prezes') then
    raise exception 'Korektę prezesa może zmienić tylko prezes.';
  end if;
  if (new.koszt_calkowity, new.cena, new.cena_koncowa, new.cena_bez_opcji) is distinct from
     (old.koszt_calkowity, old.cena, old.cena_koncowa, old.cena_bez_opcji) then
    raise exception 'Migawkę ceny zapisuje zatwierdzenie wyceny.';
  end if;
  if v_status = 'do_zatwierdzenia' and not public.ma_role('prezes') then
    raise exception 'Wycena czeka na zatwierdzenie - narzut zmienia prezes.';
  end if;
  return new;
end $$;
create trigger trg_pilnuj_marz before update on public.wyceny_marze
  for each row execute function public.pilnuj_marz();

-- Domyślne marże przy tworzeniu wyceny (z ustawień - także dla użytkownika, który ich nie widzi).
create function public.utworz_marze() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.wyceny_marze (wycena_id, narzut_zysk_proc, zaokraglenie)
  values (new.id,
          coalesce((select (wartosc #>> '{}')::numeric from public.ustawienia where klucz = 'narzut_zysk_proc'), 10),
          coalesce((select (wartosc #>> '{}')::numeric from public.ustawienia where klucz = 'zaokraglenie_ceny'), 100))
  on conflict (wycena_id) do nothing;
  return null;
end $$;
create trigger trg_utworz_marze after insert on public.wyceny
  for each row execute function public.utworz_marze();

-- Nowa wycena dla zapytania: kolejna wersja, narzuty domyślne z ustawień.
create function public.nowa_wycena(p_zapytanie uuid, p_nazwa text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.wyceny (zapytanie_id, wersja, nazwa, narzut_zakupowy_proc, narzut_kooperacja_proc)
  values (p_zapytanie,
          coalesce((select max(wersja) from public.wyceny where zapytanie_id = p_zapytanie), 0) + 1,
          p_nazwa,
          coalesce((select (wartosc #>> '{}')::numeric from public.ustawienia where klucz = 'narzut_zakupowy_proc'), 5),
          coalesce((select (wartosc #>> '{}')::numeric from public.ustawienia where klucz = 'narzut_kooperacja_proc'), 0))
  returning id into v_id;
  insert into public.aparaty (wycena_id, lp, nazwa) values (v_id, 1, 'Aparat 1');
  return v_id;
end $$;

-- Kopia wersji (np. zmiana po zatwierdzeniu): nowa wersja robocza z tymi samymi danymi.
create function public.kopiuj_wycene(p_wycena uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_stara public.wyceny%rowtype;
  v_nowa uuid;
  v_ap record;
  v_nowy_ap uuid;
begin
  if not public.jest_pracownikiem() and auth.uid() is not null then
    raise exception 'Brak uprawnień.';
  end if;
  perform set_config('wyceny.system', 'tak', true);
  select * into v_stara from public.wyceny where id = p_wycena;
  if not found then raise exception 'Nie znaleziono wyceny.'; end if;

  insert into public.wyceny (zapytanie_id, wersja, nazwa, narzut_zakupowy_proc, narzut_kooperacja_proc, kurs_eur, kurs_eur_data,
                             kurs_eur_zrodlo, termin_realizacji_tyg, montaz_tyg, uwagi, oferta, skopiowana_z)
  select zapytanie_id, (select max(wersja) + 1 from public.wyceny where zapytanie_id = v_stara.zapytanie_id), nazwa,
         narzut_zakupowy_proc, narzut_kooperacja_proc, kurs_eur, kurs_eur_data, kurs_eur_zrodlo, termin_realizacji_tyg, montaz_tyg,
         uwagi, oferta, id
  from public.wyceny where id = p_wycena
  returning id into v_nowa;

  update public.wyceny_marze n set narzut_zysk_proc = s.narzut_zysk_proc, zaokraglenie = s.zaokraglenie,
         korekta_prezesa_kwota = s.korekta_prezesa_kwota, korekta_prezesa_proc = s.korekta_prezesa_proc
  from public.wyceny_marze s where s.wycena_id = p_wycena and n.wycena_id = v_nowa;

  for v_ap in select * from public.aparaty where wycena_id = p_wycena order by lp loop
    insert into public.aparaty (wycena_id, lp, nazwa, typ, tema, ilosc, masa_netto_kg, srednica_mm, wysokosc_mm, dlugosc_mm, szerokosc_mm,
                                material_wiodacy, metoda_robocizny, wskaznik_rbh_t, stawka_wskaznikowa, liczba_osob, naddatki, uwagi)
    values (v_nowa, v_ap.lp, v_ap.nazwa, v_ap.typ, v_ap.tema, v_ap.ilosc, v_ap.masa_netto_kg, v_ap.srednica_mm, v_ap.wysokosc_mm,
            v_ap.dlugosc_mm, v_ap.szerokosc_mm, v_ap.material_wiodacy, v_ap.metoda_robocizny, v_ap.wskaznik_rbh_t,
            v_ap.stawka_wskaznikowa, v_ap.liczba_osob, v_ap.naddatki, v_ap.uwagi)
    returning id into v_nowy_ap;
    insert into public.pozycje_wyceny (aparat_id, zakladka, sekcja, lp, nazwa, rodzaj, gatunek, d_zew, d_wew, grubosc, szerokosc, dlugosc,
                                       dn, pn, klasa, sch, ilosc, jm, masa_jedn, masa_reczna, cena_jedn, jednostka_ceny, wartosc_reczna,
                                       cena_za_komplet, mpk, stawka_id, dodatkowe, zrodlo_ceny, zrodlo_opis, zrodlo_dostawca, zrodlo_data,
                                       zrodlo_waznosc_do, zrodlo_termin_dni, zrodlo_id, opcjonalna, wariant, uwagi, pewnosc)
    select v_nowy_ap, zakladka, sekcja, lp, nazwa, rodzaj, gatunek, d_zew, d_wew, grubosc, szerokosc, dlugosc, dn, pn, klasa, sch, ilosc, jm,
           masa_jedn, masa_reczna, cena_jedn, jednostka_ceny, wartosc_reczna, cena_za_komplet, mpk, stawka_id, dodatkowe, zrodlo_ceny,
           zrodlo_opis, zrodlo_dostawca, zrodlo_data, zrodlo_waznosc_do, zrodlo_termin_dni, zrodlo_id, opcjonalna, wariant, uwagi, pewnosc
    from public.pozycje_wyceny where aparat_id = v_ap.id;
  end loop;
  return v_nowa;
end $$;

-- Przejścia statusu. Podsumowanie (koszty bez marż) i migawka cen liczy kalkulacja.ts w przeglądarce
-- i przekazuje tutaj; baza pilnuje, KTO może wykonać przejście.
create function public.zmien_status_wyceny(p_wycena uuid, p_status public.status_wyceny, p_komentarz text default null,
                                           p_podsumowanie jsonb default null, p_ceny jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_w public.wyceny%rowtype;
  v_bledy text;
begin
  select * into v_w from public.wyceny where id = p_wycena for update;
  if not found then raise exception 'Nie znaleziono wyceny.'; end if;
  if not public.jest_pracownikiem() then raise exception 'Brak uprawnień.'; end if;
  perform set_config('wyceny.system', 'tak', true);

  if p_status = 'do_zatwierdzenia' then
    if v_w.status not in ('robocza', 'zwrocona') then
      raise exception 'Do zatwierdzenia można przekazać tylko wycenę roboczą albo zwróconą.';
    end if;
    -- Pozycje "kpl" bez masy: trzeba podać masę albo jawnie oznaczyć "cena za komplet".
    select string_agg(format('%s (%s)', coalesce(nullif(p.nazwa, ''), p.rodzaj, '?'), a.nazwa), ', ') into v_bledy
    from public.pozycje_wyceny p join public.aparaty a on a.id = p.aparat_id
    where a.wycena_id = p_wycena and p.zakladka = 'materialy' and lower(p.jm) = 'kpl'
      and coalesce(p.masa_jedn, 0) = 0 and not p.cena_za_komplet;
    if v_bledy is not null then
      raise exception 'Pozycje w kompletach bez masy - podaj masę albo zaznacz "cena za komplet": %', v_bledy;
    end if;
    update public.wyceny set status = 'do_zatwierdzenia', zlozono = now(), podsumowanie = coalesce(p_podsumowanie, podsumowanie),
                             komentarz_prezesa = null
     where id = p_wycena;
    update public.zapytania set status = 'do_zatwierdzenia' where id = v_w.zapytanie_id and status in ('nowe', 'w_analizie', 'zapytania_do_dostawcow', 'kalkulacja');

  elsif p_status = 'zatwierdzona' then
    if not public.ma_role('prezes') then raise exception 'Zatwierdzić wycenę może tylko prezes.'; end if;
    if v_w.status <> 'do_zatwierdzenia' then raise exception 'Zatwierdzić można tylko wycenę przekazaną do zatwierdzenia.'; end if;
    if p_ceny is null then raise exception 'Brak migawki ceny do zatwierdzenia.'; end if;
    update public.wyceny set status = 'zatwierdzona', zatwierdzil = auth.uid(), zatwierdzono = now(),
                             podsumowanie = coalesce(p_podsumowanie, podsumowanie), komentarz_prezesa = coalesce(p_komentarz, komentarz_prezesa)
     where id = p_wycena;
    update public.wyceny_marze set koszt_calkowity = (p_ceny ->> 'koszt_calkowity')::numeric, cena = (p_ceny ->> 'cena')::numeric,
                                   cena_koncowa = (p_ceny ->> 'cena_koncowa')::numeric, cena_bez_opcji = nullif(p_ceny ->> 'cena_bez_opcji', '')::numeric
     where wycena_id = p_wycena;
    update public.zapytania set status = 'zatwierdzona' where id = v_w.zapytanie_id and status in ('do_zatwierdzenia', 'kalkulacja', 'w_analizie', 'nowe');

  elsif p_status = 'zwrocona' then
    if not public.ma_role('prezes') then raise exception 'Zwrócić wycenę do poprawy może tylko prezes.'; end if;
    if v_w.status <> 'do_zatwierdzenia' then raise exception 'Zwrócić można tylko wycenę czekającą na zatwierdzenie.'; end if;
    if coalesce(trim(p_komentarz), '') = '' then raise exception 'Napisz, co poprawić.'; end if;
    update public.wyceny set status = 'zwrocona', komentarz_prezesa = p_komentarz where id = p_wycena;
    update public.zapytania set status = 'kalkulacja' where id = v_w.zapytanie_id and status = 'do_zatwierdzenia';

  elsif p_status = 'robocza' then
    -- Wycofanie z kolejki przez autora (zanim prezes zdecyduje).
    if v_w.status <> 'do_zatwierdzenia' then raise exception 'Wycofać można tylko wycenę czekającą na zatwierdzenie.'; end if;
    update public.wyceny set status = 'robocza' where id = p_wycena;
  end if;
end $$;

-- Cena końcowa zatwierdzonej wersji - dla oferty i dla osób bez dostępu do marż (bez rozbicia na zysk).
create function public.cena_zatwierdzona(p_wycena uuid)
returns table (cena_koncowa numeric, cena_bez_opcji numeric)
language sql stable security definer set search_path = public as $$
  select m.cena_koncowa, m.cena_bez_opcji from public.wyceny_marze m join public.wyceny w on w.id = m.wycena_id
  where m.wycena_id = p_wycena and w.status = 'zatwierdzona' and public.jest_pracownikiem();
$$;

-- --- Audyt ---------------------------------------------------------------------------------------
create trigger trg_audyt after insert or update or delete on public.wyceny
  for each row execute function public.audytuj('zapytanie_id');
create trigger trg_audyt after insert or update or delete on public.wyceny_marze
  for each row execute function public.audytuj('-', 'poufne');
create trigger trg_audyt after insert or update or delete on public.aparaty
  for each row execute function public.audytuj('-');
create trigger trg_audyt after insert or update or delete on public.pozycje_wyceny
  for each row execute function public.audytuj('-');
create trigger trg_audyt after insert or update or delete on public.klauzule
  for each row execute function public.audytuj('-');

-- --- RLS -----------------------------------------------------------------------------------------
alter table public.wyceny         enable row level security;
alter table public.wyceny_marze   enable row level security;
alter table public.aparaty        enable row level security;
alter table public.pozycje_wyceny enable row level security;
alter table public.klauzule       enable row level security;

create policy wyc_select on public.wyceny for select to authenticated using (public.jest_pracownikiem());
create policy wyc_insert on public.wyceny for insert to authenticated with check (public.jest_pracownikiem() and status = 'robocza');
create policy wyc_update on public.wyceny for update to authenticated using (public.jest_pracownikiem()) with check (public.jest_pracownikiem());
create policy wyc_delete on public.wyceny for delete to authenticated
  using (status in ('robocza', 'zwrocona') and (public.jest_administratorem() or utworzyl = auth.uid()));

create policy mar_select on public.wyceny_marze for select to authenticated using (public.widzi_marze());
create policy mar_update on public.wyceny_marze for update to authenticated using (public.widzi_marze()) with check (public.widzi_marze());

create policy ap_select on public.aparaty for select to authenticated using (public.jest_pracownikiem());
create policy ap_write on public.aparaty for all to authenticated
  using (public.moze_edytowac_wycene(wycena_id)) with check (public.moze_edytowac_wycene(wycena_id));

create policy pw_select on public.pozycje_wyceny for select to authenticated using (public.jest_pracownikiem());
create policy pw_write on public.pozycje_wyceny for all to authenticated
  using (public.moze_edytowac_wycene((select wycena_id from public.aparaty where id = aparat_id)))
  with check (public.moze_edytowac_wycene((select wycena_id from public.aparaty where id = aparat_id)));

create policy kla_select on public.klauzule for select to authenticated using (public.jest_pracownikiem());
create policy kla_write on public.klauzule for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

-- --- Funkcje ---------------------------------------------------------------------------------------
revoke execute on function public.tryb_systemowy() from public, anon;
grant execute on function public.tryb_systemowy() to authenticated, service_role;
revoke execute on function public.nadaj_numer_zo(), public.pilnuj_wyceny(), public.pilnuj_pozycji_wyceny(), public.pilnuj_marz(),
  public.utworz_marze() from public, anon, authenticated;
revoke execute on function public.status_wyceny_aparatu(uuid), public.moze_edytowac_wycene(uuid), public.nowa_wycena(uuid, text),
  public.kopiuj_wycene(uuid), public.zmien_status_wyceny(uuid, public.status_wyceny, text, jsonb, jsonb),
  public.cena_zatwierdzona(uuid) from public, anon;
grant execute on function public.status_wyceny_aparatu(uuid), public.moze_edytowac_wycene(uuid), public.nowa_wycena(uuid, text),
  public.kopiuj_wycene(uuid), public.zmien_status_wyceny(uuid, public.status_wyceny, text, jsonb, jsonb),
  public.cena_zatwierdzona(uuid) to authenticated, service_role;

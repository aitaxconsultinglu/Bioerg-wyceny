-- =============================================================================
-- Wyceny i oferty
-- 0001: fundament - użytkownicy i role, audyt, ustawienia, słowniki, kursy walut
-- =============================================================================

-- --- Typy ---------------------------------------------------------------------
create type public.rola_uzytkownika as enum ('technolog', 'handlowy', 'prezes', 'administrator');

-- --- Użytkownicy ----------------------------------------------------------------
-- Nazwa wyświetlana to opis stanowiska (np. "Dział technologów"), a nie nazwisko.
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null,
  nazwa               text,
  rola                public.rola_uzytkownika not null default 'technolog',
  -- Bez tej flagi użytkownik widzi koszty, ale nie widzi zysku i korekty prezesa.
  -- Prezes i administrator widzą marże zawsze (patrz widzi_marze()).
  widzi_marze         boolean not null default false,
  chroniony           boolean not null default false,
  wymaga_zmiany_hasla boolean not null default false,
  utworzono           timestamptz not null default now()
);

-- Uprawnienia nadawane przy utworzeniu konta (wpis musi powstać przed kontem auth).
create table public.uprawnienia_startowe (
  email       text primary key,
  nazwa       text,
  rola        public.rola_uzytkownika not null default 'technolog',
  widzi_marze boolean not null default false,
  chroniony   boolean not null default false
);
insert into public.uprawnienia_startowe (email, nazwa, rola, widzi_marze, chroniony)
values ('aitaxconsultinglu@gmail.com', 'Administrator', 'administrator', true, true);

-- --- Funkcje uprawnień (używane w RLS) -----------------------------------------
create function public.moja_rola() returns public.rola_uzytkownika
language sql stable security definer set search_path = public as $$
  select rola from public.profiles where id = auth.uid();
$$;

create function public.ma_role(variadic p_role public.rola_uzytkownika[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rola = any (p_role) from public.profiles where id = auth.uid()), false);
$$;

create function public.jest_administratorem() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ma_role('administrator');
$$;

-- Każde konto z profilem. Konta zakłada tylko administrator, rejestracja jest wyłączona.
create function public.jest_pracownikiem() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create function public.widzi_marze() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rola in ('prezes', 'administrator') or widzi_marze
                   from public.profiles where id = auth.uid()), false);
$$;

-- --- Triggery: użytkownicy -------------------------------------------------------
create function public.obsluz_nowego_uzytkownika() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_seed public.uprawnienia_startowe%rowtype;
begin
  select * into v_seed from public.uprawnienia_startowe where lower(email) = lower(new.email);
  insert into public.profiles (id, email, nazwa, rola, widzi_marze, chroniony)
  values (new.id, new.email,
          coalesce(v_seed.nazwa, split_part(new.email, '@', 1)),
          coalesce(v_seed.rola, 'technolog'),
          coalesce(v_seed.widzi_marze, false),
          coalesce(v_seed.chroniony, false))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger trg_nowy_uzytkownik after insert on auth.users
  for each row execute function public.obsluz_nowego_uzytkownika();

create function public.chron_konto_administratora() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = old.id and chroniony) then
    raise exception 'Konto % jest kontem administratora aplikacji i nie może zostać usunięte.', old.email
      using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger trg_chron_konto_administratora before delete on auth.users
  for each row execute function public.chron_konto_administratora();

create function public.chron_role_administratora() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.chroniony and (new.rola is distinct from old.rola or not new.chroniony) then
    raise exception 'Nie można zmienić roli ani zdjąć ochrony z konta administratora (%).', old.email
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger trg_chron_role_administratora before update on public.profiles
  for each row execute function public.chron_role_administratora();

-- Zdejmuje wymuszenie zmiany hasła. Osobna funkcja, bo profile nie mają polityki UPDATE
-- (inaczej użytkownik mógłby nadać sobie rolę prezesa).
create function public.potwierdz_ustawienie_hasla() returns void
language sql security definer set search_path = public as $$
  update public.profiles set wymaga_zmiany_hasla = false where id = auth.uid();
$$;

create function public.lista_uzytkownikow()
returns table (id uuid, email text, nazwa text, rola public.rola_uzytkownika, widzi_marze boolean,
               wymaga_zmiany_hasla boolean, chroniony boolean, ostatnie_logowanie timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, p.nazwa, p.rola, p.widzi_marze, p.wymaga_zmiany_hasla, p.chroniony, u.last_sign_in_at
  from public.profiles p join auth.users u on u.id = p.id
  where public.jest_administratorem()
  order by p.chroniony desc, p.rola, p.email;
$$;

create function public.zmien_uprawnienia(p_user uuid, p_rola public.rola_uzytkownika,
                                          p_widzi_marze boolean, p_nazwa text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.jest_administratorem() then
    raise exception 'Tylko administrator może zmieniać uprawnienia.' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() and p_rola <> 'administrator' then
    raise exception 'Nie możesz odebrać sobie roli administratora.';
  end if;
  update public.profiles
     set rola = p_rola, widzi_marze = coalesce(p_widzi_marze, false),
         nazwa = coalesce(nullif(trim(p_nazwa), ''), nazwa)
   where id = p_user;
  if not found then
    raise exception 'Nie znaleziono konta.';
  end if;
end $$;

-- --- Audyt ------------------------------------------------------------------------
-- Zapis wyłącznie przez trigger audytuj() - brak polityk INSERT/UPDATE/DELETE.
create table public.audit_log (
  id           bigint generated always as identity primary key,
  tabela       text not null,
  rekord_id    text,
  akcja        text not null,
  zapytanie_id uuid,            -- kontekst: zapytanie ofertowe, gdy rekord do niego należy
  poufne       boolean not null default false,  -- marże i korekty: widoczne tylko z flagą
  user_id      uuid,
  user_email   text,
  zmiany       jsonb,
  czas         timestamptz not null default now()
);
create index on public.audit_log (zapytanie_id, czas);
create index on public.audit_log (tabela, czas);

-- Argumenty triggera: [0] nazwa kolumny z id zapytania (albo '-'), [1] 'poufne' dla tabel z marżami.
create function public.audytuj() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
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

create function public.dotknij_zmodyfikowano() returns trigger
language plpgsql set search_path = public as $$
begin
  new.zmodyfikowano := clock_timestamp();
  return new;
end $$;

create trigger trg_audyt after update or delete on public.profiles
  for each row execute function public.audytuj('-');

-- --- Ustawienia (klucz -> wartość) ------------------------------------------------
create table public.ustawienia (
  klucz         text primary key,
  wartosc       jsonb not null,
  opis          text,
  -- Ustawienia z marżą (zysk %, korekta) czyta tylko użytkownik z flagą "widzi marże".
  poufne        boolean not null default false,
  zmodyfikowano timestamptz not null default now()   -- kto zmienił: audit_log
);
create trigger trg_zmodyfikowano before update on public.ustawienia
  for each row execute function public.dotknij_zmodyfikowano();
create trigger trg_audyt after insert or update or delete on public.ustawienia
  for each row execute function public.audytuj('-');

insert into public.ustawienia (klucz, wartosc, opis, poufne) values
  ('narzut_zakupowy_proc',   '5',   'Narzut zakupowy na materiały [%] (zwykle 5 albo 10).', false),
  ('narzut_kooperacja_proc', '0',   'Narzut na kooperację [%].', false),
  ('narzut_zysk_proc',       '10',  'Narzut / zysk końcowy [%] (zwykle 10 albo 15).', true),
  ('zaokraglenie_ceny',      '100', 'Zaokrąglenie ceny aparatu po narzucie [zł]: 0 = bez, 10, 100, 1000.', true),
  ('wiek_ceny_ostrzezenie_mies', '6', 'Cena starsza niż tyle miesięcy jest oznaczana jako nieaktualna.', false),
  ('waznosc_oferty_dostawcy_ryzyko_dni', '7', 'Oferta dostawcy ważna krócej niż tyle dni = ryzyko cenowe.', false),
  ('wspolczynnik_ilosci_materialu', '1.1', 'Domyślny mnożnik masy przy wycenie uproszczonej (masa × 1,1).', false),
  ('oferta_domyslne', '{"gwarancja_mies": 24, "waznosc_dni": 30, "platnosc": "DH", "vat_proc": 23}',
     'Domyślne warunki oferty dla klienta.', false),
  -- Dane firmy wpisuje administrator w Ustawieniach (repozytorium jest publiczne - bez danych firmy).
  ('firma', '{
     "nazwa": "", "adres": "", "krs": "", "nip": "", "regon": "",
     "oddzialy": [], "zarzad": [], "email": "", "telefon": "", "www": "",
     "miejscowosc": "", "logo": "", "domeny": [], "opis_dzialalnosci": ""
   }', 'Dane firmy do nagłówka i stopki oferty, logo, domeny poczty i opis dla AI. Uzupełnia administrator.', false),
  ('limity_planu', '{"baza_mb": 500, "storage_mb": 1024, "plik_mb": 50, "ostrzezenie_proc": 80}',
     'Limity planu Supabase (Free). Po przejściu na Pro zmień wartości.', false);

-- --- Słowniki -----------------------------------------------------------------------
create table public.mpk (
  kod     text primary key check (kod ~ '^[A-Z][0-9]{2}$'),
  opis    text,
  aktywne boolean not null default true
);
insert into public.mpk (kod) values
  ('P03'), ('P04'), ('P05'), ('P06'), ('P07'), ('P08'), ('P09'),
  ('P11'), ('P15'), ('P16'), ('P17'), ('P20');

create table public.stawki_robocizny (
  id             bigint generated always as identity primary key,
  rodzaj_pracy   text not null,
  mpk_kod        text references public.mpk(kod),
  stawka         numeric(10,2) not null check (stawka >= 0),
  wazna_od       date not null default current_date,
  aktywna        boolean not null default true,
  do_weryfikacji boolean not null default false,
  domyslna       boolean not null default false,  -- stawka podstawiana w metodzie wskaźnikowej
  uwagi          text,
  kolejnosc      integer not null default 0
);
create unique index stawki_jedna_domyslna on public.stawki_robocizny (domyslna) where domyslna and aktywna;
create trigger trg_audyt after insert or update or delete on public.stawki_robocizny
  for each row execute function public.audytuj('-');

-- Same rodzaje prac. Stawki to dane firmy - repozytorium jest publiczne, więc tu są zera,
-- a wartości startowe (z przykładowych wycen) wpisuje administrator w Ustawieniach
-- (w działającym projekcie wprowadzone przy wdrożeniu, oznaczone „do weryfikacji”).
insert into public.stawki_robocizny (rodzaj_pracy, stawka, do_weryfikacji, domyslna, kolejnosc, uwagi) values
  ('Stawka średnia warsztatu (metoda wskaźnikowa)', 0, true, true, 1, 'Do weryfikacji.'),
  ('Spawacz',            0, true, false, 2, null),
  ('Ślusarz-monter',     0, true, false, 3, null),
  ('Tokarz / obróbka',   0, true, false, 4, null),
  ('Malarz',             0, true, false, 5, null),
  ('Monter na obiekcie', 0, true, false, 6, null),
  ('Nadzór',             0, true, false, 7, null),
  ('Podwykonawca',       0, true, false, 8, null);

-- Rodzaje stali z gęstością - gatunek dziedziczy gęstość po rodzaju.
create table public.rodzaje_stali (
  kod     text primary key,
  nazwa   text not null,
  gestosc numeric(6,3) not null check (gestosc > 0)   -- kg/dm³
);
insert into public.rodzaje_stali (kod, nazwa, gestosc) values
  ('weglowa',     'Stal węglowa / niskostopowa', 7.85),
  ('nierdzewna',  'Stal nierdzewna austenityczna', 7.93);
create trigger trg_audyt after insert or update or delete on public.rodzaje_stali
  for each row execute function public.audytuj('-');

-- Gatunki z grupą równoważności: wyszukiwanie po 1.4307 znajduje też 304L.
create table public.gatunki (
  kod          text primary key,
  grupa        text not null,     -- klucz grupy równoważnych gatunków
  rodzaj_stali text not null references public.rodzaje_stali(kod),
  norma        text,
  uwagi        text
);
create index on public.gatunki (grupa);
insert into public.gatunki (kod, grupa, rodzaj_stali, norma, uwagi) values
  ('1.4301',    '304',      'nierdzewna', 'EN 10088', null),
  ('304',       '304',      'nierdzewna', 'ASTM',     null),
  ('1.4307',    '304L',     'nierdzewna', 'EN 10088', null),
  ('1.4306',    '304L',     'nierdzewna', 'EN 10088', null),
  ('304L',      '304L',     'nierdzewna', 'ASTM',     null),
  ('1.4404',    '316L',     'nierdzewna', 'EN 10088', null),
  ('316L',      '316L',     'nierdzewna', 'ASTM',     null),
  ('P355NL1',   'P355NL',   'weglowa',    'EN 10216-3 / 10028-3', 'Gwarantowana udarność w niskiej temperaturze.'),
  ('P355NL2',   'P355NL',   'weglowa',    'EN 10216-3 / 10028-3', 'Gwarantowana udarność w niskiej temperaturze.'),
  ('SA516Gr60', 'SA516',    'weglowa',    'ASME SA-516', 'Równoważnik do wyszukiwania - Gr60 ma niższą wytrzymałość niż Gr70.'),
  ('SA516Gr70', 'SA516',    'weglowa',    'ASME SA-516', null),
  ('A350 LF2',  'LF2',      'weglowa',    'ASTM A350', 'Odkuwki do niskich temperatur.'),
  ('SA350 LF2', 'LF2',      'weglowa',    'ASME SA-350', null),
  ('P265GH',    'P265GH',   'weglowa',    'EN 10028-2', null),
  ('P235GH',    'P235GH',   'weglowa',    'EN 10216-2 / 10028-2', null),
  ('S235JR',    'S235JR',   'weglowa',    'EN 10025-2', null),
  ('SA105',     'A105',     'weglowa',    'ASME SA-105', null),
  ('A105',      'A105',     'weglowa',    'ASTM A105', null),
  ('SA106',     'A106',     'weglowa',    'ASME SA-106', null),
  ('A106 Gr.B', 'A106',     'weglowa',    'ASTM A106', null);
create trigger trg_audyt after insert or update or delete on public.gatunki
  for each row execute function public.audytuj('-');

-- Kategorie materiałów: dokładnie te od Działu technologów + dodatkowe.
-- sposob_masy podpowiada wzór liczenia masy z wymiarów (blacha / krazek / rura / pret / brak).
create table public.kategorie_materialow (
  kod                 text primary key,
  nazwa               text not null,
  naddatek_proc       numeric(5,2) not null default 0 check (naddatek_proc >= 0),
  sposob_masy         text not null default 'brak' check (sposob_masy in ('blacha', 'krazek', 'rura', 'pret', 'brak')),
  jm_domyslna         text not null default 'kg',
  -- Materiały pomocnicze (tarcze, płytki) wchodzą w koszt projektu, ale nie do porównań zł/kg.
  do_porownan         boolean not null default true,
  dodatkowa           boolean not null default false,
  kolejnosc           integer not null default 0
);
insert into public.kategorie_materialow (kod, nazwa, naddatek_proc, sposob_masy, jm_domyslna, do_porownan, dodatkowa, kolejnosc) values
  ('ksztaltowniki',     'Kształtowniki',            0, 'brak',   'm',   true,  false, 1),
  ('dennice',           'Dennice',                  0, 'brak',   'szt', true,  false, 2),
  ('blachy',            'Blachy / wypałki',         5, 'blacha', 'ark', true,  false, 3),
  ('rury_technologiczne','Rury technologiczne',     0, 'rura',   'm',   true,  false, 4),
  ('rury_krocce',       'Rury na króćce',           0, 'rura',   'm',   true,  false, 5),
  ('kolnierze',         'Kołnierze',                2, 'krazek', 'szt', true,  false, 6),
  ('odkuwki',           'Odkuwki',                  2, 'krazek', 'szt', true,  false, 7),
  ('zlaczne',           'Elementy złączne',         0, 'brak',   'szt', true,  false, 8),
  ('uszczelki',         'Uszczelki',                0, 'brak',   'kpl', true,  false, 9),
  ('spawalnicze',       'Materiały spawalnicze',    0, 'brak',   'kg',  true,  true, 10),
  ('antykorozyjne',     'Materiały antykorozyjne (farby)', 0, 'brak', 'l', true, true, 11),
  ('prety',             'Pręty',                    2, 'pret',   'm',   true,  true, 12),
  ('inne',              'Inne',                     0, 'brak',   'szt', true,  true, 13),
  ('pomocnicze',        'Materiały pomocnicze (narzędzia, ścierniwa)', 0, 'brak', 'szt', false, true, 14);
create trigger trg_audyt after insert or update or delete on public.kategorie_materialow
  for each row execute function public.audytuj('-');

-- Usługi kooperacyjne. jednostka_odniesienia pozwala porównywać oferty (zł/m², zł/kg, ...).
-- zakladka: gdzie usługa trafia w wycenie (kooperacja albo badania/odbiory/projekt/transport).
create table public.kategorie_uslug (
  kod                  text primary key,
  nazwa                text not null,
  jednostka_odniesienia text not null,
  zakladka             text not null default 'kooperacja'
    check (zakladka in ('kooperacja', 'projekt', 'badania', 'transport', 'inne')),
  kolejnosc            integer not null default 0
);
insert into public.kategorie_uslug (kod, nazwa, jednostka_odniesienia, zakladka, kolejnosc) values
  ('zwijanie',       'Zwijanie / gięcie blach',                       'zł/szt',          'kooperacja', 1),
  ('giecie_rur',     'Gięcie rur',                                     'zł/szt',          'kooperacja', 2),
  ('ciecie',         'Cięcie laserem / plazmą (wypałki jako usługa)',  'zł/kg',           'kooperacja', 3),
  ('obrobka',        'Obróbka mechaniczna (np. wiercenie ścian sitowych)', 'kwota za aparat', 'kooperacja', 4),
  ('pwht',           'Obróbka cieplna (PWHT)',                         'kwota za aparat', 'kooperacja', 5),
  ('malowanie',      'Śrutowanie / malowanie',                         'zł/m²',           'kooperacja', 6),
  ('trawienie',      'Trawienie i pasywacja',                          'zł/m²',           'kooperacja', 7),
  ('sekafenowanie',  'Sekafenowanie',                                  'kwota za aparat', 'kooperacja', 8),
  ('izolacja',       'Izolacja',                                       'zł/m²',           'kooperacja', 9),
  ('ndt',            'Badania NDT (RT/UT/PT/MT/VT)',                   'zł/mb',           'badania',    10),
  ('nft',            'Badanie prądami wirowymi (NFT)',                 'zł/szt',          'badania',    11),
  ('proba',          'Próba ciśnieniowa',                              'zł/szt',          'badania',    12),
  ('odbiory',        'Odbiory UDT / Jednostka Notyfikowana',           'kwota za aparat', 'badania',    13),
  ('projekt',        'Projekt / dokumentacja koncesyjno-warsztatowa',  'kwota za aparat', 'projekt',    14),
  ('transport',      'Transport (normalny / ponadgabarytowy)',         'kwota za kurs',   'transport',  15),
  ('dzwig',          'Dźwig / sprzęt',                                 'kwota za kurs',   'transport',  16),
  ('montaz',         'Demontaż / montaż',                              'kwota za aparat', 'inne',       17),
  ('pakowanie',      'Pakowanie / skrzynia',                           'kwota za aparat', 'inne',       18);
create trigger trg_audyt after insert or update or delete on public.kategorie_uslug
  for each row execute function public.audytuj('-');

-- --- Kursy walut (NBP, tabela A) --------------------------------------------------------
create table public.kursy_walut (
  waluta  text not null check (waluta ~ '^[A-Z]{3}$'),
  data    date not null,
  kurs    numeric(10,4) not null check (kurs > 0),
  tabela  text,                   -- numer tabeli NBP, np. 201/A/NBP/2026
  zrodlo  text not null default 'NBP',
  pobrano timestamptz not null default now(),
  primary key (waluta, data)
);

-- Kurs z dnia (albo ostatni wcześniejszy - w weekendy i święta NBP nie publikuje).
create function public.kurs_na_dzien(p_waluta text, p_data date default current_date)
returns table (kurs numeric, data date, tabela text)
language sql stable security invoker set search_path = public as $$
  select k.kurs, k.data, k.tabela from public.kursy_walut k
  where k.waluta = upper(p_waluta) and k.data <= p_data
  order by k.data desc limit 1;
$$;

-- --- Zajętość zasobów planu (pasek w ustawieniach) --------------------------------------
create function public.zajetosc_zasobow()
returns table (baza_bajty bigint, storage_bajty bigint, storage_plikow bigint)
language sql stable security definer set search_path = public, storage as $$
  select pg_database_size(current_database()),
         coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0)::bigint,
         (select count(*) from storage.objects)::bigint
  where public.jest_administratorem();
$$;

-- --- RLS ------------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.uprawnienia_startowe enable row level security;
alter table public.audit_log            enable row level security;
alter table public.ustawienia           enable row level security;
alter table public.mpk                  enable row level security;
alter table public.stawki_robocizny     enable row level security;
alter table public.rodzaje_stali        enable row level security;
alter table public.gatunki              enable row level security;
alter table public.kategorie_materialow enable row level security;
alter table public.kategorie_uslug      enable row level security;
alter table public.kursy_walut          enable row level security;

-- Profile: celowo BEZ polityki UPDATE - zmiany ról tylko przez zmien_uprawnienia().
create policy prof_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.jest_administratorem());
create policy ups_select on public.uprawnienia_startowe for select to authenticated
  using (public.jest_administratorem());

-- Audyt: administrator i prezes widzą wszystko; pozostali historię zapytań bez wpisów poufnych.
create policy audit_select on public.audit_log for select to authenticated
  using (public.ma_role('administrator', 'prezes')
         or (zapytanie_id is not null and public.jest_pracownikiem() and (not poufne or public.widzi_marze())));

-- Ustawienia i słowniki: czytają wszyscy pracownicy (potrzebne do liczenia), zmienia administrator.
create policy ust_select on public.ustawienia for select to authenticated
  using (public.jest_pracownikiem() and (not poufne or public.widzi_marze()));
create policy ust_write on public.ustawienia for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

create policy mpk_select on public.mpk for select to authenticated using (public.jest_pracownikiem());
create policy mpk_write on public.mpk for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

create policy str_select on public.stawki_robocizny for select to authenticated using (public.jest_pracownikiem());
create policy str_write on public.stawki_robocizny for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

create policy rst_select on public.rodzaje_stali for select to authenticated using (public.jest_pracownikiem());
create policy rst_write on public.rodzaje_stali for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

create policy gat_select on public.gatunki for select to authenticated using (public.jest_pracownikiem());
create policy gat_write on public.gatunki for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

create policy kmat_select on public.kategorie_materialow for select to authenticated using (public.jest_pracownikiem());
create policy kmat_write on public.kategorie_materialow for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

create policy kusl_select on public.kategorie_uslug for select to authenticated using (public.jest_pracownikiem());
create policy kusl_write on public.kategorie_uslug for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

-- Kursy zapisuje funkcja brzegowa (service_role) albo administrator (kurs ręczny).
create policy kw_select on public.kursy_walut for select to authenticated using (public.jest_pracownikiem());
create policy kw_write on public.kursy_walut for all to authenticated
  using (public.jest_administratorem()) with check (public.jest_administratorem());

-- --- Uprawnienia do funkcji -------------------------------------------------------------
-- Funkcje triggerów nie są API.
revoke execute on function
  public.audytuj(), public.dotknij_zmodyfikowano(), public.obsluz_nowego_uzytkownika(),
  public.chron_konto_administratora(), public.chron_role_administratora()
from public, anon, authenticated;

-- Funkcje pomocnicze RLS i RPC aplikacji: tylko dla zalogowanych.
revoke execute on function
  public.moja_rola(), public.ma_role(public.rola_uzytkownika[]), public.jest_administratorem(),
  public.jest_pracownikiem(), public.widzi_marze(), public.potwierdz_ustawienie_hasla(),
  public.lista_uzytkownikow(), public.zmien_uprawnienia(uuid, public.rola_uzytkownika, boolean, text),
  public.kurs_na_dzien(text, date), public.zajetosc_zasobow()
from public, anon;
grant execute on function
  public.moja_rola(), public.ma_role(public.rola_uzytkownika[]), public.jest_administratorem(),
  public.jest_pracownikiem(), public.widzi_marze(), public.potwierdz_ustawienie_hasla(),
  public.lista_uzytkownikow(), public.zmien_uprawnienia(uuid, public.rola_uzytkownika, boolean, text),
  public.kurs_na_dzien(text, date), public.zajetosc_zasobow()
to authenticated;

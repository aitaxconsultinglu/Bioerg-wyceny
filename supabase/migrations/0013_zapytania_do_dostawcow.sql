-- Etap 4: generator zapytań do dostawców i kooperantów + śledzenie wysłanych zapytań.
-- Wysyłka w wersji demo przez mailto: (Outlook) - aplikacja zapisuje, do kogo i kiedy poszło zapytanie,
-- a status "jest oferta" wylicza z bazy ofert (ta sama oferta dostawcy do tego samego ZO).

-- Szablon treści i biblioteka wymagań - edytuje administrator (Ustawienia → Zapytania do dostawców).
-- kategorie: kody kategorii materiałów / usług albo '*material' / '*usluga' (wszystkie danego rodzaju).
-- w_naglowku: wymaganie dopisywane do zdania wstępu ("... z atestem 3.1 + PED, producent UE ...:").
insert into public.ustawienia (klucz, wartosc, opis, poufne) values
  ('zapytania_dostawcow', '{
     "dw": "",
     "dni_bez_odpowiedzi": 5,
     "dni_na_odpowiedz": 5,
     "powitanie": "Dzień dobry,",
     "wstep_material": "Proszę o ofertę na materiał jak poniżej",
     "wstep_usluga": "Proszę o ofertę na usługę jak poniżej",
     "zakonczenie": "W ofercie prosimy podać cenę netto, termin realizacji, warunki dostawy (INCOTERMS), ważność oferty i warunki płatności.",
     "podpis": "Z poważaniem\nDział handlowy",
     "wymagania": [
       {"kod": "atest", "tekst": "z atestem 3.1 + PED, producent UE (uprawnienia UDT, jeśli z Polski)", "kategorie": ["*material"], "w_naglowku": true},
       {"kod": "udarnosc", "tekst": "Wymagana gwarantowana udarność dla wszystkich materiałów w temp. -45 °C, KV min. 27 J.", "kategorie": ["*material"], "w_naglowku": false},
       {"kod": "ut_rury", "tekst": "Wymagane badanie ultradźwiękowe rur wg EN ISO 10893-10 U2C.", "kategorie": ["rury_technologiczne", "rury_krocce"], "w_naglowku": false},
       {"kod": "nft", "tekst": "Wymagane badanie rur metodą prądów wirowych (NFT).", "kategorie": ["rury_technologiczne"], "w_naglowku": false},
       {"kod": "ut_odkuwki", "tekst": "Wymagane badanie UT odkuwek, klasa S2E2 wg EN 10160 lub odpowiednio wg ASME.", "kategorie": ["odkuwki", "kolnierze"], "w_naglowku": false},
       {"kod": "naddatki", "tekst": "Wymiary podano na gotowo - wymagane uwzględnienie naddatków technologicznych na obróbkę mechaniczną.", "kategorie": ["odkuwki"], "w_naglowku": false},
       {"kod": "termin_dostawy", "tekst": "Prosimy o podanie realnego terminu dostawy od daty zamówienia.", "kategorie": ["*material", "*usluga"], "w_naglowku": false}
     ]
   }', 'Generator zapytań do dostawców: adres do DW (dedykowana skrzynka), dni bez odpowiedzi, szablon treści, biblioteka wymagań.', false)
on conflict (klucz) do nothing;

create table public.zapytania_dostawcow (
  id               uuid primary key default gen_random_uuid(),
  zapytanie_id     uuid not null references public.zapytania(id) on delete cascade,
  -- Źródło pozycji (informacyjnie) - pozycje są skopiowane niżej, zmiana wyceny nie zmienia wysłanego zapytania.
  wycena_id        uuid references public.wyceny(id) on delete set null,
  odczyt_id        uuid references public.odczyty_rysunkow(id) on delete set null,
  rodzaj           text not null default 'material' check (rodzaj in ('material', 'usluga')),
  kategoria        text not null,                     -- kod kategorii materiału / usługi
  temat            text not null,
  tresc            text not null,
  pozycje          jsonb not null default '[]',       -- [{opis, ilosc, jm, masa_kg}] - kopia z chwili wysłania
  wymagania        text[] not null default '{}',      -- kody wymagań z biblioteki
  termin_odpowiedzi date,
  utworzyl         uuid default auth.uid() references public.profiles(id) on delete set null,
  utworzono        timestamptz not null default now(),
  zmodyfikowano    timestamptz not null default now()
);
create index on public.zapytania_dostawcow (zapytanie_id);

create table public.zapytania_dostawcow_odbiorcy (
  id                    uuid primary key default gen_random_uuid(),
  zapytanie_dostawcy_id uuid not null references public.zapytania_dostawcow(id) on delete cascade,
  dostawca_id           uuid references public.dostawcy(id) on delete set null,
  nazwa                 text not null,               -- nazwa dostawcy albo adres wpisany ręcznie
  email                 text,
  wyslano               timestamptz,                 -- null = przygotowane, jeszcze nie wysłane
  wyslal                uuid references public.profiles(id) on delete set null,
  oferta_id             uuid references public.oferty_dostawcow(id) on delete set null,  -- powiązanie ręczne
  odmowa                boolean not null default false,  -- dostawca odpowiedział, że nie złoży oferty
  uwagi                 text,
  zmodyfikowano         timestamptz not null default now()
);
create index on public.zapytania_dostawcow_odbiorcy (zapytanie_dostawcy_id);
create index on public.zapytania_dostawcow_odbiorcy (dostawca_id);

create trigger trg_zmodyfikowano before update on public.zapytania_dostawcow
  for each row execute function public.dotknij_rekord();
create trigger trg_zmodyfikowano before update on public.zapytania_dostawcow_odbiorcy
  for each row execute function public.dotknij_rekord();
create trigger trg_audyt after insert or update or delete on public.zapytania_dostawcow
  for each row execute function public.audytuj('zapytanie_id');
create trigger trg_audyt after insert or update or delete on public.zapytania_dostawcow_odbiorcy
  for each row execute function public.audytuj();

-- Czytają wszyscy pracownicy, tworzy i oznacza dział handlowy / prezes / administrator (jak baza ofert).
alter table public.zapytania_dostawcow enable row level security;
alter table public.zapytania_dostawcow_odbiorcy enable row level security;
create policy zd_select on public.zapytania_dostawcow for select to authenticated using (public.jest_pracownikiem());
create policy zd_write on public.zapytania_dostawcow for all to authenticated
  using (public.moze_baze_cen()) with check (public.moze_baze_cen());
create policy zdo_select on public.zapytania_dostawcow_odbiorcy for select to authenticated using (public.jest_pracownikiem());
create policy zdo_write on public.zapytania_dostawcow_odbiorcy for all to authenticated
  using (public.moze_baze_cen()) with check (public.moze_baze_cen());

-- Odbiorcy z danymi zapytania i ofertą znalezioną automatycznie (ten dostawca, to samo ZO).
create view public.zapytania_dostawcow_stan with (security_invoker = true) as
select o.id, o.zapytanie_dostawcy_id, o.dostawca_id, o.nazwa, o.email, o.wyslano, o.oferta_id, o.odmowa, o.uwagi,
       z.zapytanie_id, z.temat, z.kategoria, z.rodzaj, z.termin_odpowiedzi, z.utworzono,
       coalesce(o.oferta_id, (
         select f.id from public.oferty_dostawcow f
         where f.zapytanie_id = z.zapytanie_id and f.dostawca_id = o.dostawca_id and f.status <> 'odrzucona'
         order by f.data_oferty desc nulls last, f.utworzono desc limit 1
       )) as oferta
from public.zapytania_dostawcow_odbiorcy o
join public.zapytania_dostawcow z on z.id = o.zapytanie_dostawcy_id;

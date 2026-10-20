-- Tryb aplikacji: "etap1" (wycena materiałowa - odczyt rysunków, lista materiałów, ceny z Optimy i ofert do zapytania)
-- albo "pelny" (wszystkie moduły). Moduły spoza etapu są ukryte w interfejsie, nie usunięte - patrz docs/FUNKCJE.md.
insert into public.ustawienia (klucz, wartosc, opis, poufne) values
  ('moduly', '{"tryb": "etap1"}', 'Tryb aplikacji: etap1 = wycena materiałowa (moduły spoza etapu ukryte), pelny = wszystkie moduły.', false)
on conflict (klucz) do nothing;

-- Funkcje pomocnicze ze stałym search_path (zalecenie lintera bezpieczeństwa Supabase).
alter function public.dokument_z_sciezki(p_nazwa text) set search_path = public;
alter function public.tryb_systemowy() set search_path = public;
alter function public.wymaga_masy(p_rodzaj text, p_masa numeric, p_jm text, p_kategoria text) set search_path = public;

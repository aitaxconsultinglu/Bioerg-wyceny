-- Dawne oznaczenia stali konstrukcyjnej spotykane na starszych rysunkach (UNI 7070, EN 10025:1990, PN):
-- odpowiadają S235JR, więc ceny zakupów S235JR pasują do pozycji z rysunku.
insert into public.gatunki (kod, grupa, rodzaj_stali, norma, uwagi) values
  ('Fe37',  'S235JR', 'weglowa', 'UNI 7070 (dawna)',        'Dawne oznaczenie - odpowiada S235JR.'),
  ('Fe360', 'S235JR', 'weglowa', 'EN 10025:1990 (dawna)',   'Dawne oznaczenie - odpowiada S235JR.'),
  ('St3S',  'S235JR', 'weglowa', 'PN-88/H-84020 (dawna)',   'Dawne oznaczenie - odpowiada S235JR.')
on conflict (kod) do nothing;

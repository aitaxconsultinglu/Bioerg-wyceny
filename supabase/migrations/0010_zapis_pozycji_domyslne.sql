-- =============================================================================
-- 0010: zapis pozycji aparatu - wartości domyślne dla kolumn NOT NULL pominiętych przez klienta
-- =============================================================================
create or replace function public.zapisz_pozycje_aparatu(p_aparat uuid, p_pozycje jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_ids bigint[];
  v_dane jsonb;
begin
  -- Uzupełnienie pól wymaganych, zanim rekord zostanie złożony z JSON-a.
  select coalesce(jsonb_agg(
    jsonb_build_object('lp', 0, 'nazwa', '', 'ilosc', 0, 'jm', 'szt', 'masa_reczna', false, 'cena_jedn', 0, 'jednostka_ceny', 'jm',
                       'cena_za_komplet', false, 'dodatkowe', '{}'::jsonb, 'zrodlo_ceny', 'recznie', 'opcjonalna', false)
    || jsonb_strip_nulls(e) || jsonb_build_object('aparat_id', p_aparat)
  ), '[]') into v_dane
  from jsonb_array_elements(p_pozycje) e;

  select coalesce(array_agg((e ->> 'id')::bigint), '{}') into v_ids
  from jsonb_array_elements(v_dane) e where nullif(e ->> 'id', '') is not null;

  delete from pozycje_wyceny where aparat_id = p_aparat and id <> all (v_ids);

  update pozycje_wyceny t set
    (zakladka, sekcja, lp, nazwa, rodzaj, gatunek, d_zew, d_wew, grubosc, szerokosc, dlugosc, dn, pn, klasa, sch, ilosc, jm,
     masa_jedn, masa_reczna, cena_jedn, jednostka_ceny, wartosc_reczna, cena_za_komplet, mpk, stawka_id, dodatkowe,
     zrodlo_ceny, zrodlo_opis, zrodlo_dostawca, zrodlo_data, zrodlo_waznosc_do, zrodlo_termin_dni, zrodlo_id, opcjonalna, wariant, uwagi, pewnosc)
  = (r.zakladka, r.sekcja, r.lp, r.nazwa, r.rodzaj, r.gatunek, r.d_zew, r.d_wew, r.grubosc, r.szerokosc, r.dlugosc, r.dn, r.pn, r.klasa, r.sch,
     r.ilosc, r.jm, r.masa_jedn, r.masa_reczna, r.cena_jedn, r.jednostka_ceny, r.wartosc_reczna, r.cena_za_komplet, r.mpk, r.stawka_id,
     r.dodatkowe, r.zrodlo_ceny, r.zrodlo_opis, r.zrodlo_dostawca, r.zrodlo_data, r.zrodlo_waznosc_do, r.zrodlo_termin_dni, r.zrodlo_id,
     r.opcjonalna, r.wariant, r.uwagi, r.pewnosc)
  from jsonb_array_elements(v_dane) e
  cross join lateral jsonb_populate_record(null::pozycje_wyceny, e) r
  where nullif(e ->> 'id', '') is not null and t.id = (e ->> 'id')::bigint and t.aparat_id = p_aparat
    and (to_jsonb(t) - 'id' - 'aparat_id') is distinct from (to_jsonb(r) - 'id' - 'aparat_id');

  insert into pozycje_wyceny (aparat_id, zakladka, sekcja, lp, nazwa, rodzaj, gatunek, d_zew, d_wew, grubosc, szerokosc, dlugosc, dn, pn,
                              klasa, sch, ilosc, jm, masa_jedn, masa_reczna, cena_jedn, jednostka_ceny, wartosc_reczna, cena_za_komplet,
                              mpk, stawka_id, dodatkowe, zrodlo_ceny, zrodlo_opis, zrodlo_dostawca, zrodlo_data, zrodlo_waznosc_do,
                              zrodlo_termin_dni, zrodlo_id, opcjonalna, wariant, uwagi, pewnosc)
  select p_aparat, r.zakladka, r.sekcja, r.lp, r.nazwa, r.rodzaj, r.gatunek, r.d_zew, r.d_wew, r.grubosc, r.szerokosc, r.dlugosc, r.dn, r.pn,
         r.klasa, r.sch, r.ilosc, r.jm, r.masa_jedn, r.masa_reczna, r.cena_jedn, r.jednostka_ceny, r.wartosc_reczna, r.cena_za_komplet,
         r.mpk, r.stawka_id, r.dodatkowe, r.zrodlo_ceny, r.zrodlo_opis, r.zrodlo_dostawca, r.zrodlo_data, r.zrodlo_waznosc_do,
         r.zrodlo_termin_dni, r.zrodlo_id, r.opcjonalna, r.wariant, r.uwagi, r.pewnosc
  from jsonb_array_elements(v_dane) e
  cross join lateral jsonb_populate_record(null::pozycje_wyceny, e) r
  where nullif(e ->> 'id', '') is null;
end $$;

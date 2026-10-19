-- =============================================================================
-- 0009: wsparcie edytora - lista pracowników, zapis pozycji jedną transakcją, archiwizacja
-- =============================================================================

-- Lista osób do wyboru (prowadzący zapytanie) - bez ról i flag, tylko nazwa i e-mail.
create function public.lista_pracownikow()
returns table (id uuid, nazwa text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.nazwa, p.email), p.email from public.profiles p
  where public.jest_pracownikiem() order by 2;
$$;

-- Zapis pozycji aparatu: zmienione aktualizuje (audyt zapisze tylko różnice), nowe dodaje,
-- brakujące usuwa. Jedna transakcja; RLS i strażniki działają jak przy zwykłym zapisie.
create function public.zapisz_pozycje_aparatu(p_aparat uuid, p_pozycje jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_ids bigint[];
begin
  select coalesce(array_agg((e ->> 'id')::bigint), '{}') into v_ids
  from jsonb_array_elements(p_pozycje) e where nullif(e ->> 'id', '') is not null;

  delete from pozycje_wyceny where aparat_id = p_aparat and id <> all (v_ids);

  update pozycje_wyceny t set
    (zakladka, sekcja, lp, nazwa, rodzaj, gatunek, d_zew, d_wew, grubosc, szerokosc, dlugosc, dn, pn, klasa, sch, ilosc, jm,
     masa_jedn, masa_reczna, cena_jedn, jednostka_ceny, wartosc_reczna, cena_za_komplet, mpk, stawka_id, dodatkowe,
     zrodlo_ceny, zrodlo_opis, zrodlo_dostawca, zrodlo_data, zrodlo_waznosc_do, zrodlo_termin_dni, zrodlo_id, opcjonalna, wariant, uwagi, pewnosc)
  = (r.zakladka, r.sekcja, r.lp, r.nazwa, r.rodzaj, r.gatunek, r.d_zew, r.d_wew, r.grubosc, r.szerokosc, r.dlugosc, r.dn, r.pn, r.klasa, r.sch,
     r.ilosc, r.jm, r.masa_jedn, r.masa_reczna, r.cena_jedn, r.jednostka_ceny, r.wartosc_reczna, r.cena_za_komplet, r.mpk, r.stawka_id,
     r.dodatkowe, r.zrodlo_ceny, r.zrodlo_opis, r.zrodlo_dostawca, r.zrodlo_data, r.zrodlo_waznosc_do, r.zrodlo_termin_dni, r.zrodlo_id,
     r.opcjonalna, r.wariant, r.uwagi, r.pewnosc)
  from jsonb_array_elements(p_pozycje) e
  cross join lateral jsonb_populate_record(null::pozycje_wyceny, e || jsonb_build_object('aparat_id', p_aparat)) r
  where nullif(e ->> 'id', '') is not null and t.id = (e ->> 'id')::bigint and t.aparat_id = p_aparat
    and (to_jsonb(t) - 'id' - 'aparat_id') is distinct from (to_jsonb(r) - 'id' - 'aparat_id');

  insert into pozycje_wyceny (aparat_id, zakladka, sekcja, lp, nazwa, rodzaj, gatunek, d_zew, d_wew, grubosc, szerokosc, dlugosc, dn, pn,
                              klasa, sch, ilosc, jm, masa_jedn, masa_reczna, cena_jedn, jednostka_ceny, wartosc_reczna, cena_za_komplet,
                              mpk, stawka_id, dodatkowe, zrodlo_ceny, zrodlo_opis, zrodlo_dostawca, zrodlo_data, zrodlo_waznosc_do,
                              zrodlo_termin_dni, zrodlo_id, opcjonalna, wariant, uwagi, pewnosc)
  select p_aparat, r.zakladka, r.sekcja, r.lp, r.nazwa, r.rodzaj, r.gatunek, r.d_zew, r.d_wew, r.grubosc, r.szerokosc, r.dlugosc, r.dn, r.pn,
         r.klasa, r.sch, coalesce(r.ilosc, 0), coalesce(r.jm, 'szt'), r.masa_jedn, coalesce(r.masa_reczna, false), coalesce(r.cena_jedn, 0),
         coalesce(r.jednostka_ceny, 'jm'), r.wartosc_reczna, coalesce(r.cena_za_komplet, false), r.mpk, r.stawka_id, coalesce(r.dodatkowe, '{}'),
         coalesce(r.zrodlo_ceny, 'recznie'), r.zrodlo_opis, r.zrodlo_dostawca, r.zrodlo_data, r.zrodlo_waznosc_do, r.zrodlo_termin_dni,
         r.zrodlo_id, coalesce(r.opcjonalna, false), r.wariant, r.uwagi, r.pewnosc
  from jsonb_array_elements(p_pozycje) e
  cross join lateral jsonb_populate_record(null::pozycje_wyceny, e || jsonb_build_object('aparat_id', p_aparat)) r
  where nullif(e ->> 'id', '') is null;
end $$;

-- Archiwizacja dokumentów zapytania: wiersz oznaczony "zarchiwizowany" (tekst zostaje),
-- plik w Storage może wtedy usunąć każdy pracownik (oryginały pobrał w ZIP).
create policy dok_usuniecie_archiwum on storage.objects for delete to authenticated
  using (bucket_id = 'dokumenty' and public.jest_pracownikiem()
         and exists (select 1 from public.dokumenty d where d.id = public.dokument_z_sciezki(name) and d.stan = 'zarchiwizowany'));

revoke execute on function public.lista_pracownikow(), public.zapisz_pozycje_aparatu(uuid, jsonb) from public, anon;
grant execute on function public.lista_pracownikow(), public.zapisz_pozycje_aparatu(uuid, jsonb) to authenticated, service_role;

-- =============================================================================
-- 0007: jedna definicja kolejki "uzupełnij masę" (widok projektów liczył też śruby na sztuki)
-- =============================================================================
-- Do kolejki trafiają materiały bez masy, dla których porównanie zł/kg ma sens:
-- komplety i "usługi" materiałowe (np. "Wypałki ... 1 kpl") oraz blachy i odkuwki.
-- Ta sama reguła jest w src/components/zakupy/Zakupy.tsx (wymagaMasy).

create or replace function public.wymaga_masy(p_rodzaj text, p_masa numeric, p_jm text, p_kategoria text)
returns boolean language sql immutable as $$
  select p_rodzaj = 'material' and p_masa is null
     and (lower(coalesce(p_jm, '')) in ('kpl', 'usł') or coalesce(p_kategoria, '') in ('blachy', 'odkuwki'));
$$;

create or replace view public.projekty_podsumowanie with (security_invoker = true) as
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
         count(*) filter (where public.wymaga_masy(rodzaj, masa_kg, jm, kategoria)) as bez_masy
  from public.zakupy group by numer_karty
) z on z.numer_karty = p.numer
left join (
  select projekt_numer,
         sum(godziny) as godziny,
         sum(godziny) filter (where rodzaj_umowy = 'umowa o pracę') as godziny_wlasne,
         sum(godziny) filter (where rodzaj_umowy <> 'umowa o pracę') as godziny_podwykonawcow
  from public.registo_godziny group by projekt_numer
) r on r.projekt_numer = p.numer;

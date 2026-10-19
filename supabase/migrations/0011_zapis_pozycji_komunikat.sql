-- =============================================================================
-- 0011: zapis pozycji zablokowanej wyceny - czytelny błąd zamiast cichego "0 zmienionych wierszy"
-- =============================================================================
create or replace function public.sprawdz_edycje_aparatu(p_aparat uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.moze_edytowac_wycene((select wycena_id from public.aparaty where id = p_aparat)) then
    raise exception 'Tej wersji wyceny nie można już edytować (czeka na zatwierdzenie albo jest zatwierdzona). Skopiuj ją jako nową wersję.';
  end if;
end $$;

-- Strażnik jako trigger "przed" na tabeli aparatów nie wystarczy (RLS odfiltrowuje wiersze po cichu),
-- dlatego sprawdzenie jest na początku funkcji zapisu.
create or replace function public.zapisz_pozycje_aparatu_sprawdzone(p_aparat uuid, p_pozycje jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform public.sprawdz_edycje_aparatu(p_aparat);
  perform public.zapisz_pozycje_aparatu(p_aparat, p_pozycje);
end $$;

revoke execute on function public.sprawdz_edycje_aparatu(uuid), public.zapisz_pozycje_aparatu_sprawdzone(uuid, jsonb) from public, anon;
grant execute on function public.sprawdz_edycje_aparatu(uuid), public.zapisz_pozycje_aparatu_sprawdzone(uuid, jsonb) to authenticated, service_role;

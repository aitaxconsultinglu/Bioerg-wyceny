-- 0014: poprawka bezpieczeństwa (z 0006).
-- jest_serwisem() sprawdzała current_user. Wywołana z moze_baze_cen() (SECURITY DEFINER) widziała
-- current_user = właściciel funkcji (postgres), więc moze_baze_cen() zwracała true dla KAŻDEGO
-- zalogowanego pracownika - także technolog mógł zmieniać bazę cen (dostawcy, oferty, zakupy).
-- Rola żądania z PostgREST (GUC "role", ustawiany przez SET ROLE) i session_user nie zmieniają się
-- wewnątrz funkcji SECURITY DEFINER.
create or replace function public.jest_serwisem() returns boolean
language sql stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or coalesce(nullif(current_setting('role', true), 'none'), session_user) in ('service_role', 'postgres', 'supabase_admin');
$$;

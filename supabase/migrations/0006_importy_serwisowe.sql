-- =============================================================================
-- 0006: importy dostępne także dla klucza serwisowego (lokalny skrypt scripts/seed)
-- =============================================================================
-- Klucz serwisowy nie ma auth.uid(), więc moze_baze_cen() zwraca false. Skrypt seed
-- (uruchamiany lokalnie, klucz z .env) ma ładować dane tymi samymi funkcjami co aplikacja.

create function public.jest_serwisem() returns boolean
language sql stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role' or current_user in ('service_role', 'postgres');
$$;

create or replace function public.moze_baze_cen() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ma_role('handlowy', 'prezes', 'administrator') or public.jest_serwisem();
$$;

revoke execute on function public.jest_serwisem() from public, anon;
grant execute on function public.jest_serwisem() to authenticated, service_role;

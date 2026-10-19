-- =============================================================================
-- 0002: codzienne pobieranie kursów NBP (pg_cron + pg_net -> funkcja kursy-walut)
-- =============================================================================
-- Adres projektu NIE jest wpisany na sztywno: zadanie czyta go z sekretu Vault
-- "url_projektu", który zakłada skrypt scripts/migracje.mjs dla danego środowiska.
-- Dzięki temu ta sama migracja działa po przeniesieniu na Pro albo na własny serwer.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- NBP publikuje tabelę A w dni robocze ok. 11:45-12:15 czasu polskiego.
-- 11:30 UTC = 12:30 (zima) / 13:30 (lato).
select cron.schedule(
  'kursy-walut-nbp',
  '30 11 * * 1-5',
  $$
  select net.http_post(
    url := s.decrypted_secret || '/functions/v1/kursy-walut',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  from vault.decrypted_secrets s
  where s.name = 'url_projektu';
  $$
);

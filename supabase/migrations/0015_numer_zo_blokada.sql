-- 0015: numer ZO przy równoczesnym zakładaniu zapytań.
-- nastepny_numer_zo() liczy max + 1 - dwa zapytania zakładane w tej samej chwili dostawały ten sam numer
-- i drugie kończyło się błędem unikalności. Blokada transakcyjna szereguje nadawanie numeru; kolejna
-- transakcja czeka na zatwierdzenie poprzedniej i widzi już jej numer.
create or replace function public.nadaj_numer_zo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.numer), '') = '' then
    perform pg_advisory_xact_lock(hashtext('wyceny.numer_zo'));
    new.numer := public.nastepny_numer_zo(extract(year from coalesce(new.utworzono, now()))::int);
  end if;
  return new;
end $$;
revoke execute on function public.nadaj_numer_zo() from public, anon, authenticated;

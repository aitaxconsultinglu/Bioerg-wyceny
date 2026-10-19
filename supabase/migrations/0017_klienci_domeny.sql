-- Import zapytania z maila: rozpoznanie klienta po domenie adresu nadawcy (także w przekazanym mailu).
-- Domena dopisuje się sama, gdy pracownik potwierdzi klienta przy imporcie.
alter table public.klienci add column domeny text[] not null default '{}';

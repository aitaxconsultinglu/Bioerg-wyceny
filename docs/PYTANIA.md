# Pytania do firmy

Nie blokują pracy - tam, gdzie trzeba było coś przyjąć, opisano założenie (*kursywą*). Odpowiedzi wpisuj pod pytaniem.
Repozytorium jest publiczne: pytania nie zawierają nazw firmy, klientów, dostawców ani oznaczeń projektów.

## Do prezesa

1. **Zatwierdzanie wycen.** Zatwierdzać może tylko rola „prezes”. Czy administrator też (np. w zastępstwie)?
   *Założenie: tylko prezes.*
2. **Kto widzi cenę końcową.** Czy technolog bez flagi „widzi marże” ma widzieć cenę końcową zatwierdzonej wyceny
   (a więc pośrednio marżę, jeśli zna koszty)? *Założenie: widzi cenę po zatwierdzeniu, bez rozbicia na zysk i korektę.*
3. **Zaokrąglenie ceny po narzucie.** W historycznych wycenach cenę zaokrąglano raz do 1000 zł, raz do 100 zł.
   *Założenie: domyślnie do 100 zł, do zmiany w ustawieniach i w wycenie.*
4. **Cena za kg w notatce dla prezesa** jest liczona od ceny przed korektą prezesa. Czy w ofercie i statystykach
   („Podobne zlecenia”) ma być liczona przed czy po korekcie? *Założenie: pokazujemy obie.*
5. **Wyceny historyczne** są wczytane jako zatwierdzone (import systemowy, bez kliknięcia prezesa), żeby zasilały
   „Podobne zlecenia” i porównania. Czy tak może zostać? *Założenie: tak; prezes widzi je w historii, nie w kolejce.*
6. **Cena w wycenie automatycznej - najnowsza czy najtańsza oferta?** *Założenie: najnowsza ważna oferta (lepiej oddaje
   bieżący rynek); oferta zebrana do tego samego zapytania ma pierwszeństwo przed historią.*
7. **Budżet AI.** Limit miesięczny i dzienny na użytkownika ustawia administrator. Jaki budżet miesięczny przyjąć na start?
   Przygotowanie jednego zapytania (analiza + rysunki) kosztuje zwykle 0,5-2,5 zł. *Założenie: limit z ustawień demo.*
8. **Odczyt całego arkusza rysunku przez AI** (droższy niż zaznaczenie samej tabeli) - dla wszystkich czy tylko dla
   administratora? *Założenie: dla wszystkich, pilnują go limity budżetu.*

## Do technologów

9. **Opisy kodów MPK** (słownik w Ustawieniach ma puste opisy): które to spawalnia, obróbka, montaż, malarnia?
10. **Docelowe stawki robocizny** i ich podział na rodzaje prac. *Wpisano wartości z przykładowych wycen, oznaczone
    „do weryfikacji”.*
11. **Wskaźnik startowy rbh/t dla typów aparatów** (np. zbiornik pionowy, wymiennik, wkład rurowy). Wycena automatyczna
    bierze medianę z projektów zrealizowanych i wcześniejszych wycen tego typu - przy braku danych robocizna zostaje pusta
    i trafia na listę do sprawdzenia. To dziś największa luka wyceny automatycznej.
12. **Naddatek na dennice** - w starym arkuszu dennice były w sekcji blach (5%), w nowej metodzie są osobną kategorią.
    *Założenie: 0% (kupowane jako gotowe wyroby).*
13. **Dopisek „+ 5 zł/kg” przy cenie jednostkowej** w jednej z notatek - opcja, dopłata, tolerancja masy?
14. **Jakość skanów rysunków.** Skany arkuszy A1 zapisane jako A4 mają drobne pismo na granicy czytelności (także dla AI).
    Czy przy zapytaniach można prosić klienta o PDF z CAD albo skany w pełnej rozdzielczości? PDF z CAD aplikacja czyta
    z warstwy tekstowej - bez AI i bez kosztów.
15. **Podpisy działów w karcie analizy.** Karta zapisuje, kto i kiedy ją zmienił, ale nie ma osobnego zatwierdzenia przez
    każdy dział (technolog, spawalnik, zaopatrzenie). Czy jest potrzebne? *Założenie: wystarcza historia zmian.*
16. **Materiały do zakupu z wyceny.** Lista zakupowa bierze ilości z wyceny × liczba aparatów, z naddatkiem technologicznym
    kategorii (blachy 5%, odkuwki 2%). Czy dział handlowy ma zamawiać z naddatkiem, czy dokładnie wg listy?
    *Założenie: z naddatkiem kategorii.*

## Do działu handlowego

17. **Numer ZO** - nadawany w Optimie czy w aplikacji? *Założenie: aplikacja nadaje kolejny numer, pole jest edytowalne.*
18. **Osobne formaty ofert dla klientów** (np. formularz cenowy platformy zakupowej klienta) - czy są potrzebne?
19. **Wartość równa 40% ceny** obok ceny w starym arkuszu - zaliczka / przedpłata do przeniesienia do oferty?
20. **Skrzynka na oferty.** Dostawca poczty (Microsoft 365, Gmail, inny) i adres dedykowanej skrzynki (np. oferty@...),
    na którą dostawcy odpowiadają (DW w zapytaniach). W Ustawieniach jest miejsce na podłączenie - na razie maile
    wrzuca się ręcznie (przeciągnięcie .msg/.eml).
21. **Jeden mail na dostawcę.** Generator otwiera osobny mail dla każdego odbiorcy (dostawcy nie widzą się nawzajem).
    *Założenie: tak pracuje dział handlowy.*
22. **Wymagania w zapytaniach do dostawców** (atest 3.1 + PED, producent z UE, udarność, UT/NFT rur, UT odkuwek, naddatki) -
    czy są inne standardowe wymagania (blachy, kołnierze, usługi) albo różne zestawy dla różnych klientów?
23. **Ile ofert na pozycję** zbierać przed wyceną (np. minimum 2-3 dla odkuwek i rur)? *Założenie: aplikacja pokazuje
    liczbę ofert na pozycji, bez progu.*
24. **Oferty wewnętrzne innych wydziałów firmy** (np. montaż na obiekcie) - rejestrować w bazie cen jako „dostawcę
    wewnętrznego”? *Założenie: nie - koszt montażu własnego wpisuje się w wycenie.*
25. **Dostawcy bez nazwy firmy w mailu** (odpowiedź z prywatnej skrzynki) - AI wpisuje wtedy nadawcę z uwagą „nazwa firmy
    do potwierdzenia”. Proszę poprawiać nazwy takich kooperantów w Dostawcach.
26. **Zamówienia u dostawców po wygranej.** Czy zamówienia wystawia się w Optimie (wtedy w aplikacji wpisujemy numer
    zamówienia z Optimy), czy aplikacja ma nadawać własny numer? *Założenie: numer wpisywany ręcznie (np. z Optimy),
    domyślnie „<numer ZO>/Z<n>”.*
27. **Potwierdzenie dostawy.** Kto oznacza dostawę jako przyjętą (magazyn, zaopatrzenie)? Czy karta dostawy z Optimy
    ma automatycznie zamykać pozycje zamówienia? *Założenie: oznacza dział handlowy; przy imporcie karty dostawy
    aplikacja podpowiada pasujące pozycje.*
28. **Statusy zapytania.** Zapis karty analizy przesuwa zapytanie z „nowe” do „w analizie”, przygotowanie wyceny do
    „kalkulacja”. *Założenie: tak; status można zawsze zmienić ręcznie.*

## Do administratora / właściciela konta Supabase

29. **Ustawienia logowania w Supabase** wymagają roli Owner/Administrator w organizacji (konto aplikacji ma niższą rolę):
    - Sign In / Providers → **Allow new users to sign up: wyłączyć** (konta zakłada tylko administrator aplikacji),
    - URL Configuration → **Site URL** i **Redirect URLs**: adres aplikacji na GitHub Pages
      (bez tego link „nie pamiętam hasła” nie zadziała).
    *Zabezpieczenie na czas przejściowy: konto założone samodzielnie nie dostaje profilu, więc nie widzi żadnych danych
    i nie może wywołać AI (sprawdza test bezpieczeństwa).*
30. ~~Sekret `ANTHROPIC_API_KEY`~~ - *załatwione: nowy klucz pod właściwą nazwą (2026-10-19).*
31. **Lista e-maili pierwszych użytkowników i ich role.**
32. **Nazwa repozytorium i adres aplikacji.** Adres GitHub Pages zawiera nazwę repozytorium. Po zmianie nazwy repozytorium
    trzeba uaktualnić Site URL i Redirect URLs w Supabase (pkt 29).

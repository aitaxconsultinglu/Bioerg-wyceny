// Obliczenia wyceny - jeden czysty moduł bez zależności od bazy i interfejsu.
// Jednostki: wymiary w mm, gęstość w kg/dm³, masa w kg, kwoty w PLN.

export const GESTOSC_WEGLOWA = 7.85
export const GESTOSC_NIERDZEWNA = 7.93

/** mm³ -> dm³ */
const MM3_NA_DM3 = 1e-6

/** Blacha / arkusz / wypałka prostokątna: g × b × l × ρ. */
export function masaBlachy(g: number, b: number, l: number, gestosc: number): number {
  return g * b * l * gestosc * MM3_NA_DM3
}

/** Krążek albo pierścień (sito, odkuwka, kołnierz z odkuwki): π/4 × (D² − d²) × h × ρ. */
export function masaKrazka(D: number, d: number, h: number, gestosc: number): number {
  return (Math.PI / 4) * (D * D - d * d) * h * gestosc * MM3_NA_DM3
}

/** Rura: π × (D − s) × s × l × ρ. */
export function masaRury(D: number, s: number, l: number, gestosc: number): number {
  return Math.PI * (D - s) * s * l * gestosc * MM3_NA_DM3
}

/** Pręt okrągły: π/4 × d² × l × ρ. */
export function masaPreta(d: number, l: number, gestosc: number): number {
  return (Math.PI / 4) * d * d * l * gestosc * MM3_NA_DM3
}

export type SposobMasy = 'blacha' | 'krazek' | 'rura' | 'pret' | 'brak'

export interface Wymiary {
  d_zew?: number | null
  d_wew?: number | null
  grubosc?: number | null
  szerokosc?: number | null
  dlugosc?: number | null
}

/**
 * Masa jednostkowa z wymiarów wg sposobu liczenia kategorii. Zwraca null, gdy brakuje wymiarów.
 * Krążek bez d_wew = pełny krążek; rura bez długości = masa 1 m (dla pozycji w metrach).
 */
export function masaZWymiarow(sposob: SposobMasy, w: Wymiary, gestosc: number): number | null {
  const D = w.d_zew ?? 0
  const d = w.d_wew ?? 0
  const g = w.grubosc ?? 0
  switch (sposob) {
    case 'blacha':
      return g > 0 && (w.szerokosc ?? 0) > 0 && (w.dlugosc ?? 0) > 0 ? masaBlachy(g, w.szerokosc!, w.dlugosc!, gestosc) : null
    case 'krazek':
      return D > 0 && g > 0 && d < D ? masaKrazka(D, d, g, gestosc) : null
    case 'rura':
      return D > 0 && g > 0 && g < D / 2 ? masaRury(D, g, (w.dlugosc ?? 0) > 0 ? w.dlugosc! : 1000, gestosc) : null
    case 'pret':
      return D > 0 ? masaPreta(D, (w.dlugosc ?? 0) > 0 ? w.dlugosc! : 1000, gestosc) : null
    default:
      return null
  }
}

/** Zaokrąglenie do najbliższej wielokrotności (0 = bez zaokrąglenia). */
export function zaokraglij(kwota: number, krok: number): number {
  if (!krok) return Math.round(kwota * 100) / 100
  return Math.round(kwota / krok) * krok
}

/** Zaokrąglenie do groszy bez błędów zmiennoprzecinkowych typu 0,1 + 0,2. */
export function grosze(kwota: number): number {
  return Math.round((kwota + Number.EPSILON) * 100) / 100
}

// =================================================================================================
// Wycena - metoda wzorowana na dotychczasowym arkuszu wyceny firmy
// Wszystkie kwoty aparatu liczone dla 1 sztuki, potem × ilość sztuk.
// =================================================================================================

export type Zakladka = 'materialy' | 'robocizna' | 'kooperacja' | 'projekt' | 'badania' | 'transport' | 'inne'
export type JednostkaCeny = 'kg' | 'm' | 'jm'

export interface PozycjaKalk {
  id?: number | string
  zakladka: Zakladka
  sekcja: string | null
  nazwa: string
  gatunek?: string | null
  d_zew?: number | null
  d_wew?: number | null
  grubosc?: number | null
  szerokosc?: number | null
  dlugosc?: number | null
  ilosc: number
  jm: string
  masa_jedn?: number | null
  masa_reczna?: boolean
  cena_jedn: number
  jednostka_ceny: JednostkaCeny
  wartosc_reczna?: number | null
  cena_za_komplet?: boolean
  opcjonalna?: boolean
  wariant?: string | null
  dodatkowe?: { km?: number | null } & Record<string, unknown>
  zrodlo_ceny?: 'oferta' | 'zakup' | 'recznie'
  zrodlo_data?: string | null
  zrodlo_waznosc_do?: string | null
  zrodlo_termin_dni?: number | null
}

export interface AparatKalk {
  id?: string
  nazwa: string
  ilosc: number
  masa_netto_kg: number | null
  metoda_robocizny: 'szczegolowa' | 'wskaznikowa'
  wskaznik_rbh_t: number | null
  stawka_wskaznikowa: number | null
  liczba_osob: number | null
  /** Naddatek technologiczny [%] na sekcję materiałów - nadpisuje domyślny z kategorii. */
  naddatki: Record<string, number>
  pozycje: PozycjaKalk[]
}

export interface ParametryKalk {
  narzut_zakupowy_proc: number
  narzut_kooperacja_proc: number
  /** Brak = użytkownik bez dostępu do marż: liczymy tylko koszty. */
  narzut_zysk_proc?: number | null
  zaokraglenie?: number | null
  korekta_prezesa_kwota?: number | null
  korekta_prezesa_proc?: number | null
  kurs_eur?: number | null
  /** Sposób liczenia masy dla sekcji (kategorii materiału). */
  sposobMasy: (sekcja: string | null) => SposobMasy
  /** Gęstość gatunku [kg/dm³]. */
  gestosc: (gatunek: string | null | undefined) => number
  /** Domyślny naddatek kategorii [%]. */
  naddatekDomyslny: (sekcja: string | null) => number
}

export interface WynikPozycji {
  masa_jedn: number | null
  masa_calk: number
  /** Masa wyliczona z wymiarów (a nie wpisana). */
  masa_z_wymiarow: boolean
  koszt: number
  /** rbh (robocizna) - dla pozostałych 0. */
  rbh: number
}

/** Długość pozycji w metrach - do ceny za metr (rury: sztuki × długość albo metry wprost). */
function metry(p: PozycjaKalk) {
  const jm = p.jm.toLowerCase().replace('.', '')
  if (jm === 'm' || jm === 'mb') return p.ilosc
  return p.dlugosc ? p.ilosc * (p.dlugosc / 1000) : p.ilosc
}

export function policzPozycje(p: PozycjaKalk, par: ParametryKalk): WynikPozycji {
  if (p.zakladka !== 'materialy') {
    const km = Number(p.dodatkowe?.km ?? 0)
    // Transport: km × liczba kursów × stawka zł/km (jak w dotychczasowym arkuszu); inne: ilość × cena.
    const koszt = p.wartosc_reczna ?? (p.zakladka === 'transport' && km > 0 ? km * p.ilosc * p.cena_jedn : p.ilosc * p.cena_jedn)
    return { masa_jedn: null, masa_calk: 0, masa_z_wymiarow: false, koszt, rbh: p.zakladka === 'robocizna' ? p.ilosc : 0 }
  }
  const jm = p.jm.toLowerCase().replace('.', '')
  let masaJedn = p.masa_jedn ?? null
  let zWymiarow = false
  if (!p.masa_reczna) {
    const sposob = par.sposobMasy(p.sekcja)
    // Pozycja w metrach: masa 1 m (długość handlowa sztuki nie ma znaczenia).
    const wym = jm === 'm' || jm === 'mb' ? { ...p, dlugosc: 1000 } : p
    const wyliczona = masaZWymiarow(sposob, wym, par.gestosc(p.gatunek))
    if (wyliczona !== null) { masaJedn = wyliczona; zWymiarow = true }
  }
  if (jm === 'kg') { masaJedn = 1; zWymiarow = false }
  const masaCalk = (masaJedn ?? 0) * p.ilosc
  let koszt: number
  if (p.wartosc_reczna !== null && p.wartosc_reczna !== undefined) koszt = p.wartosc_reczna
  else if (p.jednostka_ceny === 'kg') koszt = masaCalk * p.cena_jedn
  else if (p.jednostka_ceny === 'm') koszt = metry(p) * p.cena_jedn
  else koszt = p.ilosc * p.cena_jedn
  return { masa_jedn: masaJedn, masa_calk: masaCalk, masa_z_wymiarow: zWymiarow, koszt, rbh: 0 }
}

export interface SekcjaMaterialow {
  sekcja: string
  koszt: number
  naddatek_proc: number
  naddatek: number
  razem: number
  masa: number
}

export interface KosztyAparatu {
  /** Dla 1 sztuki. */
  materialy: { sekcje: SekcjaMaterialow[]; koszt: number; masa_brutto: number; narzut_zakupowy: number; razem: number }
  robocizna: { metoda: 'szczegolowa' | 'wskaznikowa'; rbh: number; wartosc: number; rbh_na_t: number | null; srednia_stawka: number | null; dni: number | null }
  kooperacja: { koszt: number; narzut: number; razem: number }
  /** Badania, odbiory, transport, projekt, inne. */
  badania: { projekt: number; badania: number; transport: number; inne: number; razem: number }
  koszt_szt: number
  ilosc: number
  koszt: number
  masa_netto_kg: number
}

/** Koszty aparatu. `bezOpcji` pomija pozycje oznaczone jako opcjonalne (wariant oferty). */
export function policzAparat(a: AparatKalk, par: ParametryKalk, bezOpcji = false): KosztyAparatu {
  const pozycje = bezOpcji ? a.pozycje.filter((p) => !p.opcjonalna) : a.pozycje
  const wyniki = pozycje.map((p) => ({ p, w: policzPozycje(p, par) }))
  const suma = (z: Zakladka) => wyniki.filter((x) => x.p.zakladka === z).reduce((s, x) => s + x.w.koszt, 0)

  // Materiały: sekcje w kolejności pojawienia się, naddatek % od sumy sekcji (jak w dotychczasowym arkuszu).
  const mapa = new Map<string, SekcjaMaterialow>()
  for (const { p, w } of wyniki.filter((x) => x.p.zakladka === 'materialy')) {
    const kod = p.sekcja ?? 'inne'
    const s = mapa.get(kod) ?? { sekcja: kod, koszt: 0, naddatek_proc: a.naddatki[kod] ?? par.naddatekDomyslny(kod), naddatek: 0, razem: 0, masa: 0 }
    s.koszt += w.koszt
    s.masa += w.masa_calk
    mapa.set(kod, s)
  }
  const sekcje = [...mapa.values()].map((s) => {
    const naddatek = s.koszt * s.naddatek_proc / 100
    return { ...s, naddatek, razem: s.koszt + naddatek }
  })
  const kosztMat = sekcje.reduce((s, x) => s + x.razem, 0)
  const narzutZak = kosztMat * par.narzut_zakupowy_proc / 100

  // Robocizna
  const masaT = (a.masa_netto_kg ?? 0) / 1000
  const wierszeRob = wyniki.filter((x) => x.p.zakladka === 'robocizna')
  let rbh: number
  let wartoscRob: number
  if (a.metoda_robocizny === 'wskaznikowa') {
    rbh = masaT * (a.wskaznik_rbh_t ?? 0)
    wartoscRob = rbh * (a.stawka_wskaznikowa ?? 0)
  } else {
    rbh = wierszeRob.reduce((s, x) => s + x.w.rbh, 0)
    wartoscRob = wierszeRob.reduce((s, x) => s + x.w.koszt, 0)
  }
  const osoby = a.liczba_osob && a.liczba_osob > 0 ? a.liczba_osob : null

  const koop = suma('kooperacja')
  const narzutKoop = koop * par.narzut_kooperacja_proc / 100
  const bad = { projekt: suma('projekt'), badania: suma('badania'), transport: suma('transport'), inne: suma('inne'), razem: 0 }
  bad.razem = bad.projekt + bad.badania + bad.transport + bad.inne

  const kosztSzt = wartoscRob + kosztMat + narzutZak + koop + narzutKoop + bad.razem
  return {
    materialy: { sekcje, koszt: kosztMat, masa_brutto: sekcje.reduce((s, x) => s + x.masa, 0), narzut_zakupowy: narzutZak, razem: kosztMat + narzutZak },
    robocizna: {
      metoda: a.metoda_robocizny, rbh, wartosc: wartoscRob,
      rbh_na_t: masaT > 0 ? rbh / masaT : null,
      srednia_stawka: rbh > 0 ? wartoscRob / rbh : null,
      dni: osoby ? rbh / 8 / osoby : null,
    },
    kooperacja: { koszt: koop, narzut: narzutKoop, razem: koop + narzutKoop },
    badania: bad,
    koszt_szt: kosztSzt,
    ilosc: a.ilosc,
    koszt: kosztSzt * a.ilosc,
    masa_netto_kg: (a.masa_netto_kg ?? 0) * a.ilosc,
  }
}

export interface PozycjaPodsumowania { koszt: number; zl_kg: number | null; udzial: number }

export interface WynikWyceny {
  aparaty: (KosztyAparatu & { nazwa: string; cena_szt: number | null; cena: number | null })[]
  robocizna: PozycjaPodsumowania
  materialy: PozycjaPodsumowania
  kooperacja: PozycjaPodsumowania
  badania: PozycjaPodsumowania
  koszty: PozycjaPodsumowania
  masa_kg: number
  /** Pola cenowe - tylko gdy podano narzut zysku (użytkownik widzi marże). */
  zysk_proc: number | null
  zysk: number | null
  cena: number | null
  korekta: number | null
  cena_koncowa: number | null
  cena_koncowa_zl_kg: number | null
  cena_koncowa_eur: number | null
  /** Cena bez pozycji opcjonalnych (wariant), bez korekty prezesa. */
  cena_bez_opcji: number | null
  ma_opcje: boolean
}

function pozycjaPodsumowania(koszt: number, masa: number, calosc: number): PozycjaPodsumowania {
  return { koszt, zl_kg: masa > 0 ? koszt / masa : null, udzial: calosc > 0 ? koszt / calosc : 0 }
}

function cenaAparatu(k: KosztyAparatu, par: ParametryKalk) {
  if (par.narzut_zysk_proc === null || par.narzut_zysk_proc === undefined) return null
  return zaokraglij(k.koszt_szt * (1 + par.narzut_zysk_proc / 100), par.zaokraglenie ?? 0)
}

export function policzWycene(aparaty: AparatKalk[], par: ParametryKalk): WynikWyceny {
  const koszty = aparaty.map((a) => policzAparat(a, par))
  const suma = (f: (k: KosztyAparatu) => number) => koszty.reduce((s, k) => s + f(k) * k.ilosc, 0)
  const rob = suma((k) => k.robocizna.wartosc)
  const mat = suma((k) => k.materialy.razem)
  const koop = suma((k) => k.kooperacja.razem)
  const bad = suma((k) => k.badania.razem)
  const calosc = rob + mat + koop + bad
  const masa = koszty.reduce((s, k) => s + k.masa_netto_kg, 0)

  const zAparatami = koszty.map((k, i) => {
    const cenaSzt = cenaAparatu(k, par)
    return { ...k, nazwa: aparaty[i].nazwa, cena_szt: cenaSzt, cena: cenaSzt === null ? null : cenaSzt * k.ilosc }
  })
  const maMarze = par.narzut_zysk_proc !== null && par.narzut_zysk_proc !== undefined
  const cena = maMarze ? zAparatami.reduce((s, a) => s + (a.cena ?? 0), 0) : null
  const korekta = cena === null ? null : (par.korekta_prezesa_kwota ?? 0) + cena * (par.korekta_prezesa_proc ?? 0) / 100
  const cenaKoncowa = cena === null ? null : grosze(cena + (korekta ?? 0))
  const maOpcje = aparaty.some((a) => a.pozycje.some((p) => p.opcjonalna))
  const cenaBezOpcji = maMarze && maOpcje
    ? aparaty.reduce((s, a) => s + (cenaAparatu(policzAparat(a, par, true), par) ?? 0) * a.ilosc, 0)
    : null

  return {
    aparaty: zAparatami,
    robocizna: pozycjaPodsumowania(rob, masa, calosc),
    materialy: pozycjaPodsumowania(mat, masa, calosc),
    kooperacja: pozycjaPodsumowania(koop, masa, calosc),
    badania: pozycjaPodsumowania(bad, masa, calosc),
    koszty: pozycjaPodsumowania(calosc, masa, calosc),
    masa_kg: masa,
    zysk_proc: maMarze ? par.narzut_zysk_proc! : null,
    zysk: cena === null ? null : cena - calosc,
    cena,
    korekta,
    cena_koncowa: cenaKoncowa,
    cena_koncowa_zl_kg: cenaKoncowa !== null && masa > 0 ? cenaKoncowa / masa : null,
    cena_koncowa_eur: cenaKoncowa !== null && par.kurs_eur ? cenaKoncowa / par.kurs_eur : null,
    cena_bez_opcji: cenaBezOpcji,
    ma_opcje: maOpcje,
  }
}

// --- Ostrzeżenia ------------------------------------------------------------------------------------
export type RodzajOstrzezenia = 'brak_ceny' | 'stara_cena' | 'ryzyko_cenowe' | 'termin_dostawy' | 'kpl_bez_masy'

export interface Ostrzezenie {
  rodzaj: RodzajOstrzezenia
  aparat: string
  pozycja: string
  pozycja_id?: number | string
  opis: string
}

export interface ParametryOstrzezen {
  dzis: string                         // YYYY-MM-DD
  wiek_ceny_mies: number               // cena starsza = ostrzeżenie
  ryzyko_dni: number                   // oferta dostawcy ważna krócej niż tyle dni
  waznosc_oferty_klienta_dni: number   // nasza oferta - jak długo ma trzymać cenę
  termin_realizacji_tyg?: number | null
  montaz_tyg?: number | null
}

const dniMiedzy = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)

export function ostrzezenia(aparaty: AparatKalk[], o: ParametryOstrzezen): Ostrzezenie[] {
  const wynik: Ostrzezenie[] = []
  for (const a of aparaty) {
    for (const p of a.pozycje) {
      const nazwa = p.nazwa || p.sekcja || '(bez nazwy)'
      const dodaj = (rodzaj: RodzajOstrzezenia, opis: string) => wynik.push({ rodzaj, aparat: a.nazwa, pozycja: nazwa, pozycja_id: p.id, opis })
      const robWsk = p.zakladka === 'robocizna' && a.metoda_robocizny === 'wskaznikowa'
      if (!robWsk && p.nazwa.trim() && !p.cena_jedn && (p.wartosc_reczna === null || p.wartosc_reczna === undefined)) {
        dodaj('brak_ceny', 'Brak ceny.')
      }
      if (p.zakladka === 'materialy' && p.jm.toLowerCase().replace('.', '') === 'kpl' && !p.masa_jedn && !p.cena_za_komplet) {
        dodaj('kpl_bez_masy', 'Komplet bez masy - podaj masę albo zaznacz „cena za komplet”.')
      }
      if (p.zrodlo_data) {
        const mies = dniMiedzy(p.zrodlo_data, o.dzis) / 30.44
        if (mies >= o.wiek_ceny_mies) dodaj('stara_cena', `Cena z ${p.zrodlo_data} - starsza niż ${o.wiek_ceny_mies} mies.`)
      }
      if (p.zrodlo_ceny === 'oferta' && p.zrodlo_waznosc_do) {
        const waznaDni = p.zrodlo_data ? dniMiedzy(p.zrodlo_data, p.zrodlo_waznosc_do) : null
        const wygasa = dniMiedzy(o.dzis, p.zrodlo_waznosc_do)
        if (wygasa < 0) dodaj('ryzyko_cenowe', `Oferta dostawcy wygasła ${p.zrodlo_waznosc_do}.`)
        else if ((waznaDni !== null && waznaDni <= o.ryzyko_dni) || wygasa < o.waznosc_oferty_klienta_dni) {
          dodaj('ryzyko_cenowe', `Oferta dostawcy ważna do ${p.zrodlo_waznosc_do}, a nasza oferta ma trzymać cenę ${o.waznosc_oferty_klienta_dni} dni - ryzyko cenowe.`)
        }
      }
      if (p.zrodlo_termin_dni && o.termin_realizacji_tyg) {
        const dostepne = (o.termin_realizacji_tyg - (o.montaz_tyg ?? 0)) * 7
        if (p.zrodlo_termin_dni > dostepne) {
          dodaj('termin_dostawy', `Termin dostawy ${p.zrodlo_termin_dni} dni przekracza czas na wykonanie (${dostepne} dni).`)
        }
      }
    }
  }
  return wynik
}

// Szablony materiałowe etapu 1: dla wymiennika płaszczowo-rurowego i zbiornika każda wycena ma ten sam zestaw
// elementów (płaszcz, dennice, ściany sitowe, rurki, kołnierze, króćce...). Pozycje z rysunku są przypisywane do
// elementów, brakujące elementy wymagane dostają wiersz "do uzupełnienia" - wyceny tego samego typu są porównywalne.
// Elementy odwzorowują to, co kupowano do takich aparatów (karty dostawy Optimy) i kategorie materiałów z Ustawień.
import { klucz, type PozycjaWyceny } from './wyceny'

export interface ElementSzablonu {
  kod: string
  nazwa: string
  /** Kategoria materiału (kategorie_materialow.kod) nowego wiersza i kategorie pasujące do elementu. */
  sekcje: string[]
  wymagany: boolean
  /** Rozpoznanie pozycji po nazwie (PL i EN - rysunki bywają dwujęzyczne). */
  wzorzec: RegExp
  jednostka_ceny: 'kg' | 'm' | 'jm'
  jm: string
}

export interface Szablon { kod: 'wymiennik' | 'zbiornik'; nazwa: string; elementy: ElementSzablonu[] }

const E = (kod: string, nazwa: string, sekcje: string[], wymagany: boolean, wzorzec: RegExp, jednostka_ceny: ElementSzablonu['jednostka_ceny'] = 'kg', jm = 'szt'): ElementSzablonu =>
  ({ kod, nazwa, sekcje, wymagany, wzorzec, jednostka_ceny, jm })

// Kolejność elementów = kolejność w wycenie; przy rozpoznaniu po nazwie pierwsze dopasowanie wygrywa
// (np. "rura króćca" to króciec, nie rurka wymiennika) - z pierwszeństwem z kolejnoscRozpoznania.
const KROCCE = E('krocce', 'Króćce (rury króćców)', ['rury_krocce'], true, /kró[cć]|kroc|nozzle(?! ?flange)|szyjk|neck|rura kr/i, 'm', 'm')
const KOLNIERZE = E('kolnierze', 'Kołnierze', ['kolnierze'], true, /kołnierz|kolnierz|flange|zaślep|blind/i, 'jm', 'szt')
const ZLACZNE = E('zlaczne', 'Śruby, nakrętki, podkładki', ['zlaczne'], true, /śrub|srub|szpilk|nakręt|nakret|podkład|stud|bolt|nut|washer/i, 'jm', 'kpl')
const USZCZELKI = E('uszczelki', 'Uszczelki', ['uszczelki'], true, /uszczel|gasket|packing/i, 'jm', 'kpl')
const WZMOCNIENIA = E('wzmocnienia', 'Wzmocnienia, nakładki, pierścienie', ['blachy'], false, /wzmoc|nakład|nakladk|reinf|pierście|pierscien|ring|wear plate|stif/i)
const INNE = E('inne', 'Inne (tabliczka, uchwyty transportowe, uziemienie)', ['inne'], false, /tablicz|uch[wy]|lifting|lug|uziem|earth|eye bolt|nameplate/i, 'jm', 'szt')

export const SZABLONY: Record<Szablon['kod'], Szablon> = {
  wymiennik: {
    kod: 'wymiennik', nazwa: 'Wymiennik płaszczowo-rurowy',
    elementy: [
      KROCCE, KOLNIERZE,
      E('sciany_sitowe', 'Ściany sitowe', ['odkuwki', 'blachy'], true, /sit[oa]|tube ?sheet/i),
      E('rurki', 'Rurki wymiennika', ['rury_technologiczne'], true, /rurk|^tubes?$|^tube\b|rury? (technolog|wymienn)|u-rur/i, 'm', 'm'),
      E('plaszcz', 'Płaszcz', ['blachy'], true, /płaszcz|plaszcz|shell(?! ?(flange|side))|wirol/i),
      E('dennice', 'Dennice, denka, pokrywy komór', ['dennice', 'blachy'], true, /denn|denk|\bdn[oa]\b|head(?! ?flange)|pokryw|cover|channel/i, 'jm', 'szt'),
      E('przegrody', 'Przegrody i płyty wsporcze', ['blachy'], true, /przegrod|baffle|support plate|płyt.*wspor|pass partition/i),
      E('pręty', 'Ściągi i odległościówki', ['prety'], false, /ściąg|sciag|odległoś|odleglos|tie rod|spacer|pręt|pret/i, 'm', 'm'),
      E('podpory', 'Podpory / siodła', ['blachy', 'ksztaltowniki'], true, /siodł|siodl|saddle|podpor|łap|support(?! plate)/i),
      WZMOCNIENIA, ZLACZNE, USZCZELKI, INNE,
    ],
  },
  zbiornik: {
    kod: 'zbiornik', nazwa: 'Zbiornik',
    elementy: [
      KROCCE, KOLNIERZE,
      E('wlazy', 'Włazy', ['inne'], false, /właz|wlaz|manhole|drzwiczk/i, 'jm', 'szt'),
      E('plaszcz', 'Płaszcz', ['blachy'], true, /płaszcz|plaszcz|shell|wirol|pas\b/i),
      E('dna', 'Dno / dennice', ['dennice', 'blachy'], true, /denn|\bdno\b|\bdna\b|bottom|head/i),
      E('dach', 'Dach / pokrywa', ['blachy', 'dennice'], false, /dach|roof|pokryw|cover/i),
      E('konstrukcja', 'Konstrukcja wsporcza (nogi, łapy, siodła)', ['ksztaltowniki', 'blachy'], true, /nog|łap|lap|wspor|podpor|support|leg|saddle|siodł|konstrukc/i, 'kg', 'kg'),
      E('komunikacja', 'Podesty, drabiny, poręcze', ['ksztaltowniki', 'inne'], false, /podest|drabin|porę|porecz|barier|schod|klatk|krat|platform|ladder|handrail/i, 'kg', 'kg'),
      WZMOCNIENIA, ZLACZNE, USZCZELKI, INNE,
    ],
  },
}

/** Szablon dla typu aparatu z wyceny (wymiennik / wkład rurowy -> wymiennik, zbiornik pionowy / poziomy -> zbiornik). */
export function szablonDlaTypu(typ: string | null | undefined): Szablon | null {
  if (!typ) return null
  if (/wymiennik|wkład|wklad/i.test(typ)) return SZABLONY.wymiennik
  if (/zbiornik/i.test(typ)) return SZABLONY.zbiornik
  return null
}

// Rozpoznanie po nazwie: najpierw elementy, których nazwa często zawiera nazwę innego elementu
// ("uszczelka kołnierza", "śruby włazu", "nakładka króćca"), potem pozostałe w kolejności szablonu.
const PIERWSZENSTWO = ['zlaczne', 'uszczelki', 'kolnierze', 'wzmocnienia']
const kolejnoscRozpoznania = (s: Szablon) => [
  ...PIERWSZENSTWO.map((k) => s.elementy.find((e) => e.kod === k)).filter((e): e is ElementSzablonu => !!e),
  ...s.elementy.filter((e) => !PIERWSZENSTWO.includes(e.kod)),
]

/** Element szablonu pozycji: zapisany w dodatkowe.element, potem po nazwie, potem po kategorii. */
export function elementPozycji(p: Pick<PozycjaWyceny, 'nazwa' | 'sekcja' | 'dodatkowe'>, s: Szablon): ElementSzablonu | null {
  const zapisany = (p.dodatkowe as { element?: string } | undefined)?.element
  if (zapisany) return s.elementy.find((e) => e.kod === zapisany) ?? null
  const poNazwie = kolejnoscRozpoznania(s).find((e) => e.wzorzec.test(p.nazwa))
  if (poNazwie) return poNazwie
  return s.elementy.find((e) => e.sekcje[0] === p.sekcja) ?? null
}

export interface StanElementu { element: ElementSzablonu; pozycji: number; zWartoscia: number; brak: boolean }

/** Kompletność wyceny wg szablonu: ile pozycji ma każdy element i czy wymagany element ma choć jedną pozycję z ilością. */
export function kompletnosc(pozycje: PozycjaWyceny[], s: Szablon): StanElementu[] {
  const mat = pozycje.filter((p) => p.zakladka === 'materialy')
  return s.elementy.map((element) => {
    const moje = mat.filter((p) => elementPozycji(p, s)?.kod === element.kod)
    const zWartoscia = moje.filter((p) => Number(p.ilosc) > 0 && (Number(p.cena_jedn) > 0 || Number(p.wartosc_reczna ?? 0) > 0)).length
    return { element, pozycji: moje.length, zWartoscia, brak: element.wymagany && moje.length === 0 }
  })
}

/** Wiersz "do uzupełnienia" dla elementu szablonu (gatunek z tabeli materiałów rysunku, jeśli jest). */
export function wierszElementu(e: ElementSzablonu, gatunek: string | null = null): PozycjaWyceny {
  return {
    klucz: klucz(), lp: 0, zakladka: 'materialy', sekcja: e.sekcje[0], nazwa: e.nazwa, gatunek, ilosc: 0, jm: e.jm,
    cena_jedn: 0, jednostka_ceny: e.jednostka_ceny, zrodlo_ceny: 'recznie', masa_reczna: false,
    uwagi: 'element szablonu - uzupełnij ilość / masę z rysunku', dodatkowe: { element: e.kod, szablon: true },
  }
}

/** Pozycje uporządkowane wg elementów szablonu (materiały), z zapisanym elementem; pozostałe zakładki bez zmian. */
export function ulozWgSzablonu(pozycje: PozycjaWyceny[], s: Szablon): PozycjaWyceny[] {
  const kolejnosc = (p: PozycjaWyceny) => {
    const e = elementPozycji(p, s)
    return e ? s.elementy.indexOf(e) : s.elementy.length
  }
  const mat = pozycje.filter((p) => p.zakladka === 'materialy')
    .map((p) => {
      const e = elementPozycji(p, s)
      return e ? { ...p, dodatkowe: { ...(p.dodatkowe ?? {}), element: e.kod } } : p
    })
    .sort((a, b) => kolejnosc(a) - kolejnosc(b))
  return [...mat, ...pozycje.filter((p) => p.zakladka !== 'materialy')]
}

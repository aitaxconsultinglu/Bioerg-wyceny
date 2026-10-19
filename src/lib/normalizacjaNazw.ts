// Normalizacja nazw materiałów z kart dostawy Optimy i ofert: kategoria, gatunek, wymiary.
// Reguły zamiast AI - tanio i przewidywalnie. Niejasne przypadki dostają pewność "niska"
// i można je poprawić ręcznie (albo przepuścić przez AI w trybie normalizuj_pozycje).
import { GESTOSC_NIERDZEWNA, GESTOSC_WEGLOWA, masaBlachy, masaKrazka, masaPreta, masaRury } from './kalkulacja'

export type RodzajPozycji = 'material' | 'usluga' | 'doplata' | 'pomocnicze'

export interface PozycjaZnormalizowana {
  rodzaj: RodzajPozycji
  kategoria: string | null          // kategorie_materialow.kod
  kategoria_uslugi: string | null   // kategorie_uslug.kod
  typ_elementu: string | null
  gatunek: string | null
  norma: string | null
  d_zew: number | null
  d_wew: number | null
  grubosc: number | null
  szerokosc: number | null
  dlugosc: number | null
  dn: string | null
  pn: string | null
  klasa: string | null
  bez_szwu: boolean | null
  pewnosc: 'wysoka' | 'niska'
}

const liczba = (s: string | undefined) => (s === undefined ? null : Number(s.replace(',', '.')))

/** Wielkie litery, bez znaków "|" z wydruku Optimy i wielokrotnych spacji. */
function oczysc(nazwa: string) {
  return nazwa.replace(/[|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim()
}

const GATUNKI: RegExp[] = [
  /\b1\.4\d{3}(?:\s?\/\s?1\.4\d{3})?/,
  /\bP\d{3}(?:NL[12]|NH|GH|QL\d?|N)(?:\s?\/\s?(?:P\d{3})?NL?[12])?(?:\+N)?/,
  /\bS\d{3}J[R0-2](?:\+?N|G\d)?\b/,
  /\bS?A-?\s?516\s?GR\.?\s?\d{2}\b/,
  /\b(?:S?A)-?\s?350\s?(?:GR\.?\s?)?LF\s?\d\b/,
  /\b(?:S?A)-?\s?10[56](?:\s?GR\.?\s?[ABC])?\b/,
  /\b16MO3\b|\b13CRMO4-5\b|\b10CRMO9-10\b|\b15MO3\b/,
  /\b(?:AISI\s?)?3(?:04|16|21)L?\b/,
  /\bA[24](?:-\d{2})?\b/,
]

/** Ładny zapis gatunku: "A-350 GR. LF2" -> "A350 LF2", "SA 516 GR70" -> "SA516Gr70". */
function zapisGatunku(surowy: string) {
  let g = surowy.replace(/\s+/g, ' ').trim()
  g = g.replace(/^(S?A)-?\s?350\s?(?:GR\.?\s?)?LF\s?(\d)$/, '$1350 LF$2')
  g = g.replace(/^(S?A)-?\s?516\s?GR\.?\s?(\d{2})$/, '$1516Gr$2').replace(/^A516/, 'SA516')
  g = g.replace(/^(S?A)-?\s?(10[56])(?:\s?GR\.?\s?([ABC]))?$/, (_, a, n, gr) => `${a}${n}${gr ? ` Gr.${gr}` : ''}`)
  g = g.replace(/^AISI\s?/, '').replace(/\s?\/\s?/g, '/')
  g = g.replace(/CRMO/g, 'CrMo').replace(/MO3/g, 'Mo3')
  return g
}

export function znajdzGatunek(nazwaWielkimi: string): string | null {
  for (const w of GATUNKI) {
    const m = w.exec(nazwaWielkimi)
    if (m) return zapisGatunku(m[0])
  }
  return null
}

export function jestNierdzewny(gatunek: string | null, nazwa = ''): boolean {
  return /1\.4\d{3}|\b3(04|16|21)L?\b|\bA[24]\b|NIERDZ|INOX|KWASO/i.test(`${gatunek ?? ''} ${nazwa}`)
}

export function gestoscZNazwy(gatunek: string | null, nazwa = ''): number {
  return jestNierdzewny(gatunek, nazwa) ? GESTOSC_NIERDZEWNA : GESTOSC_WEGLOWA
}

const NORMA = /\b(?:PN-)?EN(?:\s?ISO)?\s?\d{3,5}(?:-\d+)?\b|\bASTM\s?A\s?\d{2,4}\b|\bDIN\s?\d{2,5}\b|\bISO\s?\d{3,5}(?:-\d+)?\b/

// Dopłaty do zamówienia materiałowego (ZM): atesty, transport, kurier. W zamówieniu usługi (ZJ)
// transport jest usługą projektu, nie dopłatą. Wzorce zakotwiczone na początku nazwy, żeby
// np. "uchwyt transportowy" nie stał się dopłatą.
const DOPLATA = /^(ATEST|ŚWIADECTWO|SWIADECTWO|CERTYFIKAT)|^(USŁUGA |USLUGA |KOSZT |KOSZTY )?(TRANSPORT|TRANSPRT)|^KURIER|^PRZESYŁKA|^PRZESYLKA|^WYSYŁKA|^OPAKOWANIE|^PALETA/
const USLUGA = /^(USŁUG|USLUG|WYKONANIE|PRZYJAZD|MONTAŻ|MONTAZ|DEMONTAŻ|IZOLACJA|ZABEZPIECZENIE|OBRÓBKA|OBROBKA|CIĘCIE|CIECIE|GIĘCIE|GIECIE|ZWIJANIE|PIASKOWANIE|ŚRUTOWANIE|SRUTOWANIE|MALOWANIE|TRAWIENIE|PASYWACJA|WYŻARZANIE|PWHT|BADANIE|BADANIA)/
const POMOCNICZE = /PŁYTK[AI]\s+(?:[A-Z]{4}\s?\d{3,6}|\d{6,}|SKRAW)|TARCZ[AY]|DYSK(?:I)? FIBR|ŚCIERN|PĘDZ|PEDZ|TAŚM|TASM|TRYBOTAŚM|WIERTŁ|WIERTL|FREZ|GWINTOWNIK|SZCZOTK|RĘKAWIC|PENETRANT|WYWOŁYWACZ|ZMYWACZ|CZYŚCIW|BRZESZCZOT|PILNIK|OPRAWK|KOŃCÓWK|NOŻE? TOKAR/

function kategoriaUslugi(u: string): string | null {
  if (/TRANSPORT|KURIER/.test(u)) return 'transport'
  if (/DŹWIG|DZWIG|ŻURAW/.test(u)) return 'dzwig'
  if (/DOKUMENTACJ|PROJEKT/.test(u)) return 'projekt'
  if (/INSPEKTOR|UDT|ODBIOR|ODBIÓR|JEDNOSTK[AI] NOTYF/.test(u)) return 'odbiory'
  if (/MONTAŻ|MONTAZ|DEMONTAŻ/.test(u)) return 'montaz'
  if (/IZOLACJ/.test(u)) return 'izolacja'
  if (/SEKAFEN|NOVOTHERM|SEKAPHEN/.test(u)) return 'sekafenowanie'
  if (/ANTYKOROZ|MALOWAN|ŚRUTOWAN|SRUTOWAN|PIASKOWAN/.test(u)) return 'malowanie'
  if (/TRAWIEN|PASYWAC/.test(u)) return 'trawienie'
  if (/PWHT|WYŻARZ|WYZARZ|OBRÓBK[AI] CIEPLN/.test(u)) return 'pwht'
  if (/PRĄD|PRAD|NFT|WIROW/.test(u)) return 'nft'
  if (/RTG|RT\b|UT\b|PT\b|MT\b|NDT|BADANI/.test(u)) return 'ndt'
  if (/PRÓB[AY] CIŚN|PROB[AY] CISN/.test(u)) return 'proba'
  if (/ZWIJAN/.test(u)) return 'zwijanie'
  if (/GIĘCI[AE] RUR|GIECI[AE] RUR/.test(u)) return 'giecie_rur'
  if (/CIĘCI|CIECI|PALENI|LASER|PLAZM/.test(u)) return 'ciecie'
  if (/OBRÓBK|OBROBK|TOCZEN|WIERCEN|FREZOWAN/.test(u)) return 'obrobka'
  if (/PAKOWAN|SKRZYNI/.test(u)) return 'pakowanie'
  return null
}

function kategoriaMaterialu(u: string): { kod: string; typ: string | null; pewna: boolean } {
  if (/WYPAŁK|WYPALK|BLACH|ARKUSZ/.test(u)) return { kod: 'blachy', typ: /WYPAŁK|WYPALK/.test(u) ? 'wypałka' : 'blacha', pewna: true }
  if (/DENNIC/.test(u)) return { kod: 'dennice', typ: 'dennica', pewna: true }
  if (/KOŁNIERZ|KOLNIERZ|FLANSZ/.test(u)) {
    const typ = /SZYJK|\bWN\b/.test(u) ? 'kołnierz szyjkowy' : /ZAŚLEP|ZASLEP|ZASŚEP|\bBL\b/.test(u) ? 'kołnierz zaślepiający'
      : /PŁASK|PLASK|\bSO\b/.test(u) ? 'kołnierz płaski' : /LUŹN|LUZN/.test(u) ? 'kołnierz luźny' : 'kołnierz'
    const forma = /\b(\d{2}[A-F]\d?)\b/.exec(u)?.[1]
    return { kod: 'kolnierze', typ: forma ? `${typ} ${forma}` : typ, pewna: true }
  }
  if (/ODKUWK|KRĄŻEK|KRAZEK|PIERŚCIEŃ|PIERSCIEN|\bDYSK\b/.test(u)) {
    return { kod: 'odkuwki', typ: /PIERŚCIEŃ|PIERSCIEN/.test(u) ? 'pierścień' : 'krążek', pewna: true }
  }
  if (/KOLANO|TRÓJNIK|TROJNIK|REDUKC|MUFA|ZŁĄCZK|ZLACZK|NYPEL|KSZTAŁTK|KSZTALTK/.test(u)) {
    const typ = /KOLANO/.test(u) ? 'kolano' : /TRÓJNIK|TROJNIK/.test(u) ? 'trójnik' : /REDUKC/.test(u) ? 'redukcja' : 'kształtka'
    return { kod: 'rury_krocce', typ, pewna: true }
  }
  if (/\bRUR[AYK]|\bRURK|\bPIPE\b|\bSMLS\b/.test(u)) return { kod: 'rury_technologiczne', typ: 'rura', pewna: true }
  if (/KĄTOWNIK|KATOWNIK|CEOWNIK|DWUTEOWNIK|TEOWNIK|\bIPE\b|\bHE[ABM]\b|\bUPN\b|\bUPE\b|PŁASKOWNIK|PLASKOWNIK|PROFIL|KWADRAT|ZAMKNIĘT|ZAMKNIET/.test(u)) {
    return { kod: 'ksztaltowniki', typ: (/^(\S+)/.exec(u)?.[1] ?? '').toLowerCase(), pewna: true }
  }
  if (/\bPRĘT|\bPRET/.test(u)) return { kod: 'prety', typ: 'pręt', pewna: true }
  if (/ŚRUB|SRUB|NAKRĘTK|NAKRETK|PODKŁADK|PODKLADK|KOTW|SZPILK|\bNIT|KOREK|TULEJK|WKRĘT|WKRET|ŁĄCZNIK/.test(u)) {
    return { kod: 'zlaczne', typ: null, pewna: true }
  }
  if (/USZCZELK|USZCZELNIEN/.test(u)) return { kod: 'uszczelki', typ: 'uszczelka', pewna: true }
  if (/DRUT SPAW|ELEKTROD|TOPNIK|ARGON|GAZ OSŁON|PRĘT SPAW/.test(u)) return { kod: 'spawalnicze', typ: null, pewna: true }
  if (/FARB|GRUNT|EMALI|ROZCIEŃCZ|LAKIER|PODKŁAD EPOK/.test(u)) return { kod: 'antykorozyjne', typ: null, pewna: true }
  return { kod: 'inne', typ: null, pewna: false }
}

/** Wymiary z nazwy - interpretacja zależy od kategorii (rura D×s, kątownik a×a×t, blacha #g b×l...). */
function wymiary(u: string, kod: string) {
  const w = { d_zew: null as number | null, d_wew: null as number | null, grubosc: null as number | null, szerokosc: null as number | null, dlugosc: null as number | null }
  const L = /\bL\s?=\s?(\d+(?:[.,]\d+)?)\s?(MM|M)?\b/.exec(u)
  if (L) {
    const n = liczba(L[1])!
    w.dlugosc = L[2] === 'M' || (!L[2] && n < 30) ? n * 1000 : n
  } else {
    const mb = /\b(\d+(?:[.,]\d+)?)\s?MB\b/.exec(u)
    if (mb) w.dlugosc = liczba(mb[1])! * 1000
  }
  const hash = /#\s?(\d+(?:[.,]\d+)?)/.exec(u)
  if (hash) w.grubosc = liczba(hash[1])
  const fi = /(?:\bFI|Ø|\bD)\s?(\d+(?:[.,]\d+)?)/.exec(u)

  // Pierścień odkuwki: Ø1080/Ø955x71
  const pierscien = /(\d+(?:[.,]\d+)?)\s?\/\s?Ø?\s?(\d+(?:[.,]\d+)?)\s?[X×*]\s?(\d+(?:[.,]\d+)?)/.exec(u)
  // Bez DN/PN i bez gwintów (M20X80) - te liczby nie są wymiarami elementu.
  const bezNormy = u.replace(/\bDN\s?\d+|\bPN\s?\d+|\bM\d+\s?[X×*]\s?\d+(?:[.,]\d+)?/g, ' ')
  const iloczyn = /(\d+(?:[.,]\d+)?)\s?[X×*]\s?(\d+(?:[.,]\d+)?)(?:\s?[X×*]\s?(\d+(?:[.,]\d+)?))?/.exec(bezNormy)
  const a = liczba(iloczyn?.[1]); const b = liczba(iloczyn?.[2]); const c = liczba(iloczyn?.[3])

  switch (kod) {
    case 'rury_technologiczne':
    case 'rury_krocce':
    case 'dennice':
      if (a !== null && b !== null) {
        w.d_zew = a; w.grubosc = b
        if (c !== null && !w.dlugosc) w.dlugosc = c < 30 ? c * 1000 : c
      }
      break
    case 'kolnierze':
    case 'odkuwki':
      // Kołnierz z DN: liczby w nawiasie (np. "( 114x6)") to rura przyłączeniowa, nie wymiar kołnierza.
      if (kod === 'kolnierze' && /\bDN\s?\d/.test(u)) break
      if (pierscien) { w.d_zew = liczba(pierscien[1]); w.d_wew = liczba(pierscien[2]); w.grubosc = liczba(pierscien[3]) }
      else if (a !== null && b !== null) { w.d_zew = a; w.grubosc = b }
      break
    case 'blachy':
      if (fi && a !== null && b !== null && /(?:FI|Ø)/.test(u)) { w.d_zew = a; w.grubosc = b }
      else if (a !== null && b !== null && c !== null) {
        const [g, x, y] = [a, b, c].sort((p, q) => p - q)
        // "1X40X53,5" - pierwsza liczba to raczej krotność niż grubość 1 mm: bez zgadywania.
        if (g >= 2 || w.grubosc) {
          if (!w.grubosc) w.grubosc = g
          w.szerokosc = x; w.dlugosc = y
        }
      } else if (a !== null && b !== null) { w.szerokosc = a; w.dlugosc = b }
      break
    case 'ksztaltowniki':
      if (a !== null && b !== null && c !== null) { w.szerokosc = a; w.grubosc = c }
      else if (a !== null && b !== null) { w.szerokosc = a; w.grubosc = b }
      break
    case 'prety':
      if (fi) w.d_zew = liczba(fi[1])
      break
  }
  return w
}

export function normalizujNazwe(nazwa: string, opcje: { typZamowienia?: string } = {}): PozycjaZnormalizowana {
  const t = oczysc(nazwa)
  const u = t.toUpperCase()
  const zj = opcje.typZamowienia === 'ZJ'
  const gatunek = znajdzGatunek(u)
  const norma = NORMA.exec(u)?.[0]?.replace(/\s+/g, ' ') ?? null
  const dn = /\bDN\s?(\d+)/.exec(u)?.[1] ?? null
  const pn = /\bPN\s?(\d+)/.exec(u)?.[1] ?? null
  const klasa = /(?:\bCL\.?|KLASA|CLASS)\s?(\d+)/.exec(u)?.[1] ?? null
  const bez_szwu = /\bB\/?\s?SZ(W)?\b|BEZ ?SZW|\bSMLS\b|\bB\/S\b/.test(u) ? true : /\bZ\/?\s?SZ(W)?\b|ZE SZWEM|SPAWAN/.test(u) ? false : null
  const pusta = { gatunek, norma, dn, pn, klasa, bez_szwu, d_zew: null, d_wew: null, grubosc: null, szerokosc: null, dlugosc: null, typ_elementu: null }

  // Wypałki to zawsze materiał, nawet gdy kupione "jako usługa" (jm usł).
  const wypalka = /WYPAŁK|WYPALK/.test(u)
  if (!wypalka && !zj && DOPLATA.test(u)) {
    return { ...pusta, rodzaj: 'doplata', kategoria: null, kategoria_uslugi: /TRANSP|KURIER|PRZESYŁK/.test(u) ? 'transport' : null, pewnosc: 'wysoka' }
  }
  if (!wypalka && (zj || USLUGA.test(u))) {
    const ku = kategoriaUslugi(u)
    return { ...pusta, rodzaj: 'usluga', kategoria: null, kategoria_uslugi: ku, pewnosc: ku ? 'wysoka' : 'niska' }
  }
  if (POMOCNICZE.test(u)) {
    return { ...pusta, rodzaj: 'pomocnicze', kategoria: 'pomocnicze', kategoria_uslugi: null, pewnosc: 'wysoka' }
  }
  const kat = kategoriaMaterialu(u)
  let kod = kat.kod
  const w = wymiary(u, kod)
  // Rurki wymiennikowe i precyzyjne (do ~38 mm) to rury technologiczne, większe - zwykle na króćce.
  if (kod === 'rury_technologiczne' && w.d_zew && w.d_zew > 38.1 && !/PRECYZ|WYMIENNIK|RURK/.test(u)) kod = 'rury_krocce'
  return {
    ...pusta, ...w, rodzaj: 'material', kategoria: kod, kategoria_uslugi: null, typ_elementu: kat.typ,
    pewnosc: kat.pewna ? 'wysoka' : 'niska',
  }
}

/**
 * Masa pozycji [kg] z jednostki albo z wymiarów. Zwraca null, gdy nie da się jej ustalić
 * (np. "Wypałki ... 1 kpl") - taka pozycja trafia do kolejki "uzupełnij masę".
 */
export function masaPozycji(p: PozycjaZnormalizowana, ilosc: number, jm: string | null): { masa: number; zrodlo: 'jm' | 'wymiary' } | null {
  const j = (jm ?? '').toLowerCase().replace('.', '')
  if (j === 'kg') return { masa: Math.round(ilosc * 1000) / 1000, zrodlo: 'jm' }
  if (j === 't') return { masa: Math.round(ilosc * 1e6) / 1000, zrodlo: 'jm' }
  if (p.rodzaj !== 'material') return null
  const rho = gestoscZNazwy(p.gatunek)
  const naSzt = j === 'szt' || j === 'ark'
  const naMetr = j === 'm' || j === 'mb'
  let masa: number | null = null
  switch (p.kategoria) {
    case 'rury_technologiczne':
    case 'rury_krocce':
      if (p.typ_elementu === 'rura' && p.d_zew && p.grubosc) {
        if (naMetr) masa = masaRury(p.d_zew, p.grubosc, 1000, rho) * ilosc
        else if (naSzt && p.dlugosc) masa = masaRury(p.d_zew, p.grubosc, p.dlugosc, rho) * ilosc
      }
      break
    case 'blachy':
      if (naSzt && p.grubosc && p.szerokosc && p.dlugosc) masa = masaBlachy(p.grubosc, p.szerokosc, p.dlugosc, rho) * ilosc
      else if (naSzt && p.d_zew && p.grubosc) masa = masaKrazka(p.d_zew, 0, p.grubosc, rho) * ilosc
      break
    case 'odkuwki':
      if (naSzt && p.d_zew && p.grubosc) masa = masaKrazka(p.d_zew, p.d_wew ?? 0, p.grubosc, rho) * ilosc
      break
    case 'prety':
      if (p.d_zew && naMetr) masa = masaPreta(p.d_zew, 1000, rho) * ilosc
      else if (p.d_zew && naSzt && p.dlugosc) masa = masaPreta(p.d_zew, p.dlugosc, rho) * ilosc
      break
  }
  return masa !== null && masa > 0 ? { masa: Math.round(masa * 1000) / 1000, zrodlo: 'wymiary' } : null
}

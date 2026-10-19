// Kalkulacja w Excelu - zakładki jak w dotychczasowym arkuszu wyceny (Analiza, Materiały, Pracochłonność, Kooperacja,
// Badania-odbiory-transport, Podsumowanie), osobne zakładki per aparat, logo firmy (z ustawień) w nagłówku.
import ExcelJS from 'exceljs'
import { policzAparat, policzPozycje, type ParametryKalk, type WynikWyceny } from './kalkulacja'
import type { StanWyceny } from './wyceny'
import { logoFirmy, nazwaPliku, pobierzPlik } from './pobierz'
import type { DaneFirmy, KategoriaMaterialu, KategoriaUslugi } from './types'
import { ETYKIETY_STANU, type KartaAnalizy } from './analiza'

const ZL = '#,##0.00'
const KG = '#,##0.0'
const RAMKA: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB0B7C3' } }, bottom: { style: 'thin', color: { argb: 'FFB0B7C3' } },
  left: { style: 'thin', color: { argb: 'FFB0B7C3' } }, right: { style: 'thin', color: { argb: 'FFB0B7C3' } },
}
const NAGLOWEK_TLO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF9C4' } }
const SEKCJA_TLO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFF3FB' } }
const NIEPEWNE: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }

interface Slowniki { kategorieMaterialow: KategoriaMaterialu[]; kategorieUslug: KategoriaUslugi[]; ustawienia?: { firma?: DaneFirmy } }

function naglowek(ws: ExcelJS.Worksheet, tytul: string, podtytul: string, logo: number | null, firma: string) {
  if (logo !== null) ws.addImage(logo, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 32 } })
  ws.getCell('C1').value = firma
  ws.getCell('C1').font = { bold: true, size: 12 }
  ws.getCell('C2').value = tytul
  ws.getCell('C2').font = { bold: true, size: 11 }
  ws.getCell('C3').value = podtytul
  ws.getCell('C3').font = { size: 9, color: { argb: 'FF64748B' } }
  ws.getRow(1).height = 20
  return 5
}

function wierszTabeli(ws: ExcelJS.Worksheet, nr: number, wartosci: (string | number | null | undefined)[], opcje: { naglowek?: boolean; pogrubiony?: boolean; formaty?: (string | undefined)[]; tlo?: ExcelJS.Fill } = {}) {
  const r = ws.getRow(nr)
  wartosci.forEach((v, i) => {
    const c = r.getCell(i + 1)
    c.value = v === undefined ? null : v
    c.border = RAMKA
    if (opcje.naglowek) { c.font = { bold: true, size: 9 }; c.fill = NAGLOWEK_TLO; c.alignment = { wrapText: true, vertical: 'middle' } }
    if (opcje.pogrubiony) c.font = { bold: true }
    if (opcje.tlo) c.fill = opcje.tlo
    const f = opcje.formaty?.[i]
    if (f && typeof v === 'number') c.numFmt = f
  })
  return nr + 1
}

export async function eksportujKalkulacje(stan: StanWyceny, wynik: WynikWyceny, par: ParametryKalk, s: Slowniki, widziMarze: boolean, analiza: KartaAnalizy | null = null) {
  const bufor = await zbudujKalkulacje(stan, wynik, par, s, widziMarze, analiza)
  pobierzPlik(bufor, `${nazwaPliku(`${stan.zapytanie.numer} kalkulacja v${stan.wycena.wersja}`)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

/** Karta analizy w zakładce "Analiza" (następca zakładki "Opinia o zapytaniu" z dotychczasowego arkusza). */
function kartaAnalizy(an: ExcelJS.Worksheet, r: number, k: KartaAnalizy) {
  const p = k.podsumowanie
  r++
  r = wierszTabeli(an, r, ['KARTA ANALIZY ZAPYTANIA', '', ''], { naglowek: true })
  for (const [et, v] of [
    ['Nr zapytania klienta', p.nr_zapytania_klienta], ['Miejsce dostawy / warunki', [p.miejsce_dostawy, p.warunki_dostawy].filter(Boolean).join(' · ')],
    ['Termin złożenia oferty', p.termin_oferty], ['Termin realizacji / postój', [p.termin_realizacji, p.postoj].filter(Boolean).join(' · ')],
    ['Ważność / gwarancja / płatność', [p.waznosc_oferty, p.gwarancja, p.platnosc].filter(Boolean).join(' · ')], ['Dokumenty oferty', p.dokumenty_oferty],
  ] as [string, string][]) if (v.trim()) r = wierszTabeli(an, r, [et, v])
  r++
  r = wierszTabeli(an, r, ['Wymaganie kosztotwórcze', 'Opis', 'Stan / wpływ'], { naglowek: true })
  for (const w of k.wymagania.filter((x) => x.stan === 'wymagane' || x.stan === 'do_wyjasnienia')) {
    r = wierszTabeli(an, r, [w.nazwa, [w.opis, w.zrodlo && `(${w.zrodlo})`].filter(Boolean).join(' '), `${ETYKIETY_STANU[w.stan]}${w.wplyw ? ` / ${w.wplyw}` : ''}`],
      { tlo: w.stan === 'do_wyjasnienia' ? NIEPEWNE : undefined })
  }
  if (k.uslugi.length) {
    r++
    r = wierszTabeli(an, r, ['Usługa do zapytania', 'Zakres', 'Ilość'], { naglowek: true })
    for (const u of k.uslugi) r = wierszTabeli(an, r, [u.kategoria ?? 'inne', [u.opis, u.uwagi].filter(Boolean).join(' - '), u.ilosc ? `${u.ilosc} ${u.jm}` : ''])
  }
  if (k.pytania.length || k.niespojnosci.length) {
    r++
    r = wierszTabeli(an, r, ['Pytania do klienta / niespójności', '', ''], { naglowek: true })
    for (const q of k.pytania) r = wierszTabeli(an, r, ['pytanie', q.tresc, q.odpowiedz || 'bez odpowiedzi'])
    for (const n of k.niespojnosci) r = wierszTabeli(an, r, ['niespójność', n.opis, n.zrodla], { tlo: NIEPEWNE })
  }
  const o = k.ocena
  r++
  r = wierszTabeli(an, r, ['Ocena działów', '', ''], { naglowek: true })
  const komplet = Object.entries({ 'arkusz danych': o.kompletnosc.arkusz_danych, 'dokumentacja wykonawcza': o.kompletnosc.dokumentacja_wykonawcza, 'dokumentacja koncesyjna': o.kompletnosc.dokumentacja_koncesyjna, 'szkic / rysunek': o.kompletnosc.szkic })
    .filter(([, v]) => v).map(([n]) => n).join(', ')
  for (const [et, v] of [
    ['Kompletność dokumentacji', komplet], ['Ocena technologiczna', [o.technologiczna, o.uwagi_technologiczne].filter(Boolean).join(' - ')],
    ['Ocena spawalnicza', o.spawalnicza], ...o.terminy_materialow.filter((t) => t.termin.trim()).map((t) => [`Termin zakupu: ${t.grupa}`, t.termin]),
    ['Przygotowanie oferty', [o.plan_jakosci && 'plan jakości', o.zmiana_terminu && 'proponowana zmiana terminu', o.uwagi].filter(Boolean).join('; ')],
    ['Ryzyka i uwagi', k.uwagi],
  ] as [string, string][]) if (v?.trim()) r = wierszTabeli(an, r, [et, v])
  return r
}

/** Skoroszyt kalkulacji jako bufor (bez pobierania - używane też w teście lokalnym). */
export async function zbudujKalkulacje(stan: StanWyceny, wynik: WynikWyceny, par: ParametryKalk, s: Slowniki, widziMarze: boolean, analiza: KartaAnalizy | null = null): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Wyceny i oferty'
  wb.created = new Date()
  const logoDane = logoFirmy(s.ustawienia?.firma)
  const logo = logoDane ? wb.addImage({ buffer: logoDane, extension: 'png' }) : null
  const firma = s.ustawienia?.firma?.nazwa ?? ''
  const naglowekArkusza = (ws: ExcelJS.Worksheet, tytul: string, pod: string, l: number | null) => naglowek(ws, tytul, pod, l, firma)
  const w = stan.wycena
  const podtytul = `${stan.zapytanie.numer} · ${stan.zapytanie.przedmiot}${stan.zapytanie.klient ? ` · ${stan.zapytanie.klient}` : ''} · wycena v${w.wersja} (${w.status})`

  // --- Analiza / opinia ---
  const an = wb.addWorksheet('Analiza')
  let r = naglowekArkusza(an, 'OPINIA O ZAPYTANIU / ANALIZA', podtytul, logo)
  an.columns = [{ width: 34 }, { width: 50 }, { width: 18 }]
  for (const [k, v] of [
    ['Zapytanie', stan.zapytanie.numer], ['Klient', stan.zapytanie.klient ?? ''], ['Przedmiot', stan.zapytanie.przedmiot],
    ['Wersja wyceny', `v${w.wersja}${w.nazwa ? ` - ${w.nazwa}` : ''}`], ['Status', w.status],
    ['Termin realizacji [tyg.]', w.termin_realizacji_tyg ?? ''], ['Uwagi', w.uwagi ?? ''],
  ] as [string, string | number][]) r = wierszTabeli(an, r, [k, v])
  r++
  r = wierszTabeli(an, r, ['Aparat', 'Typ / materiał', 'Ilość / masa netto kg'], { naglowek: true })
  for (const a of stan.aparaty) r = wierszTabeli(an, r, [a.nazwa, [a.typ, a.tema, a.material_wiodacy].filter(Boolean).join(', '), `${a.ilosc} szt. × ${a.masa_netto_kg ?? '?'} kg`])
  an.getColumn(2).alignment = { wrapText: true, vertical: 'top' }
  if (analiza) kartaAnalizy(an, r, analiza)

  // --- Aparaty ---
  stan.aparaty.forEach((a, ia) => {
    const k = policzAparat(a, par)
    const pref = stan.aparaty.length > 1 ? `A${ia + 1} ` : ''
    const tyt = `${a.nazwa} - ${a.ilosc} szt., masa netto ${a.masa_netto_kg ?? '?'} kg`

    const m = wb.addWorksheet(`${pref}Materiały`.slice(0, 31))
    let rm = naglowekArkusza(m, `ZESTAWIENIE MATERIAŁOWE DLA 1 SZT. - ${tyt}`, podtytul, logo)
    m.columns = [6, 26, 14, 14, 8, 8, 7, 8, 8, 8, 8, 6, 10, 11, 10, 7, 13, 28, 22].map((width) => ({ width }))
    rm = wierszTabeli(m, rm, ['L.p.', 'Przeznaczenie', 'Rodzaj', 'Gatunek', 'φ zew', 'φ wew', 'g', 'b', 'l', 'DN', 'Ilość', 'j.m.', 'Masa jedn. kg', 'Masa całk. kg', 'Cena', 'za', 'Koszt PLN', 'Źródło ceny', 'Uwagi'], { naglowek: true })
    for (const sek of k.materialy.sekcje) {
      const nazwaSek = s.kategorieMaterialow.find((x) => x.kod === sek.sekcja)?.nazwa ?? sek.sekcja
      m.mergeCells(rm, 1, rm, 19)
      m.getCell(rm, 1).value = nazwaSek; m.getCell(rm, 1).font = { bold: true }; m.getCell(rm, 1).fill = SEKCJA_TLO
      rm++
      a.pozycje.filter((p) => p.zakladka === 'materialy' && (p.sekcja ?? 'inne') === sek.sekcja).forEach((p, i) => {
        const wp = policzPozycje(p, par)
        rm = wierszTabeli(m, rm, [i + 1, p.nazwa, p.rodzaj ?? '', p.gatunek ?? '', p.d_zew ?? null, p.d_wew ?? null, p.grubosc ?? null, p.szerokosc ?? null, p.dlugosc ?? null, p.dn ?? '',
          p.ilosc, p.jm, wp.masa_jedn, wp.masa_calk || null, p.cena_jedn || null, p.jednostka_ceny === 'jm' ? `zł/${p.jm}` : `zł/${p.jednostka_ceny}`, wp.koszt,
          p.zrodlo_ceny === 'recznie' ? 'ręcznie' : `${p.zrodlo_ceny} ${p.zrodlo_dostawca ?? ''} ${p.zrodlo_data ?? ''}`.trim(), [p.opcjonalna ? 'OPCJA' : '', p.uwagi ?? ''].filter(Boolean).join(' ')],
        { formaty: [undefined, undefined, undefined, undefined, KG, KG, KG, KG, KG, undefined, KG, undefined, '#,##0.000', KG, ZL, undefined, ZL] })
      })
      rm = wierszTabeli(m, rm, ['', `Naddatki technologiczne ${sek.naddatek_proc}%`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', sek.naddatek], { formaty: Array(17).fill(undefined).concat([ZL]) as (string | undefined)[] })
      rm = wierszTabeli(m, rm, ['', `RAZEM ${nazwaSek}`, '', '', '', '', '', '', '', '', '', '', '', sek.masa, '', '', sek.razem], { pogrubiony: true, formaty: [...Array(13).fill(undefined), KG, undefined, undefined, ZL] })
      rm++
    }
    rm = wierszTabeli(m, rm, ['', 'KOSZT MATERIAŁÓW (z naddatkami)', ...Array(14).fill(''), k.materialy.koszt], { pogrubiony: true, formaty: [...Array(16).fill(undefined), ZL] })
    rm = wierszTabeli(m, rm, ['', `Narzut zakupowy ${par.narzut_zakupowy_proc}%`, ...Array(14).fill(''), k.materialy.narzut_zakupowy], { formaty: [...Array(16).fill(undefined), ZL] })
    rm = wierszTabeli(m, rm, ['', 'MATERIAŁY Z NARZUTEM (1 szt.)', ...Array(14).fill(''), k.materialy.razem], { pogrubiony: true, formaty: [...Array(16).fill(undefined), ZL] })
    wierszTabeli(m, rm, ['', 'Ciężar BRUTTO [kg]', ...Array(11).fill(''), k.materialy.masa_brutto], { formaty: [...Array(13).fill(undefined), KG] })

    const p = wb.addWorksheet(`${pref}Pracochłonność`.slice(0, 31))
    let rp = naglowekArkusza(p, `ZESTAWIENIE PRACOCHŁONNOŚCI DLA 1 SZT. - ${tyt}`, podtytul, logo)
    p.columns = [6, 10, 34, 12, 12, 14, 30].map((width) => ({ width }))
    if (a.metoda_robocizny === 'wskaznikowa') {
      rp = wierszTabeli(p, rp, ['L.p.', '', 'Przyjęto', 'Ilość', 'j.m.', 'Wartość'], { naglowek: true })
      rp = wierszTabeli(p, rp, [1, '', 'Ciężar NETTO', (a.masa_netto_kg ?? 0) / 1000, 't'], { formaty: [undefined, undefined, undefined, '#,##0.000'] })
      rp = wierszTabeli(p, rp, [2, '', 'Wskaźnik pracochłonności', a.wskaznik_rbh_t, 'rbh/t'])
      rp = wierszTabeli(p, rp, [3, '', 'Ilość rbh', k.robocizna.rbh, 'rbh', k.robocizna.dni !== null ? `${k.robocizna.dni.toFixed(1)} dni przy ${a.liczba_osob} os.` : ''], { formaty: [undefined, undefined, undefined, KG] })
      rp = wierszTabeli(p, rp, [4, '', 'Stawka', a.stawka_wskaznikowa, 'PLN/rbh', k.robocizna.wartosc], { formaty: [undefined, undefined, undefined, ZL, undefined, ZL] })
    } else {
      rp = wierszTabeli(p, rp, ['L.p.', 'MPK', 'Rodzaj pracy', 'Ilość rbh', 'Stawka PLN/rbh', 'Wartość PLN', 'Uwagi'], { naglowek: true })
      a.pozycje.filter((x) => x.zakladka === 'robocizna').forEach((x, i) => {
        rp = wierszTabeli(p, rp, [i + 1, x.mpk ?? '', x.nazwa, x.ilosc, x.cena_jedn, x.wartosc_reczna ?? x.ilosc * x.cena_jedn, x.uwagi ?? ''], { formaty: [undefined, undefined, undefined, KG, ZL, ZL] })
      })
    }
    rp++
    rp = wierszTabeli(p, rp, ['', '', 'RAZEM', k.robocizna.rbh, 'rbh', k.robocizna.wartosc], { pogrubiony: true, formaty: [undefined, undefined, undefined, KG, undefined, ZL] })
    wierszTabeli(p, rp, ['', '', 'Ilość rbh/t', k.robocizna.rbh_na_t ?? '', 'rbh/t'], { formaty: [undefined, undefined, undefined, KG] })

    const ko = wb.addWorksheet(`${pref}Kooperacja`.slice(0, 31))
    let rk = naglowekArkusza(ko, `KOOPERACJA DLA 1 SZT. - ${tyt}`, podtytul, logo)
    ko.columns = [6, 24, 34, 9, 9, 9, 9, 9, 12, 14, 26].map((width) => ({ width }))
    rk = wierszTabeli(ko, rk, ['L.p.', 'Kategoria', 'Nazwa elementu, robót', 'śr. 1', 'śr. 2', 'grubość', 'wys.', 'Ilość', 'Cena jedn.', 'Wartość PLN', 'Źródło / uwagi'], { naglowek: true })
    a.pozycje.filter((x) => x.zakladka === 'kooperacja').forEach((x, i) => {
      rk = wierszTabeli(ko, rk, [i + 1, s.kategorieUslug.find((c) => c.kod === x.sekcja)?.nazwa ?? '', x.nazwa, x.d_zew ?? null, x.d_wew ?? null, x.grubosc ?? null, x.dlugosc ?? null, x.ilosc, x.cena_jedn,
        policzPozycje(x, par).koszt, [x.opcjonalna ? 'OPCJA' : '', x.zrodlo_ceny !== 'recznie' ? `${x.zrodlo_dostawca ?? ''} ${x.zrodlo_data ?? ''}` : '', x.uwagi ?? ''].filter(Boolean).join(' ')],
      { formaty: [undefined, undefined, undefined, KG, KG, KG, KG, KG, ZL, ZL] })
    })
    rk++
    rk = wierszTabeli(ko, rk, ['', '', 'RAZEM', '', '', '', '', '', '', k.kooperacja.koszt], { formaty: [...Array(9).fill(undefined), ZL] })
    rk = wierszTabeli(ko, rk, ['', '', `Narzut na kooperację ${par.narzut_kooperacja_proc}%`, '', '', '', '', '', '', k.kooperacja.narzut], { formaty: [...Array(9).fill(undefined), ZL] })
    wierszTabeli(ko, rk, ['', '', 'RAZEM Kooperacja (1 szt.)', '', '', '', '', '', '', k.kooperacja.razem], { pogrubiony: true, formaty: [...Array(9).fill(undefined), ZL] })

    const b = wb.addWorksheet(`${pref}Badania-odb-trans`.slice(0, 31))
    let rb = naglowekArkusza(b, `BADANIA, ODBIORY, PROJEKT, TRANSPORT DLA 1 SZT. - ${tyt}`, podtytul, logo)
    b.columns = [6, 36, 10, 10, 12, 14, 26].map((width) => ({ width }))
    for (const [zak, tytul] of [['projekt', 'Projekt'], ['badania', 'Badania i odbiory'], ['transport', 'Transport i sprzęt ciężki'], ['inne', 'Inne']] as const) {
      b.mergeCells(rb, 1, rb, 7)
      b.getCell(rb, 1).value = tytul; b.getCell(rb, 1).font = { bold: true }; b.getCell(rb, 1).fill = SEKCJA_TLO
      rb++
      rb = wierszTabeli(b, rb, zak === 'transport' ? ['L.p.', 'Trasa', 'km', 'Kursów', 'zł/km', 'Wartość PLN', 'Uwagi'] : ['L.p.', 'Nazwa', 'Ilość', 'j.m.', 'Cena jedn.', 'Wartość PLN', 'Uwagi'], { naglowek: true })
      a.pozycje.filter((x) => x.zakladka === zak).forEach((x, i) => {
        const wart = policzPozycje(x, par).koszt
        rb = wierszTabeli(b, rb, zak === 'transport'
          ? [i + 1, x.nazwa, Number(x.dodatkowe?.km ?? 0) || null, x.ilosc, x.cena_jedn, wart, [x.dodatkowe?.ponadgabaryt ? 'ponadgabaryt' : '', x.uwagi ?? ''].filter(Boolean).join(' ')]
          : [i + 1, x.nazwa, x.ilosc, x.jm, x.cena_jedn, wart, [x.opcjonalna ? 'OPCJA' : '', x.uwagi ?? ''].filter(Boolean).join(' ')],
        { formaty: [undefined, undefined, KG, undefined, ZL, ZL] })
      })
      const suma = { projekt: k.badania.projekt, badania: k.badania.badania, transport: k.badania.transport, inne: k.badania.inne }[zak]
      rb = wierszTabeli(b, rb, ['', `RAZEM ${tytul}`, '', '', '', suma], { pogrubiony: true, formaty: [...Array(5).fill(undefined), ZL] })
      rb++
    }
    wierszTabeli(b, rb, ['', 'RAZEM badania, odbiory, projekt, transport (1 szt.)', '', '', '', k.badania.razem], { pogrubiony: true, formaty: [...Array(5).fill(undefined), ZL] })
  })

  // --- Podsumowanie (ocena ekonomiczna) ---
  const ps = wb.addWorksheet('Podsumowanie')
  let rs = naglowekArkusza(ps, `OCENA EKONOMICZNA - masa netto ${(wynik.masa_kg / 1000).toFixed(3)} t`, podtytul, logo)
  ps.columns = [42, 18, 12, 10].map((width) => ({ width }))
  rs = wierszTabeli(ps, rs, ['', 'PLN', 'PLN/kg', 'Udział'], { naglowek: true })
  for (const [n, x] of [['Robocizna', wynik.robocizna], ['Materiały', wynik.materialy], ['Kooperacja', wynik.kooperacja], ['Badania, odbiory, transport, projekt', wynik.badania], ['Koszty całkowite', wynik.koszty]] as const) {
    rs = wierszTabeli(ps, rs, [n, x.koszt, x.zl_kg, x.udzial], { pogrubiony: n === 'Koszty całkowite', formaty: [undefined, ZL, ZL, '0.0%'] })
  }
  if (widziMarze && wynik.cena !== null) {
    rs++
    rs = wierszTabeli(ps, rs, [`Zakładany zysk ${wynik.zysk_proc}%`, wynik.zysk], { formaty: [undefined, ZL] })
    rs = wierszTabeli(ps, rs, ['CENA', wynik.cena, wynik.masa_kg ? wynik.cena / wynik.masa_kg : null], { pogrubiony: true, formaty: [undefined, ZL, ZL] })
    if (wynik.korekta) rs = wierszTabeli(ps, rs, ['Korekta prezesa', wynik.korekta], { formaty: [undefined, ZL] })
    rs = wierszTabeli(ps, rs, ['CENA KOŃCOWA (netto)', wynik.cena_koncowa, wynik.cena_koncowa_zl_kg], { pogrubiony: true, tlo: NAGLOWEK_TLO, formaty: [undefined, ZL, ZL] })
    if (wynik.cena_koncowa_eur !== null) rs = wierszTabeli(ps, rs, [`Cena w EUR (kurs ${w.kurs_eur})`, wynik.cena_koncowa_eur], { formaty: [undefined, ZL] })
    if (wynik.ma_opcje) rs = wierszTabeli(ps, rs, ['Wariant bez pozycji opcjonalnych', wynik.cena_bez_opcji], { formaty: [undefined, ZL] })
  }
  rs++
  rs = wierszTabeli(ps, rs, ['Aparat', 'Koszt 1 szt.', 'Ilość', 'Koszt razem'], { naglowek: true })
  for (const a of wynik.aparaty) rs = wierszTabeli(ps, rs, [a.nazwa, a.koszt_szt, a.ilosc, a.koszt], { formaty: [undefined, ZL, undefined, ZL] })

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

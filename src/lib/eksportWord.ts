// Dokumenty Word: notatka wewnętrzna dla prezesa (układ dawnego "Wycena.docx") i oferta dla klienta.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import { policzPozycje, type ParametryKalk, type WynikWyceny } from './kalkulacja'
import type { StanWyceny } from './wyceny'
import type { DaneFirmy, KategoriaMaterialu, OfertaDomyslne } from './types'
import { logoFirmy, nazwaPliku, pobierzPlik } from './pobierz'

const fmt = (n: number | null | undefined, miejsc = 2) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: miejsc, maximumFractionDigits: miejsc }).format(Number(n ?? 0))
const zl = (n: number | null | undefined) => `${fmt(n)} zł`
const P = (tekst: string, opcje: { bold?: boolean; size?: number; po?: number; wyrownanie?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ alignment: opcje.wyrownanie, spacing: { after: opcje.po ?? 80 }, children: [new TextRun({ text: tekst, bold: opcje.bold, size: opcje.size })] })
const punkt = (tekst: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun(tekst)] })

function komorka(tekst: string, opcje: { bold?: boolean; prawo?: boolean; szer?: number; tlo?: string } = {}) {
  return new TableCell({
    width: opcje.szer ? { size: opcje.szer, type: WidthType.PERCENTAGE } : undefined,
    shading: opcje.tlo ? { fill: opcje.tlo } : undefined,
    children: [new Paragraph({ alignment: opcje.prawo ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: tekst, bold: opcje.bold, size: 20 })] })],
  })
}

async function naglowekZLogo(firma: DaneFirmy) {
  const logo = logoFirmy(firma)
  const dzieci: Paragraph[] = []
  if (logo) dzieci.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 150, height: 40 } })] }))
  dzieci.push(new Paragraph({ children: [new TextRun({ text: firma.nazwa, bold: true, size: 18 }), new TextRun({ text: `  ${firma.adres}`, size: 16, color: '64748B' })] }))
  return new Header({ children: dzieci })
}

function stopka(firma: DaneFirmy) {
  const linie = [
    `${firma.nazwa}, ${firma.adres} · KRS ${firma.krs} · NIP ${firma.nip} · REGON ${firma.regon}`,
    firma.oddzialy.length ? `Oddziały: ${firma.oddzialy.join(' · ')}` : '',
    firma.zarzad.length ? firma.zarzad.join(' · ') : '',
    [firma.www, firma.email, firma.telefon].filter(Boolean).join(' · '),
  ].filter(Boolean)
  return new Footer({
    children: linie.map((l) => new Paragraph({
      alignment: AlignmentType.CENTER,
      border: l === linie[0] ? { top: { style: BorderStyle.SINGLE, size: 4, color: 'C4E82A', space: 4 } } : undefined,
      children: [new TextRun({ text: l, size: 14, color: '64748B' })],
    })),
  })
}

interface Slowniki { kategorieMaterialow: KategoriaMaterialu[]; ustawienia: { firma: DaneFirmy; oferta_domyslne: OfertaDomyslne } }

/** Notatka wewnętrzna: lista kosztów, razem, narzut, łącznie, waga, cena za kg (jak dawny "Wycena.docx"). */
export async function notatkaDlaPrezesa(stan: StanWyceny, wynik: WynikWyceny, par: ParametryKalk, s: Slowniki) {
  pobierzPlik(await Packer.toBlob(await zbudujNotatke(stan, wynik, par, s)), `${nazwaPliku(`${stan.zapytanie.numer} notatka v${stan.wycena.wersja}`)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

export async function zbudujNotatke(stan: StanWyceny, wynik: WynikWyceny, par: ParametryKalk, s: Slowniki): Promise<Document> {
  const w = stan.wycena
  const tresc: (Paragraph | Table)[] = []
  const masa = wynik.masa_kg
  const material = [...new Set(stan.aparaty.map((a) => a.material_wiodacy).filter(Boolean))].join(' / ')
  tresc.push(P(`${stan.zapytanie.numer} ${stan.zapytanie.klient ?? ''} - ${stan.zapytanie.przedmiot}${material ? ` ${material}` : ''}${masa ? ` o wadze ${fmt(masa, 0)} kg` : ''}`, { bold: true, po: 200 }))
  tresc.push(P(`Wycena v${w.wersja}${w.nazwa ? ` (${w.nazwa})` : ''} - notatka wewnętrzna`, { size: 18, po: 200 }))

  for (const [ia, a] of stan.aparaty.entries()) {
    const k = wynik.aparaty[ia]
    if (stan.aparaty.length > 1) tresc.push(P(`${a.nazwa} - ${a.ilosc} szt. (koszt 1 szt.)`, { bold: true, po: 100 }))
    const suma = (z: string) => a.pozycje.filter((p) => p.zakladka === z).reduce((acc, p) => acc + policzPozycje(p, par).koszt, 0)
    if (suma('projekt')) tresc.push(P(`Projekt: ${zl(suma('projekt'))}`))
    for (const sek of k.materialy.sekcje) {
      const nazwa = s.kategorieMaterialow.find((x) => x.kod === sek.sekcja)?.nazwa ?? sek.sekcja
      tresc.push(P(`Materiał - ${nazwa}${sek.masa ? ` ${fmt(sek.masa, 0)} kg` : ''}${sek.naddatek ? ` (z naddatkiem ${sek.naddatek_proc}%)` : ''}: ${zl(sek.razem)}`))
    }
    if (k.materialy.narzut_zakupowy) tresc.push(P(`Narzut zakupowy ${par.narzut_zakupowy_proc}%: ${zl(k.materialy.narzut_zakupowy)}`))
    for (const p of a.pozycje.filter((x) => x.zakladka === 'kooperacja')) tresc.push(P(`Kooperacja (${p.nazwa})${p.opcjonalna ? ' [opcja]' : ''}: ${zl(policzPozycje(p, par).koszt)}`))
    if (k.kooperacja.narzut) tresc.push(P(`Narzut na kooperację ${par.narzut_kooperacja_proc}%: ${zl(k.kooperacja.narzut)}`))
    tresc.push(P(`Robocizna: ${fmt(k.robocizna.rbh, 0)} rbh x ${fmt(k.robocizna.srednia_stawka ?? 0)} zł/godz. = ${zl(k.robocizna.wartosc)}`))
    if (suma('badania')) tresc.push(P(`Badania i odbiory: ${zl(suma('badania'))}`))
    if (suma('transport')) tresc.push(P(`Transport: ${zl(suma('transport'))}`))
    for (const p of a.pozycje.filter((x) => x.zakladka === 'inne')) tresc.push(P(`${p.nazwa}${p.opcjonalna ? ' [opcja]' : ''}: ${zl(policzPozycje(p, par).koszt)}`))
    if (a.ilosc !== 1) tresc.push(P(`Koszt ${a.ilosc} szt.: ${zl(k.koszt)}`, { bold: true }))
    tresc.push(P('', { po: 120 }))
  }
  tresc.push(P(`Razem: ${zl(wynik.koszty.koszt)}`, { bold: true }))
  if (wynik.cena !== null) {
    tresc.push(P(`Narzut ${fmt(wynik.zysk_proc, 0)}%: ${zl(wynik.zysk)}`))
    tresc.push(P(wynik.korekta
      ? `Łącznie: ${zl(wynik.cena)} + ${zl(wynik.korekta)} (prezes) = ${zl(wynik.cena_koncowa)} + vat`
      : `Łącznie: ${zl(wynik.cena_koncowa)} + vat`, { bold: true }))
  }
  if (masa) tresc.push(P(`Waga: ${fmt(masa, 0)} kg`))
  if (wynik.cena !== null && masa) tresc.push(P(`Cena jednostkowa: ${fmt(wynik.cena / masa)} zł/kg + vat${wynik.korekta ? ` (po korekcie: ${fmt(wynik.cena_koncowa_zl_kg)} zł/kg)` : ''}`))
  if (wynik.ma_opcje && wynik.cena_bez_opcji !== null) {
    tresc.push(P(`Cena z ${fmt(wynik.zysk_proc, 0)}% narzutem bez pozycji opcjonalnych: ${zl(wynik.cena_bez_opcji)} + vat${masa ? ` (${fmt(wynik.cena_bez_opcji / masa)} zł/kg)` : ''}`))
  }
  if (wynik.cena_koncowa_eur !== null) tresc.push(P(`Cena w EUR (kurs ${fmt(w.kurs_eur, 4)}): ${fmt(wynik.cena_koncowa_eur)} EUR`))

  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ headers: { default: await naglowekZLogo(s.ustawienia.firma) }, children: tresc }],
  })
}

export interface DaneOferty {
  numer: string
  data: string
  klient: string
  nr_zapytania_klienta: string
  przedmiot: string
  pozycje: { nazwa: string; ilosc: number; material: string; masa_kg: number | null; cena: number | null }[]
  cena_netto: number
  cena_bez_opcji: number | null
  opis_wariantu: string
  vat_proc: number
  waluta: 'PLN' | 'EUR'
  kurs_eur: number | null
  obejmuje: string[]
  nie_obejmuje: string[]
  uwagi: string[]
  termin_realizacji: string
  gwarancja: string
  waznosc: string
  platnosc: string
  podpis: string
  projekt: boolean    // cena niezatwierdzona - znak "PROJEKT"
}

export async function ofertaDlaKlienta(d: DaneOferty, firma: DaneFirmy) {
  pobierzPlik(await Packer.toBlob(await zbudujOferte(d, firma)), `${nazwaPliku(`Oferta ${d.numer}`)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

export async function zbudujOferte(d: DaneOferty, firma: DaneFirmy): Promise<Document> {
  const przelicz = (n: number) => (d.waluta === 'EUR' && d.kurs_eur ? n / d.kurs_eur : n)
  const jedn = d.waluta === 'EUR' ? 'EUR' : 'zł'
  const tresc: (Paragraph | Table)[] = []
  if (d.projekt) tresc.push(P('PROJEKT OFERTY - cena niezatwierdzona', { bold: true, size: 20, wyrownanie: AlignmentType.CENTER }))
  tresc.push(P([firma.miejscowosc?.trim(), d.data].filter(Boolean).join(', '), { wyrownanie: AlignmentType.RIGHT }))
  tresc.push(P(d.klient, { bold: true, po: 40 }))
  if (d.nr_zapytania_klienta) tresc.push(P(`Dotyczy: zapytanie nr ${d.nr_zapytania_klienta}`, { po: 200 }))
  tresc.push(P(`OFERTA nr ${d.numer}`, { bold: true, size: 28, wyrownanie: AlignmentType.CENTER, po: 200 }))
  tresc.push(P(`Przedmiot oferty: ${d.przedmiot}`, { po: 160 }))

  tresc.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: ['Aparat', 'Ilość szt.', 'Materiał', 'Masa [kg]', `Cena netto [${jedn}]`].map((t) => komorka(t, { bold: true, tlo: 'EEF9C4' })) }),
      ...d.pozycje.map((p) => new TableRow({ children: [
        komorka(p.nazwa, { szer: 40 }), komorka(fmt(p.ilosc, 0), { prawo: true }), komorka(p.material), komorka(p.masa_kg ? fmt(p.masa_kg, 0) : '', { prawo: true }),
        komorka(p.cena !== null ? fmt(przelicz(p.cena)) : '', { prawo: true }),
      ] })),
    ],
  }))
  tresc.push(P('', { po: 120 }))
  const vat = d.cena_netto * d.vat_proc / 100
  tresc.push(P(`Cena netto: ${fmt(przelicz(d.cena_netto))} ${jedn}`, { bold: true, size: 24 }))
  tresc.push(P(`VAT ${d.vat_proc}%: ${fmt(przelicz(vat))} ${jedn}   ·   Cena brutto: ${fmt(przelicz(d.cena_netto + vat))} ${jedn}`))
  if (d.cena_bez_opcji !== null) tresc.push(P(`Wariant ${d.opis_wariantu}: ${fmt(przelicz(d.cena_bez_opcji))} ${jedn} netto + VAT`))
  if (d.waluta === 'EUR' && d.kurs_eur) tresc.push(P(`Ceny w EUR przeliczone po kursie ${fmt(d.kurs_eur, 4)} PLN/EUR.`, { size: 18 }))
  tresc.push(P('', { po: 120 }))
  for (const [tytul, lista] of [['Oferta obejmuje:', d.obejmuje], ['Oferta nie obejmuje:', d.nie_obejmuje], ['Uwagi:', d.uwagi]] as const) {
    if (!lista.length) continue
    tresc.push(P(tytul, { bold: true, po: 60 }))
    lista.forEach((t) => tresc.push(punkt(t)))
    tresc.push(P('', { po: 80 }))
  }
  for (const [k, v] of [['Termin realizacji', d.termin_realizacji], ['Gwarancja', d.gwarancja], ['Ważność oferty', d.waznosc], ['Płatność', d.platnosc]]) {
    if (v) tresc.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(v)] }))
  }
  tresc.push(P('', { po: 400 }))
  tresc.push(P('Z poważaniem', { wyrownanie: AlignmentType.RIGHT }))
  if (d.podpis) tresc.push(P(d.podpis, { wyrownanie: AlignmentType.RIGHT }))

  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ headers: { default: await naglowekZLogo(firma) }, footers: { default: stopka(firma) }, children: tresc }],
  })
}

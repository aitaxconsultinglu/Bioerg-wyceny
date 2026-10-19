// Podgląd deweloperski generatora zapytań do dostawców (tylko npm run dev, zapytania-dev.html).
// Dane FIKCYJNE, bez bazy: zapis i wysyłka tylko dopisują wiersz w tabeli statusów poniżej.
import React, { useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DostawcaSlownikow } from '@/lib/slowniki'
import { grupujWgKategorii, linkMailto, type OdbiorcaStan, type PozycjaZapytania } from '@/lib/zapytaniaDostawcow'
import type { UstawieniaZapytan } from '@/lib/types'
import { EdytorZapytania, WyborPozycji, type DostawcaZapytania } from '@/components/zapytaniaDostawcow/GeneratorZapytan'
import { TabelaZapytan, type ZapytanieDostawcy } from '@/components/zapytaniaDostawcow/ListaZapytanDostawcow'

const UST: UstawieniaZapytan = {
  dw: 'oferty@example.test', dni_bez_odpowiedzi: 5, dni_na_odpowiedz: 5, powitanie: 'Dzień dobry,',
  wstep_material: 'Proszę o ofertę na materiał jak poniżej', wstep_usluga: 'Proszę o ofertę na usługę jak poniżej',
  zakonczenie: 'W ofercie prosimy podać cenę netto, termin realizacji, warunki dostawy (INCOTERMS), ważność oferty i warunki płatności.',
  podpis: 'Z poważaniem\nDział handlowy',
  wymagania: [
    { kod: 'atest', tekst: 'z atestem 3.1 + PED, producent UE (uprawnienia UDT, jeśli z Polski)', kategorie: ['*material'], w_naglowku: true },
    { kod: 'udarnosc', tekst: 'Wymagana gwarantowana udarność w temp. -45 °C, KV min. 27 J.', kategorie: ['*material'], w_naglowku: false },
    { kod: 'ut_rury', tekst: 'Wymagane badanie ultradźwiękowe rur wg EN ISO 10893-10 U2C.', kategorie: ['rury_technologiczne'], w_naglowku: false },
    { kod: 'naddatki', tekst: 'Wymiary podano na gotowo - wymagane naddatki na obróbkę.', kategorie: ['odkuwki'], w_naglowku: false },
  ],
}
const POZYCJE: PozycjaZapytania[] = [
  { klucz: 'a', opis: 'Odkuwka, krążek Ø900x100 A350 LF2', ilosc: 2, jm: 'szt', masa_kg: 1000, kategoria: 'odkuwki', rodzaj: 'material', ma_cene: false, zrodlo: '' },
  { klucz: 'b', opis: 'Odkuwka, pierścień Ø800/Ø700x60 A350 LF2', ilosc: 1, jm: 'szt', masa_kg: 110, kategoria: 'odkuwki', rodzaj: 'material', ma_cene: false, zrodlo: '' },
  { klucz: 'c', opis: 'Rurka 25x2 P235GH', ilosc: 240, jm: 'm', masa_kg: 264, kategoria: 'rury_technologiczne', rodzaj: 'material', ma_cene: true, zrodlo: '' },
  { klucz: 'd', opis: 'Malowanie zbiornika', ilosc: 1, jm: 'kpl', masa_kg: null, kategoria: 'malowanie', rodzaj: 'usluga', ma_cene: false, zrodlo: '' },
]
const DOSTAWCY: DostawcaZapytania[] = [
  { id: 'd1', nazwa: 'Kuźnia Testowa', kategorie: ['odkuwki'], kontakty: [{ email: 'handel@kuznia.example.test' }] },
  { id: 'd2', nazwa: 'Odkuwki Przykład', kategorie: ['odkuwki'], kontakty: [] },
  { id: 'd3', nazwa: 'Rury Demo', kategorie: ['rury_technologiczne'], kontakty: [{ email: 'rury@demo.example.test' }] },
]

function Podglad() {
  const [pozycje, setPozycje] = useState(POZYCJE)
  const [zaznaczone, setZaznaczone] = useState(new Set(['a', 'b', 'd']))
  const [aktywna, setAktywna] = useState<string | null>(null)
  const [zapytania, setZapytania] = useState<ZapytanieDostawcy[]>([])
  const [odbiorcy, setOdbiorcy] = useState<OdbiorcaStan[]>([])
  const [ostatniLink, setOstatniLink] = useState('')
  const grupa = useMemo(() => {
    const g = grupujWgKategorii(pozycje).find((x) => `${x.rodzaj}:${x.kategoria}` === aktywna)
    const w = g?.pozycje.filter((p) => zaznaczone.has(p.klucz)) ?? []
    return g && w.length ? { ...g, pozycje: w } : null
  }, [pozycje, zaznaczone, aktywna])
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <h2 className="text-lg font-semibold">Generator zapytań - podgląd (dane fikcyjne)</h2>
      <WyborPozycji pozycje={pozycje} zaznaczone={zaznaczone} aktywna={grupa ? aktywna : null}
        zmien={(k, z) => setPozycje((l) => l.map((p) => (p.klucz === k ? { ...p, ...z } : p)))}
        zaznacz={(kl, tak) => setZaznaczone((x) => { const n = new Set(x); kl.forEach((k) => (tak ? n.add(k) : n.delete(k))); return n })}
        przygotuj={(g) => setAktywna(`${g.rodzaj}:${g.kategoria}`)} />
      {grupa && (
        <EdytorZapytania key={aktywna} grupa={grupa} numerZO="ZO/999/2026" ust={UST} dostawcy={DOSTAWCY} anuluj={() => setAktywna(null)}
          zapisz={async (z, odb) => {
            const id = `z${zapytania.length + 1}`
            setZapytania([{ id, temat: z.temat, tresc: z.tresc, kategoria: grupa.kategoria, utworzono: new Date().toISOString(), termin_odpowiedzi: z.termin, numer: 'ZO/999/2026' }, ...zapytania])
            setOdbiorcy([...odbiorcy, ...odb.map((o, i) => ({
              ...o, id: `${id}-${i}`, zapytanie_dostawcy_id: id, wyslano: null, oferta_id: null, odmowa: false, uwagi: null, zapytanie_id: 'dev',
              temat: z.temat, kategoria: grupa.kategoria, rodzaj: grupa.rodzaj, termin_odpowiedzi: z.termin, utworzono: new Date().toISOString(), oferta: null,
            }))])
            setAktywna(null)
          }} />
      )}
      <h3 className="text-sm font-semibold">Wysłane zapytania</h3>
      <TabelaZapytan zapytania={zapytania} odbiorcy={odbiorcy} dniBezOdpowiedzi={UST.dni_bez_odpowiedzi} mozeEdytowac pokazZO={false}
        wyslij={(z, o) => {
          setOstatniLink(linkMailto({ do: (o.email ?? '').split(',').map((x) => x.trim()), dw: UST.dw, temat: z.temat, tresc: z.tresc }).url)
          setOdbiorcy((l) => l.map((x) => (x.id === o.id ? { ...x, wyslano: new Date().toISOString() } : x)))
        }}
        oznacz={(o, zm) => setOdbiorcy((l) => l.map((x) => (x.id === o.id ? { ...x, ...(zm.wyslano === false ? { wyslano: null } : {}), ...(zm.odmowa !== undefined ? { odmowa: zm.odmowa } : {}) } : x)))}
        kopiuj={() => undefined} />
      {ostatniLink && <pre id="mailto" className="whitespace-pre-wrap break-all rounded bg-slate-100 p-2 text-xs">{ostatniLink}</pre>}
    </div>
  )
}

if (import.meta.env.DEV) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><DostawcaSlownikow><Podglad /></DostawcaSlownikow></React.StrictMode>,
  )
}

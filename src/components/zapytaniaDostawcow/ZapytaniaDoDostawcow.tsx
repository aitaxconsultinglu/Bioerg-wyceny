import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { uprawnienia, type Profil } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { GeneratorZapytan } from './GeneratorZapytan'
import { ListaZapytanDostawcow } from './ListaZapytanDostawcow'

/** Zakładka karty zapytania: generator zapytań do dostawców i status wysłanych zapytań. */
export function ZapytaniaDoDostawcow({ zapytanieId, numer, profil, zrodloStartowe }: {
  zapytanieId: string; numer: string; profil: Profil
  /** Otwarcie z karty analizy - generator od razu z usługami z karty. */
  zrodloStartowe?: 'analiza'
}) {
  const up = uprawnienia(profil)
  const [generator, setGenerator] = useState(!!zrodloStartowe && up.bazaOfert)
  const [odswiez, setOdswiez] = useState(0)
  const [info, setInfo] = useState<string | null>(null)
  return (
    <div className="space-y-4">
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {up.bazaOfert ? (
        <div className="flex items-center gap-2">
          <Button wariant={generator ? 'zwykly' : 'glowny'} onClick={() => { setGenerator(!generator); setInfo(null) }}>
            {generator ? <><X className="h-4 w-4" /> Zamknij generator</> : <><Plus className="h-4 w-4" /> Nowe zapytanie do dostawców</>}
          </Button>
          <span className="text-xs text-slate-500">Pozycje z wyceny albo z odczytu rysunku, osobne zapytanie dla każdej kategorii.</span>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Zapytania do dostawców wysyła dział handlowy - poniżej ich status.</p>
      )}
      {generator && (
        <GeneratorZapytan zapytanieId={zapytanieId} numer={numer} zrodloStartowe={zrodloStartowe}
          gotowe={(ile) => { setOdswiez((x) => x + 1); setInfo(`Zapisano zapytanie (${ile} odb.). Wyślij je przyciskiem „Wyślij” przy każdym odbiorcy.`) }} />
      )}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Wysłane zapytania</h4>
        <ListaZapytanDostawcow zapytanieId={zapytanieId} mozeEdytowac={up.bazaOfert} odswiez={odswiez} />
      </section>
    </div>
  )
}

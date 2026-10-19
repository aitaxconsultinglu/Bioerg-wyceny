import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL } from '@/lib/format'
import { Komunikat } from '../ui/komunikat'

interface Wpis {
  id: number
  tabela: string
  rekord_id: string | null
  akcja: string
  user_email: string | null
  zmiany: Record<string, unknown> | null
  czas: string
}

const AKCJE: Record<string, string> = { insert: 'dodanie', update: 'zmiana', delete: 'usunięcie' }

function opisZmian(w: Wpis) {
  if (!w.zmiany) return ''
  if (w.akcja !== 'update') return JSON.stringify(w.zmiany).slice(0, 160)
  return Object.entries(w.zmiany)
    .map(([k, v]) => {
      const { z, na } = v as { z: unknown; na: unknown }
      return `${k}: ${JSON.stringify(z)} → ${JSON.stringify(na)}`
    })
    .join('; ')
    .slice(0, 300)
}

/** Ostatnie zmiany z audit_log (zapisywane triggerami - kto, kiedy, co). */
export function HistoriaZmian() {
  const [wpisy, setWpisy] = useState<Wpis[]>([])
  const [blad, setBlad] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('audit_log').select('id, tabela, rekord_id, akcja, user_email, zmiany, czas')
      .order('czas', { ascending: false }).limit(200)
      .then(({ data, error }) => {
        if (error) setBlad(komunikatPL(error.message))
        else setWpisy((data ?? []) as Wpis[])
      })
  }, [])

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead><tr>
            <th className="komorka-naglowek">Kiedy</th><th className="komorka-naglowek">Kto</th>
            <th className="komorka-naglowek">Tabela</th><th className="komorka-naglowek">Rekord</th>
            <th className="komorka-naglowek">Akcja</th><th className="komorka-naglowek">Zmiany</th>
          </tr></thead>
          <tbody>
            {wpisy.map((w) => (
              <tr key={w.id}>
                <td className="komorka whitespace-nowrap text-slate-600">{dataGodzinaPL(w.czas)}</td>
                <td className="komorka">{w.user_email ?? <span className="text-slate-400">system</span>}</td>
                <td className="komorka">{w.tabela}</td>
                <td className="komorka text-slate-600">{w.rekord_id}</td>
                <td className="komorka">{AKCJE[w.akcja] ?? w.akcja}</td>
                <td className="komorka font-mono text-xs text-slate-600">{opisZmian(w)}</td>
              </tr>
            ))}
            {wpisy.length === 0 && !blad && <tr><td colSpan={6} className="komorka text-center text-slate-500">Brak zmian.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Podgląd deweloperski okna "Nowe zapytanie z maila" (tylko npm run dev, import-dev.html). Bez sesji: odczyt
// maila i propozycja pól działają, słownik klientów jest pusty, a zapis odmówi (RLS). Mail można upuścić
// albo podać ?mail=<ścieżka w folderze materiałów> - wtedy strona sama go "upuszcza".
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DostawcaSlownikow } from '@/lib/slowniki'
import { NoweZMaila } from '@/components/zapytania/NoweZMaila'

function Podglad() {
  const [otwarty, setOtwarty] = useState(true)
  const sciezka = new URLSearchParams(location.search).get('mail')
  useEffect(() => {
    if (!sciezka) return
    void (async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}__materialy/${sciezka.split('/').map(encodeURIComponent).join('/')}`)
      const plik = new File([await r.arrayBuffer()], sciezka.split('/').pop() ?? 'mail.eml')
      const dt = new DataTransfer()
      dt.items.add(plik)
      await new Promise((ok) => setTimeout(ok, 500))
      document.querySelector('[role="dialog"] label')?.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    })()
  }, [sciezka])
  return (
    <div className="p-4">
      <button className="underline" onClick={() => setOtwarty(true)}>Otwórz okno importu</button>
      <NoweZMaila otwarty={otwarty} zamknij={() => setOtwarty(false)} utworzone={(id) => window.alert(`utworzono ${id}`)} />
    </div>
  )
}

if (import.meta.env.DEV) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><DostawcaSlownikow><Podglad /></DostawcaSlownikow></React.StrictMode>,
  )
}

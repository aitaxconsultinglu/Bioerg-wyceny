/** Zapis pliku wygenerowanego w przeglądarce. */
export function pobierzPlik(dane: BlobPart, nazwa: string, typ: string) {
  const url = URL.createObjectURL(new Blob([dane], { type: typ }))
  const a = document.createElement('a')
  a.href = url
  a.download = nazwa
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Logo firmy z ustawień (data URL PNG) jako bajty do Excela i Worda; null, gdy administrator go nie wgrał. */
export function logoFirmy(firma: { logo?: string } | null | undefined): ArrayBuffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(firma?.logo ?? '')
  if (!m) return null
  const bin = atob(m[1])
  const bajty = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i)
  return bajty.buffer
}

export const nazwaPliku = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()

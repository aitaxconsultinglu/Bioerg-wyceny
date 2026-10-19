// Czytnik arkuszy (SheetJS) ładowany dopiero przy imporcie - nie obciąża startu aplikacji.
import type { WierszArkusza } from './importOptima'

export async function wierszeZPliku(dane: Uint8Array): Promise<WierszArkusza[]> {
  const { wierszePierwszegoArkusza } = await import('./arkusz')
  return wierszePierwszegoArkusza(dane)
}

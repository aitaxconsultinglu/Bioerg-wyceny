import { describe, expect, it } from 'vitest'
import { powodPominieciaZalacznika } from './dokumenty'

describe('załączniki maila: co nie jest dokumentem', () => {
  it('pomija logo, ikony, obrazki ze stopki, wizytówki, podpisy cyfrowe i pliki techniczne poczty', () => {
    expect(powodPominieciaZalacznika('image001.png', 300_000)).toMatch(/stopki/)
    expect(powodPominieciaZalacznika('logo.png', 60_000)).toMatch(/obrazek/)
    expect(powodPominieciaZalacznika('baner.gif', 900_000)).toMatch(/obrazek/)
    expect(powodPominieciaZalacznika('Jan Kowalski.vcf', 2_000)).toMatch(/wizytówka/)
    expect(powodPominieciaZalacznika('smime.p7s', 5_000)).toMatch(/podpis/)
    expect(powodPominieciaZalacznika('winmail.dat', 50_000)).not.toBeNull()
    expect(powodPominieciaZalacznika('zaproszenie.ics', 3_000)).not.toBeNull()
    expect(powodPominieciaZalacznika('pusty.pdf', 0)).toBe('pusty plik')
  })

  it('zostawia dokumenty i duże zdjęcia / skany', () => {
    for (const n of ['Rysunek zbiornika.pdf', 'Specyfikacja.docx', 'Formularz ofertowy.xlsx', 'archiwum.zip']) expect(powodPominieciaZalacznika(n, 120_000)).toBeNull()
    expect(powodPominieciaZalacznika('skan oferty.jpg', 1_200_000)).toBeNull()
  })
})

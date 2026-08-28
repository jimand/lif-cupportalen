import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseEmailToCup } from './emailParser';

/**
 * Parsern är ren heuristik över fritext och skapar cuper automatiskt från
 * inkommande mail. Den är samtidigt den mest felbenägna koden i projektet och
 * den svåraste att felsöka i efterhand – ett feltolkat mail syns bara som en
 * konstig cup i adminlistan.
 *
 * Flera test nedan dokumenterar känt svagt beteende snarare än önskat. De är
 * markerade med KÄNT PROBLEM och finns för att fånga oavsiktliga förändringar
 * och för att göra bristerna synliga.
 */

// Åldersutvinningen använder new Date().getFullYear(), så testerna måste låsa
// tiden – annars ger samma mail olika resultat nästa kalenderår.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-28T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('parseEmailToCup – namn', () => {
  it('använder ämnesraden som cupnamn', () => {
    expect(parseEmailToCup('Ulvacupen 2026', '').name).toBe('Ulvacupen 2026');
  });

  it('strippar Re:, Sv: och Fwd:-prefix', () => {
    expect(parseEmailToCup('Re: Ulvacupen', '').name).toBe('Ulvacupen');
    expect(parseEmailToCup('FWD: Ulvacupen', '').name).toBe('Ulvacupen');
    expect(parseEmailToCup('fw: Ulvacupen', '').name).toBe('Ulvacupen');
  });

  it('ger undefined för tom ämnesrad', () => {
    expect(parseEmailToCup('', 'brödtext').name).toBeUndefined();
  });

  it('KÄNT PROBLEM: hela ämnesraden blir namn, även när den innehåller brus', () => {
    const r = parseEmailToCup('VIKTIGT!! Anmälan till Ulvacupen öppnar nu – svara senast fredag', '');
    expect(r.name).toBe('VIKTIGT!! Anmälan till Ulvacupen öppnar nu – svara senast fredag');
  });
});

describe('parseEmailToCup – datum', () => {
  it('läser ISO-datum', () => {
    const r = parseEmailToCup('Cup', 'Spelas 2026-06-12 till 2026-06-14.');
    expect(r.start_date).toBe('2026-06-12');
    expect(r.end_date).toBe('2026-06-14');
  });

  it('läser svenska månadsnamn', () => {
    const r = parseEmailToCup('Cup', 'Cupen går av stapeln 12 juni 2026 och slutar 14 juni 2026.');
    expect(r.start_date).toBe('2026-06-12');
    expect(r.end_date).toBe('2026-06-14');
  });

  it('läser numeriskt format med snedstreck', () => {
    expect(parseEmailToCup('Cup', 'Datum: 12/6/2026').start_date).toBe('2026-06-12');
  });

  it('ger inget slutdatum när bara ett datum finns', () => {
    const r = parseEmailToCup('Cup', 'Endagsturnering 2026-06-12.');
    expect(r.start_date).toBe('2026-06-12');
    expect(r.end_date).toBeUndefined();
  });

  it('ger undefined när inget datum finns', () => {
    expect(parseEmailToCup('Cup', 'Ingen information än.').start_date).toBeUndefined();
  });

  it('KÄNT PROBLEM: ett datum i sidfoten förskjuter cupens period', () => {
    const r = parseEmailToCup('Cup', [
      'Cupen spelas 2026-06-12 till 2026-06-14.',
      '',
      'Sista anmälningsdag är 2026-03-01.',
      'Fakturan förfaller 2026-12-31.',
    ].join('\n'));
    // Första och sista datumet i hela mailet vinner, oavsett vad de betyder.
    expect(r.start_date).toBe('2026-03-01');
    expect(r.end_date).toBe('2026-12-31');
  });
});

describe('parseEmailToCup – åldersklasser', () => {
  it('läser lagbeteckningar som P10 och F12', () => {
    expect(parseEmailToCup('Cup', 'Klasser: P10, F12, P14').age_classes).toBe('10,12,14');
  });

  it('läser åldersintervall', () => {
    expect(parseEmailToCup('Cup', 'För 10-12 år').age_classes).toBe('10,11,12');
  });

  it('läser enskild ålder', () => {
    expect(parseEmailToCup('Cup', 'Endast 11 år').age_classes).toBe('11');
  });

  it('ignorerar åldrar utanför 7–18', () => {
    expect(parseEmailToCup('Cup', 'För 5 år och 25 år').age_classes).toBeUndefined();
  });

  it('KÄNT PROBLEM: varje fyrsiffrigt 20xx tolkas som födelseår', () => {
    // "Cupen 2026" i ämnet ger inga åldrar (2026 -> 0 år, utanför intervallet),
    // men ett årtal i sidfoten kan hamna innanför och ge falska åldersklasser.
    const r = parseEmailToCup('Cup', 'Copyright 2012 Föreningen. Alla rättigheter förbehållna.');
    expect(r.age_classes).toBe('14'); // 2026 - 2012
  });

  it('KÄNT PROBLEM: resultatet beror på vilket år parsningen körs', () => {
    const nu = parseEmailToCup('Cup', 'Födda 2015');
    expect(nu.age_classes).toBe('11'); // 2026 - 2015

    vi.setSystemTime(new Date('2027-08-28T12:00:00Z'));
    const nastaAr = parseEmailToCup('Cup', 'Födda 2015');
    expect(nastaAr.age_classes).toBe('12'); // samma mail, annat svar
  });
});

describe('parseEmailToCup – plats', () => {
  it('läser "Plats:"-prefix', () => {
    expect(parseEmailToCup('Cup', 'Plats: Landvetter IP').location).toBe('Landvetter IP');
  });

  it('läser "Ort:"-prefix', () => {
    expect(parseEmailToCup('Cup', 'Ort: Göteborg\nAnnat: nej').location).toBe('Göteborg');
  });

  it('läser "spelas i <Ort>"', () => {
    expect(parseEmailToCup('Cup', 'Turneringen spelas i Mölndal under helgen.').location).toBe('Mölndal');
  });

  it('ger undefined när ingen plats hittas', () => {
    expect(parseEmailToCup('Cup', 'Vi ses snart!').location).toBeUndefined();
  });
});

describe('parseEmailToCup – länk och beskrivning', () => {
  it('plockar första länken ur brödtexten', () => {
    expect(parseEmailToCup('Cup', 'Info: https://ulvacupen.se/anmalan').url).toBe('https://ulvacupen.se/anmalan');
  });

  it('letar länk bara i brödtexten, inte i ämnet', () => {
    expect(parseEmailToCup('Cup https://exempel.se', 'Ingen länk här.').url).toBeUndefined();
  });

  it('ger undefined som beskrivning för mycket kort brödtext', () => {
    expect(parseEmailToCup('Cup', 'Kort.').description).toBeUndefined();
  });

  it('tar de tio första raderna som beskrivning', () => {
    const body = Array.from({ length: 20 }, (_, i) => `Rad ${i + 1} med lite text`).join('\n');
    const r = parseEmailToCup('Cup', body);
    expect(r.description).toContain('Rad 1');
    expect(r.description).toContain('Rad 10');
    expect(r.description).not.toContain('Rad 11');
  });

  it('KÄNT PROBLEM: HTML-mail ger rå markup som beskrivning', () => {
    const r = parseEmailToCup('Cup', '<html><body><table><tr><td>Ulvacupen spelas i juni</td></tr></table></body></html>');
    expect(r.description).toContain('<html>');
  });
});

describe('parseEmailToCup – helhet', () => {
  it('parsar ett välformat mail korrekt', () => {
    const r = parseEmailToCup('Ulvacupen 2026', [
      'Hej!',
      '',
      'Ulvacupen spelas i Mölndal.',
      'Datum: 2026-06-12 till 2026-06-14',
      'Klasser: P10, P11, F10',
      'Anmälan: https://ulvacupen.se',
    ].join('\n'));

    expect(r.name).toBe('Ulvacupen 2026');
    expect(r.location).toBe('Mölndal');
    expect(r.start_date).toBe('2026-06-12');
    expect(r.end_date).toBe('2026-06-14');
    expect(r.age_classes).toBe('10,11');
    expect(r.url).toBe('https://ulvacupen.se');
  });

  it('skapar ingen cup utan namn och startdatum (pollerns villkor)', () => {
    // gmail.ts skapar bara en cup när både name och start_date finns.
    const r = parseEmailToCup('Autosvar: Jag är på semester', 'Återkommer i augusti.');
    expect(r.start_date).toBeUndefined();
  });
});

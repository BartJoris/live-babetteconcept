import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
  buildEmileetidaPriceLookup,
  buildOrderConfirmationSrpMap,
  emileetidaPriceKey,
  isEmileetidaOrderConfirmationCsv,
  lookupEmileetidaRrp,
} from './prices';

const CONFIRMATION_SNIPPET = `
;;;;;;;;;;;;;;;Currency;;;Euro
;;;;EUR;;;;;;;;;;;;;EUR;EUR
;STYLE;REFERENCE;VARIANT;SRP;SIZES;;;;;;;;;;;QTY;UNIT;TOTAL
;ECHARPE;;;;;TU;;;;;;;;;;;
;;IDA-ELEA;CHATAIGNE;119,00;;2;;;;;;;;;;2;45,80;91,60
;;Origin: MADE IN PORTUGAL;;;;;;;;;;;;;;;;
;;IDA-ELEA;MARS;119,00;;2;;;;;;;;;;2;45,80;91,60
;BONNET;;;;;TU;;;;;;;;;;;
;;IDA-EVELAND;CHATAIGNE;59,00;;3;;;;;;;;;;3;22,70;68,10
;PANTALON VELOURS LARGE;;;;;XXS;XS;S;M;L;XL;;;;;;;;
;;IDA-EDGAR;FARINE;159,00;;;1;1;1;1;1;;;;;5;61,20;306,00
;;IDA-EWEN;DENIM BLEACH;139,00;;;1;1;1;1;1;;;;;5;53,50;267,50
;;IDA-EDOUNIA1;HELSINSKI;149,00;;;1;1;1;1;1;;;;;5;57,30;286,50
`.trim();

describe('Emile et Ida order confirmation SRP', () => {
  it('detects confirmation CSV', () => {
    expect(isEmileetidaOrderConfirmationCsv(CONFIRMATION_SNIPPET)).toBe(true);
    expect(
      isEmileetidaOrderConfirmationCsv(
        'Order id;Product name;Product reference;EAN13\n1;X;IDA-ELEA;123',
      ),
    ).toBe(false);
  });

  it('builds SRP map keyed by reference + color', () => {
    const map = buildOrderConfirmationSrpMap(CONFIRMATION_SNIPPET);
    expect(map.get(emileetidaPriceKey('IDA-ELEA', 'CHATAIGNE'))).toBe(119);
    expect(map.get(emileetidaPriceKey('IDA-ELEA', 'MARS'))).toBe(119);
    expect(map.get(emileetidaPriceKey('IDA-EVELAND', 'CHATAIGNE'))).toBe(59);
    expect(map.get(emileetidaPriceKey('IDA-EDGAR', 'FARINE'))).toBe(159);
    expect(map.get(emileetidaPriceKey('IDA-EWEN', 'DENIM BLEACH'))).toBe(139);
    expect(map.get(emileetidaPriceKey('IDA-EDOUNIA1', 'HELSINSKI'))).toBe(149);
  });

  it('lookup prefers SRP over 2.5x fallback', () => {
    const lookup = buildEmileetidaPriceLookup(CONFIRMATION_SNIPPET);
    expect(
      lookupEmileetidaRrp(lookup, '', 'IDA-ELEA', 'CHATAIGNE', 45.8),
    ).toBe(119);
    expect(lookupEmileetidaRrp(lookup, '', 'UNKNOWN', 'X', 40)).toBe(100);
  });
});

describe('Emile et Ida RRP AW26 file (if present)', () => {
  it('parses all 18 SRP rows from Downloads confirmation', () => {
    let text: string;
    try {
      text = readFileSync(
        '/Users/bajoris/Downloads/Emile & Ida RRP AW26.csv',
        'utf8',
      );
    } catch {
      // Optional local fixture — skip when unavailable in CI
      return;
    }

    expect(isEmileetidaOrderConfirmationCsv(text)).toBe(true);
    const map = buildOrderConfirmationSrpMap(text);
    expect(map.size).toBe(18);
    expect(map.get(emileetidaPriceKey('IDA-ELEA', 'CHATAIGNE'))).toBe(119);
    expect(map.get(emileetidaPriceKey('IDA-ECORA', 'CHATAIGNE'))).toBe(219);
  });
});

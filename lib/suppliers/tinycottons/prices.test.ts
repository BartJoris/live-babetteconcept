import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildTinycottonsRrpMap,
  isTinycottonsRrpCsv,
  lookupTinycottonsRrp,
  tinycottonsRrpKey,
} from './prices';

const RRP_PATH = join(__dirname, 'samples', 'Tiny_RRP.csv');

describe('Tinycottons RRP export (STYLE;REFERENCE;VARIANT;SRP)', () => {
  const text = readFileSync(RRP_PATH, 'utf8');

  it('is detected as a Tinycottons RRP CSV', () => {
    expect(isTinycottonsRrpCsv(text)).toBe(true);
    expect(
      isTinycottonsRrpCsv('Order id;Product name;Product reference;EAN13\n1;X;AW26-602;123'),
    ).toBe(false);
  });

  it('builds an SRP map keyed by reference + variant, matching the 17 real order refs', () => {
    const map = buildTinycottonsRrpMap(text);
    expect(map.get(tinycottonsRrpKey('AW26-602', 'FRILLS LONG COAT L15'))).toBe(299);
    expect(map.get(tinycottonsRrpKey('AW26-652', 'DOTS FLOWERS SHERPA JACKET P24'))).toBe(199);
    expect(map.get(tinycottonsRrpKey('AW26-845', 'FRANK STRIPED POLO U43'))).toBe(139);
    expect(map.get(tinycottonsRrpKey('AW26-734', 'Buttoned Cardigan 107'))).toBe(129);
    // AW26-678's SRP cell is empty in the export -> not in the map.
    expect(map.has(tinycottonsRrpKey('AW26-678', 'CHECK SCARF NECK LARA CARDIGAN U05'))).toBe(false);
    expect(map.size).toBe(16);
  });

  it('lookup prefers the real SRP over the 1.2x fallback', () => {
    const map = buildTinycottonsRrpMap(text);
    expect(lookupTinycottonsRrp(map, 'AW26-602', 'FRILLS LONG COAT L15', 110.7)).toBe(299);
    // Missing SRP row -> falls back to 1.2x wholesale.
    expect(lookupTinycottonsRrp(map, 'AW26-678', 'CHECK SCARF NECK LARA CARDIGAN U05', 51.5)).toBeCloseTo(51.5 * 1.2);
    // Unknown reference -> falls back too.
    expect(lookupTinycottonsRrp(map, 'UNKNOWN', 'X', 40)).toBeCloseTo(48);
  });
});

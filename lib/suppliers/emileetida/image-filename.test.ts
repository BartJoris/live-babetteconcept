import { describe, expect, it } from 'vitest';
import {
  colorsMatchEmileetida,
  extractEmileetidaImageInfo,
  extractEmileetidaReferences,
} from './image-filename';

describe('extractEmileetidaImageInfo', () => {
  it('parses legacy AD hyphen filenames', () => {
    expect(extractEmileetidaImageInfo('AD008-creme-01.jpg')).toEqual({
      ref: 'AD008',
      color: 'creme',
      isLifestyle: false,
      imageNumber: 1,
    });
    expect(extractEmileetidaImageInfo('AD207B-lizeron-BB.jpg')).toMatchObject({
      ref: 'AD207B',
      color: 'lizeron',
      imageNumber: 0,
    });
  });

  it('parses IDA woman filenames from AW26 pack', () => {
    expect(extractEmileetidaImageInfo('IDA-EARL-farine-01.jpg')).toEqual({
      ref: 'IDA-EARL',
      color: 'farine',
      isLifestyle: false,
      imageNumber: 1,
    });
    expect(extractEmileetidaImageInfo('IDA-ELEA-MARS.jpg')).toEqual({
      ref: 'IDA-ELEA',
      color: 'MARS',
      isLifestyle: false,
      imageNumber: 0,
    });
    expect(extractEmileetidaImageInfo('IDA-ELEA-chataigne.jpg')).toEqual({
      ref: 'IDA-ELEA',
      color: 'chataigne',
      isLifestyle: false,
      imageNumber: 0,
    });
    expect(
      extractEmileetidaImageInfo('IDA-EDIVA-carreau-foret-01.jpg'),
    ).toEqual({
      ref: 'IDA-EDIVA',
      color: 'carreau-foret',
      isLifestyle: false,
      imageNumber: 1,
    });
    expect(
      extractEmileetidaImageInfo('IDA-EFOULARD2-rosalie-bleu.jpg'),
    ).toEqual({
      ref: 'IDA-EFOULARD2',
      color: 'rosalie-bleu',
      isLifestyle: false,
      imageNumber: 0,
    });
    expect(
      extractEmileetidaImageInfo('IDA-ELLEN-rayure beige-01.jpg'),
    ).toEqual({
      ref: 'IDA-ELLEN',
      color: 'rayure beige',
      isLifestyle: false,
      imageNumber: 1,
    });
    expect(
      extractEmileetidaImageInfo('IDA-EWEN-denim-bleu-01.jpg'),
    ).toEqual({
      ref: 'IDA-EWEN',
      color: 'denim-bleu',
      isLifestyle: false,
      imageNumber: 1,
    });
  });

  it('parses AE accessory filenames', () => {
    expect(extractEmileetidaImageInfo('AE119-BB-blush-01.jpg')).toEqual({
      ref: 'AE119',
      color: 'blush',
      isLifestyle: false,
      imageNumber: 1,
    });
    expect(
      extractEmileetidaImageInfo('AEBANANA1-vichy-acajou.jpg'),
    ).toEqual({
      ref: 'AEBANANA1',
      color: 'vichy-acajou',
      isLifestyle: false,
      imageNumber: 0,
    });
  });
});

describe('colorsMatchEmileetida', () => {
  it('matches spaced CSV colors to hyphenated filenames', () => {
    expect(colorsMatchEmileetida('CARREAU FORET', 'carreau-foret')).toBe(true);
    expect(colorsMatchEmileetida('ROSALIE BLEU', 'rosalie-bleu')).toBe(true);
    expect(colorsMatchEmileetida('DENIM BLEACH', 'denim-bleu')).toBe(true);
    expect(colorsMatchEmileetida('CHATAIGNE', 'chataigne')).toBe(true);
    expect(colorsMatchEmileetida('MARS', 'MARS')).toBe(true);
  });
});

describe('AW26 order ↔ image pack matching', () => {
  const orderLines: Array<[string, string]> = [
    ['IDA-ECLAT', 'ECRU'],
    ['IDA-ECLAT', 'MIDNIGHT'],
    ['IDA-ECORA', 'CHATAIGNE'],
    ['IDA-EDGAR', 'FARINE'],
    ['IDA-EDIVA', 'CARREAU FORET'],
    ['IDA-EDOUNIA1', 'HELSINSKI'],
    ['IDA-EFOULARD2', 'ROSALIE BLEU'],
    ['IDA-EFOULARD4', 'PRUNIE'],
    ['IDA-EFOULARD5', 'BRUME'],
    ['IDA-ELEA', 'CHATAIGNE'],
    ['IDA-ELEA', 'MARS'],
    ['IDA-ELIANE', 'ECRU'],
    ['IDA-EMELINE', 'MIDNIGHT'],
    ['IDA-ENRICO', 'EBENE'],
    ['IDA-EQUINOXE', 'MIDNIGHT'],
    ['IDA-EVELAND', 'CHATAIGNE'],
    ['IDA-EVELAND', 'MARS'],
    ['IDA-EWEN', 'DENIM BLEACH'],
  ];

  const pack = [
    'IDA-ECLAT-ecru-01.jpg',
    'IDA-ECLAT-ecru-02.jpg',
    'IDA-ECLAT-midnight-01.jpg',
    'IDA-ECORA-chataigne-01.jpg',
    'IDA-EDGAR-farine-01.jpg',
    'IDA-EDIVA-carreau-foret-01.jpg',
    'IDA-EDOUNIA1-helsinki-01.jpg',
    'IDA-EFOULARD2-rosalie-bleu.jpg',
    'IDA-EFOULARD4-prunie.jpg',
    'IDA-EFOULARD5-brume.jpg',
    'IDA-ELEA-chataigne.jpg',
    'IDA-ELEA-MARS.jpg',
    'IDA-ELIANE-ecru-01.jpg',
    'IDA-EMELINE-midnight-01.jpg',
    'IDA-ENRICO-ebene-01.jpg',
    'IDA-EQUINOXE-midnight-01.jpg',
    'IDA-EVELAND-chataigne.jpg',
    'IDA-EVELAND-mars.jpg',
    'IDA-EWEN-denim-bleu-01.jpg',
  ];

  it('matches every AW26 order line to at least one pack image', () => {
    for (const [ref, color] of orderLines) {
      const hits = pack.filter((filename) => {
        const info = extractEmileetidaImageInfo(filename);
        return (
          info.ref === ref && colorsMatchEmileetida(color, info.color)
        );
      });
      expect(hits, `${ref} / ${color}`).not.toHaveLength(0);
    }
  });

  it('extracts references for scan API', () => {
    expect(extractEmileetidaReferences('IDA-EDGAR-farine-02.jpg')).toEqual([
      'IDA-EDGAR',
    ]);
    expect(extractEmileetidaReferences('AE119-BB-blush-01.jpg')).toEqual([
      'AE119',
    ]);
  });
});

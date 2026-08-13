import { describe, expect, it } from 'vitest';
import { toEcommerceHtml } from './ecommerce-html';

describe('toEcommerceHtml', () => {
  it('converts Babette markdown with materiaal before Over-merk', () => {
    const md = `## Play Up – Gestreepte jersey sweater

De **gestreepte jersey sweater** van Play Up heeft een drawing-print.

Mooi om casual te combineren.

**Materiaal:** 89% katoen, 10% gerecycled katoen, 1% elastaan.

### Over Play Up

Play Up is een Portugees kinderkledingmerk.`;

    const html = toEcommerceHtml(md);
    expect(html).toContain('<h2>Play Up – Gestreepte jersey sweater</h2>');
    expect(html).toContain(
      '<p>De <strong>gestreepte jersey sweater</strong> van Play Up heeft een drawing-print.</p>',
    );
    expect(html).toContain(
      '<p><strong>Materiaal:</strong> 89% katoen, 10% gerecycled katoen, 1% elastaan.</p>',
    );
    expect(html).toContain('<h3>Over Play Up</h3>');
    expect(html.indexOf('Materiaal:')).toBeLessThan(html.indexOf('Over Play Up'));
    expect(html).not.toContain('##');
    expect(html).not.toContain('**');
  });

  it('passes through existing HTML unchanged', () => {
    const html = '<h2>Titel</h2>\n<p>Tekst met <strong>vet</strong>.</p>';
    expect(toEcommerceHtml(html)).toBe(html);
  });

  it('wraps plain text paragraphs', () => {
    expect(toEcommerceHtml('Regel één.\n\nRegel twee.')).toBe(
      '<p>Regel één.</p>\n<p>Regel twee.</p>',
    );
  });
});

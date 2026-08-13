/**
 * Convert Babette AI product copy (Markdown or plain text) to HTML for
 * Odoo `description_ecommerce`, which the website renders as HTML.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markdown: **bold** only (Babette copy does not need italics). */
function inlineMarkdownToHtml(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function looksLikeHtml(text: string): boolean {
  return /<\/?(?:p|h[1-6]|strong|em|br|ul|ol|li|div)\b/i.test(text);
}

/**
 * Normalize ecommerce description to HTML suitable for Odoo website.
 * - Already-HTML input is returned trimmed (unchanged structure).
 * - Markdown headings/paragraphs/bold are converted.
 */
export function toEcommerceHtml(raw: string): string {
  let trimmed = raw.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return '';

  // Strip accidental fenced code blocks from the model
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)```$/i);
  if (fenced) {
    trimmed = fenced[1].trim();
  }

  if (looksLikeHtml(trimmed)) {
    return trimmed;
  }

  const lines = trimmed.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (!text) return;
    blocks.push(`<p>${inlineMarkdownToHtml(text)}</p>`);
  };

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) {
      flushParagraph();
      continue;
    }

    const h2 = stripped.match(/^##\s+(.+)$/);
    if (h2) {
      flushParagraph();
      blocks.push(`<h2>${inlineMarkdownToHtml(h2[1].trim())}</h2>`);
      continue;
    }

    const h3 = stripped.match(/^###\s+(.+)$/);
    if (h3) {
      flushParagraph();
      blocks.push(`<h3>${inlineMarkdownToHtml(h3[1].trim())}</h3>`);
      continue;
    }

    // Plain "Over Merk" / "Materiaal:" lines without markdown heading
    if (/^over\s+/i.test(stripped) && !stripped.includes(':') && stripped.length < 80) {
      flushParagraph();
      blocks.push(`<h3>${inlineMarkdownToHtml(stripped)}</h3>`);
      continue;
    }

    paragraph.push(stripped);
  }
  flushParagraph();

  return blocks.join('\n');
}

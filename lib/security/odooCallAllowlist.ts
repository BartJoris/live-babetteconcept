/**
 * Allowlist for `/api/odoo-call` — only model/method pairs used by the UI.
 * Dedicated server routes use odooClient directly and are unaffected.
 */
const ALLOWED: Readonly<Record<string, ReadonlySet<string>>> = {
  'product.template': new Set(['search_read', 'write']),
  'product.image': new Set(['search_read', 'create', 'unlink']),
  'product.product': new Set(['search_read', 'write']),
  'product.template.attribute.value': new Set(['read']),
  'product.attribute.value': new Set(['read']),
  'pos.session': new Set(['search_read']),
  'pos.order': new Set(['search_read']),
  'pos.payment': new Set(['search_read']),
};

export function isOdooCallAllowed(model: string, method: string): boolean {
  const methods = ALLOWED[model];
  if (!methods) return false;
  return methods.has(method);
}

export function listAllowedOdooCalls(): Array<{ model: string; method: string }> {
  const out: Array<{ model: string; method: string }> = [];
  for (const [model, methods] of Object.entries(ALLOWED)) {
    for (const method of methods) {
      out.push({ model, method });
    }
  }
  return out;
}

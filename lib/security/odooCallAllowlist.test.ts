import { describe, expect, it } from 'vitest';
import { isOdooCallAllowed } from './odooCallAllowlist';

describe('isOdooCallAllowed', () => {
  it('allows known UI model/method pairs', () => {
    expect(isOdooCallAllowed('product.template', 'search_read')).toBe(true);
    expect(isOdooCallAllowed('product.image', 'create')).toBe(true);
    expect(isOdooCallAllowed('pos.session', 'search_read')).toBe(true);
    expect(isOdooCallAllowed('product.product', 'write')).toBe(true);
  });

  it('rejects unknown models or methods', () => {
    expect(isOdooCallAllowed('res.users', 'search_read')).toBe(false);
    expect(isOdooCallAllowed('product.template', 'unlink')).toBe(false);
    expect(isOdooCallAllowed('ir.config_parameter', 'search_read')).toBe(false);
  });
});

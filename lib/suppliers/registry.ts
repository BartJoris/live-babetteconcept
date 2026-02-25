/**
 * Supplier plugin registry.
 * Central place to register and retrieve supplier plugins.
 */

import type { SupplierPlugin, ParseContext, Brand } from './types';

const plugins = new Map<string, SupplierPlugin>();

export function registerSupplier(plugin: SupplierPlugin): void {
  if (plugins.has(plugin.id)) {
    console.warn(`Supplier plugin "${plugin.id}" is already registered, overwriting.`);
  }
  plugins.set(plugin.id, plugin);
}

export function getSupplier(id: string): SupplierPlugin | undefined {
  return plugins.get(id);
}

export function getAllSuppliers(): SupplierPlugin[] {
  return Array.from(plugins.values());
}

export function getSupplierIds(): string[] {
  return Array.from(plugins.keys());
}

/**
 * Create a ParseContext from runtime data.
 */
export function createParseContext(brands: Brand[], vendorId: string): ParseContext {
  return {
    brands,
    vendorId,
    findBrand: (...searchTerms: string[]) => {
      for (const term of searchTerms) {
        const found = brands.find(b =>
          b.name.toLowerCase().includes(term.toLowerCase())
        );
        if (found) return found;
      }
      return undefined;
    },
  };
}

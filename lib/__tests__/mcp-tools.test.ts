import { describe, expect, it } from 'vitest';
import { executeTool, getToolsByAccess, MCP_TOOLS } from '@/lib/mcp/tools';

describe('MCP tools access control', () => {
  it('registers only read tools for now', () => {
    expect(MCP_TOOLS.every((t) => t.access === 'read')).toBe(true);
    expect(getToolsByAccess('read').length).toBe(MCP_TOOLS.length);
    expect(getToolsByAccess('write')).toEqual([]);
  });

  it('rejects write access when caller is read-restricted', async () => {
    // Simulate a future write tool without mutating the live registry permanently.
    const writeTool = {
      name: '__test_write__',
      description: 'test',
      access: 'write' as const,
      inputSchema: MCP_TOOLS[0].inputSchema,
      execute: async () => 'should-not-run',
    };
    MCP_TOOLS.push(writeTool);

    try {
      await expect(
        executeTool('__test_write__', {}, { allowedAccess: 'read' })
      ).rejects.toThrow(/restricted to "read"/);
    } finally {
      MCP_TOOLS.pop();
    }
  });

  it('lists expected read tools', () => {
    const names = getToolsByAccess('read').map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'ping',
        'search_products',
        'get_product',
        'get_open_pos_session',
        'get_pos_sales_summary',
        'list_brands',
        'list_recent_webshop_orders',
        'get_retail_calendar',
        'list_categories',
        'analyze_assortment',
        'rank_brands',
        'analyze_solden_discounts',
        'get_stock_summary',
        'list_last_size_left',
        'list_aged_stock',
        'count_assortment',
      ])
    );
  });
});

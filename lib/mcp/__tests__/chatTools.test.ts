import { describe, expect, it } from 'vitest';
import { createMcpAiTools } from '@/lib/mcp/chatTools';
import { getToolsByAccess } from '@/lib/mcp/tools';

describe('createMcpAiTools', () => {
  it('exposes every read MCP tool to the AI SDK tool set', () => {
    const aiTools = createMcpAiTools();
    const readNames = getToolsByAccess('read').map((t) => t.name);
    expect(Object.keys(aiTools).sort()).toEqual([...readNames].sort());
  });
});

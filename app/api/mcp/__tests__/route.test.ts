import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/mcp-server', () => ({
  handleReadOnlyMcpRequest: vi.fn(async () => new Response('mcp-ok', { status: 200 })),
}));

describe('GET/POST /api/mcp auth', () => {
  const original = process.env.MCP_API_TOKEN;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MCP_API_TOKEN;
    } else {
      process.env.MCP_API_TOKEN = original;
    }
  });

  it('returns 503 when MCP_API_TOKEN is not configured', async () => {
    delete process.env.MCP_API_TOKEN;
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/mcp') as never);
    expect(res.status).toBe(503);
  });

  it('returns 401 without Authorization header', async () => {
    process.env.MCP_API_TOKEN = 'test-secret';
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/mcp') as never);
    expect(res.status).toBe(401);
  });

  it('forwards to MCP handler when Bearer token matches', async () => {
    process.env.MCP_API_TOKEN = 'test-secret';
    const { handleReadOnlyMcpRequest } = await import('@/lib/mcp-server');
    const { GET } = await import('../route');

    const res = await GET(
      new Request('http://localhost/api/mcp', {
        headers: { Authorization: 'Bearer test-secret' },
      }) as never
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('mcp-ok');
    expect(handleReadOnlyMcpRequest).toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { authorizeMcpRequest } from '@/lib/mcp-auth';

describe('authorizeMcpRequest', () => {
  const original = process.env.MCP_API_TOKEN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MCP_API_TOKEN;
    } else {
      process.env.MCP_API_TOKEN = original;
    }
  });

  it('returns disabled when MCP_API_TOKEN is unset', () => {
    delete process.env.MCP_API_TOKEN;
    expect(authorizeMcpRequest('Bearer anything')).toBe('disabled');
  });

  it('returns disabled when MCP_API_TOKEN is blank', () => {
    process.env.MCP_API_TOKEN = '   ';
    expect(authorizeMcpRequest('Bearer anything')).toBe('disabled');
  });

  it('returns unauthorized when Authorization header is missing', () => {
    process.env.MCP_API_TOKEN = 'secret-token';
    expect(authorizeMcpRequest(null)).toBe('unauthorized');
    expect(authorizeMcpRequest(undefined)).toBe('unauthorized');
  });

  it('returns unauthorized when scheme is not Bearer', () => {
    process.env.MCP_API_TOKEN = 'secret-token';
    expect(authorizeMcpRequest('Basic secret-token')).toBe('unauthorized');
  });

  it('returns unauthorized for wrong token', () => {
    process.env.MCP_API_TOKEN = 'secret-token';
    expect(authorizeMcpRequest('Bearer wrong-token')).toBe('unauthorized');
  });

  it('returns unauthorized for different-length wrong token', () => {
    process.env.MCP_API_TOKEN = 'secret-token';
    expect(authorizeMcpRequest('Bearer x')).toBe('unauthorized');
  });

  it('returns ok for matching Bearer token', () => {
    process.env.MCP_API_TOKEN = 'secret-token';
    expect(authorizeMcpRequest('Bearer secret-token')).toBe('ok');
  });

  it('trims whitespace around the configured token', () => {
    process.env.MCP_API_TOKEN = '  secret-token  ';
    expect(authorizeMcpRequest('Bearer secret-token')).toBe('ok');
  });
});

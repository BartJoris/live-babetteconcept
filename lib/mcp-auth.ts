import { timingSafeEqual } from 'crypto';
import {
  getMcpIssuerUrl,
  getMcpResourceUrl,
} from '@/lib/mcp/oauth/baseUrl';
import { getResourceMetadataUrl } from '@/lib/mcp/oauth/metadata';
import { verifyAccessToken } from '@/lib/mcp/oauth/tokens';

export type McpAuthResult = 'ok' | 'disabled' | 'unauthorized';

function tokenEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Validates Authorization: Bearer <token> against MCP_API_TOKEN
 * or a valid MCP OAuth access JWT.
 * Fail closed when MCP_API_TOKEN is unset — the remote MCP endpoint stays disabled.
 */
export function authorizeMcpRequest(
  authorizationHeader: string | null | undefined,
  request?: Request
): McpAuthResult {
  const expected = process.env.MCP_API_TOKEN?.trim();
  if (!expected) return 'disabled';

  if (!authorizationHeader?.startsWith('Bearer ')) return 'unauthorized';
  const provided = authorizationHeader.slice('Bearer '.length).trim();
  if (!provided) return 'unauthorized';

  if (tokenEquals(provided, expected)) return 'ok';

  const resource = getMcpResourceUrl(request);
  const issuer = getMcpIssuerUrl(request);
  const oauth = verifyAccessToken(provided, resource, issuer);
  return oauth ? 'ok' : 'unauthorized';
}

/** WWW-Authenticate challenge pointing clients at Protected Resource Metadata. */
export function mcpWwwAuthenticateHeader(request?: Request): string {
  const metadataUrl = getResourceMetadataUrl(request);
  return `Bearer realm="mcp", resource_metadata="${metadataUrl}"`;
}

/** Timing-safe check that a submitted password matches MCP_API_TOKEN. */
export function verifyMcpApiToken(candidate: string | null | undefined): boolean {
  const expected = process.env.MCP_API_TOKEN?.trim();
  if (!expected || !candidate) return false;
  return tokenEquals(candidate.trim(), expected);
}

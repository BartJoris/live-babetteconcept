import { timingSafeEqual } from 'crypto';

export type McpAuthResult = 'ok' | 'disabled' | 'unauthorized';

/**
 * Validates Authorization: Bearer <token> against MCP_API_TOKEN.
 * Fail closed when the env var is unset — the remote MCP endpoint stays disabled.
 */
export function authorizeMcpRequest(
  authorizationHeader: string | null | undefined
): McpAuthResult {
  const expected = process.env.MCP_API_TOKEN?.trim();
  if (!expected) return 'disabled';

  if (!authorizationHeader?.startsWith('Bearer ')) return 'unauthorized';
  const provided = authorizationHeader.slice('Bearer '.length).trim();
  if (!provided) return 'unauthorized';

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return 'unauthorized';
  return timingSafeEqual(a, b) ? 'ok' : 'unauthorized';
}

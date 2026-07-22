import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * trailingSlash: true would 308 /api/mcp → /api/mcp/, which drops Authorization
 * on many MCP clients. Rewrite internally so both paths hit the same handler.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/mcp') {
    const url = request.nextUrl.clone();
    url.pathname = '/api/mcp/';
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: '/api/mcp',
};

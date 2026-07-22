import { NextRequest, NextResponse } from 'next/server';
import { getMcpIssuerUrl, getMcpResourceUrl } from '@/lib/mcp/oauth/baseUrl';
import { resolveClient } from '@/lib/mcp/oauth/clients';
import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
} from '@/lib/mcp/oauth/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function oauthError(
  error: string,
  description: string,
  status = 400
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

async function readBody(request: NextRequest): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = (await request.json()) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === 'string') params.set(key, value);
    }
    return params;
  }
  const text = await request.text();
  return new URLSearchParams(text);
}

export async function POST(request: NextRequest) {
  if (!process.env.MCP_API_TOKEN?.trim()) {
    return oauthError('temporarily_unavailable', 'MCP not configured', 503);
  }

  let params: URLSearchParams;
  try {
    params = await readBody(request);
  } catch {
    return oauthError('invalid_request', 'Invalid body');
  }

  const grantType = params.get('grant_type') || '';
  const clientId = params.get('client_id') || '';
  if (!clientId) return oauthError('invalid_client', 'Missing client_id', 401);

  const client = await resolveClient(clientId);
  if (!client) return oauthError('invalid_client', 'Unknown client_id', 401);

  const clientSecret = params.get('client_secret');
  if (client.client_secret && client.client_secret !== clientSecret) {
    return oauthError('invalid_client', 'Invalid client_secret', 401);
  }

  const issuer = getMcpIssuerUrl(request);
  const resource = params.get('resource') || getMcpResourceUrl(request);

  if (grantType === 'authorization_code') {
    const code = params.get('code') || '';
    const redirectUri = params.get('redirect_uri') || '';
    const codeVerifier = params.get('code_verifier') || '';
    if (!code || !redirectUri || !codeVerifier) {
      return oauthError(
        'invalid_request',
        'code, redirect_uri and code_verifier are required'
      );
    }

    const result = exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri,
      codeVerifier,
      resource,
      issuer,
    });
    if (!result.ok) {
      return oauthError(result.error, result.description);
    }
    return NextResponse.json(result.tokens, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (grantType === 'refresh_token') {
    const refreshToken = params.get('refresh_token') || '';
    if (!refreshToken) {
      return oauthError('invalid_request', 'refresh_token is required');
    }
    const result = exchangeRefreshToken({
      refreshToken,
      clientId,
      resource,
      issuer,
    });
    if (!result.ok) {
      return oauthError(result.error, result.description);
    }
    return NextResponse.json(result.tokens, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return oauthError('unsupported_grant_type', 'Only authorization_code and refresh_token');
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { registerClient } from '@/lib/mcp/oauth/clients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!process.env.MCP_API_TOKEN?.trim()) {
    return NextResponse.json(
      { error: 'temporarily_unavailable', error_description: 'MCP not configured' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const record = body as {
    redirect_uris?: unknown;
    client_name?: unknown;
    token_endpoint_auth_method?: unknown;
  };

  if (!Array.isArray(record.redirect_uris) || record.redirect_uris.length === 0) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris required' },
      { status: 400 }
    );
  }

  const redirect_uris = record.redirect_uris.filter(
    (u): u is string => typeof u === 'string' && u.length > 0
  );
  if (redirect_uris.length === 0) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris required' },
      { status: 400 }
    );
  }

  try {
    const client = registerClient({
      redirect_uris,
      client_name: typeof record.client_name === 'string' ? record.client_name : undefined,
      token_endpoint_auth_method:
        typeof record.token_endpoint_auth_method === 'string'
          ? record.token_endpoint_auth_method
          : 'none',
    });

    return NextResponse.json(
      {
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: client.token_endpoint_auth_method || 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: message },
      { status: 400 }
    );
  }
}

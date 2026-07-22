import { NextRequest, NextResponse } from 'next/server';
import { verifyMcpApiToken } from '@/lib/mcp-auth';
import { renderAuthorizePage } from '@/lib/mcp/oauth/authorizeHtml';
import { getMcpPublicBaseUrl, getMcpResourceUrl } from '@/lib/mcp/oauth/baseUrl';
import { isRedirectUriAllowed, resolveClient } from '@/lib/mcp/oauth/clients';
import { issueAuthorizationCode } from '@/lib/mcp/oauth/tokens';
import { OAUTH_SCOPE } from '@/lib/mcp/oauth/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuthzParams = {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  code_challenge: string;
  code_challenge_method: string;
  state?: string;
  scope?: string;
  resource?: string;
};

function html(page: string, status = 200): NextResponse {
  return new NextResponse(page, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function readParams(source: URLSearchParams): Partial<AuthzParams> {
  return {
    client_id: source.get('client_id') || undefined,
    redirect_uri: source.get('redirect_uri') || undefined,
    response_type: source.get('response_type') || undefined,
    code_challenge: source.get('code_challenge') || undefined,
    code_challenge_method: source.get('code_challenge_method') || undefined,
    state: source.get('state') || undefined,
    scope: source.get('scope') || undefined,
    resource: source.get('resource') || undefined,
  };
}

function validateParams(
  params: Partial<AuthzParams>
): { ok: true; value: AuthzParams } | { ok: false; error: string } {
  if (!params.client_id) return { ok: false, error: 'Missing client_id' };
  if (!params.redirect_uri) return { ok: false, error: 'Missing redirect_uri' };
  if (params.response_type !== 'code') {
    return { ok: false, error: 'Unsupported response_type (only code)' };
  }
  if (!params.code_challenge) return { ok: false, error: 'Missing code_challenge' };
  if (params.code_challenge_method !== 'S256') {
    return { ok: false, error: 'code_challenge_method must be S256' };
  }
  return {
    ok: true,
    value: {
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      response_type: 'code',
      code_challenge: params.code_challenge,
      code_challenge_method: 'S256',
      state: params.state,
      scope: params.scope,
      resource: params.resource,
    },
  };
}

function oauthErrorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state?: string
): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return NextResponse.redirect(url.toString(), 302);
}

async function prepareAuthorize(
  request: NextRequest,
  params: Partial<AuthzParams>,
  formError?: string
): Promise<NextResponse> {
  if (!process.env.MCP_API_TOKEN?.trim()) {
    return html(
      renderAuthorizePage({
        action: `${getMcpPublicBaseUrl(request)}/oauth/authorize`,
        error: 'MCP endpoint is disabled (MCP_API_TOKEN missing).',
        fields: {},
      }),
      503
    );
  }

  const validated = validateParams(params);
  if (!validated.ok) {
    return html(
      renderAuthorizePage({
        action: `${getMcpPublicBaseUrl(request)}/oauth/authorize`,
        error: validated.error,
        fields: {},
      }),
      400
    );
  }

  const client = await resolveClient(validated.value.client_id);
  if (!client) {
    return html(
      renderAuthorizePage({
        action: `${getMcpPublicBaseUrl(request)}/oauth/authorize`,
        error: 'Unknown client_id',
        fields: {},
      }),
      400
    );
  }

  if (!isRedirectUriAllowed(client, validated.value.redirect_uri)) {
    return html(
      renderAuthorizePage({
        action: `${getMcpPublicBaseUrl(request)}/oauth/authorize`,
        error: 'redirect_uri is not registered for this client',
        fields: {},
      }),
      400
    );
  }

  const resource = validated.value.resource || getMcpResourceUrl(request);
  const expectedResource = getMcpResourceUrl(request);
  if (resource !== expectedResource) {
    return oauthErrorRedirect(
      validated.value.redirect_uri,
      'invalid_target',
      `resource must be ${expectedResource}`,
      validated.value.state
    );
  }

  const fields: Record<string, string> = {
    client_id: validated.value.client_id,
    redirect_uri: validated.value.redirect_uri,
    response_type: validated.value.response_type,
    code_challenge: validated.value.code_challenge,
    code_challenge_method: validated.value.code_challenge_method,
    resource,
    scope: validated.value.scope || OAUTH_SCOPE,
  };
  if (validated.value.state) fields.state = validated.value.state;

  return html(
    renderAuthorizePage({
      action: `${getMcpPublicBaseUrl(request)}/oauth/authorize`,
      error: formError,
      clientName: client.client_name || client.client_id.slice(0, 48),
      fields,
    }),
    formError ? 401 : 200
  );
}

export async function GET(request: NextRequest) {
  return prepareAuthorize(request, readParams(request.nextUrl.searchParams));
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params = readParams(
    new URLSearchParams(
      [...form.entries()]
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => [k, String(v)])
    )
  );
  const token = typeof form.get('token') === 'string' ? String(form.get('token')) : '';

  if (!verifyMcpApiToken(token)) {
    return prepareAuthorize(request, params, 'Ongeldig MCP API token');
  }

  const validated = validateParams(params);
  if (!validated.ok) {
    return prepareAuthorize(request, params, validated.error);
  }

  const client = await resolveClient(validated.value.client_id);
  if (!client || !isRedirectUriAllowed(client, validated.value.redirect_uri)) {
    return prepareAuthorize(request, params, 'Client of redirect_uri ongeldig');
  }

  const resource = validated.value.resource || getMcpResourceUrl(request);
  const code = issueAuthorizationCode({
    clientId: validated.value.client_id,
    redirectUri: validated.value.redirect_uri,
    codeChallenge: validated.value.code_challenge,
    resource,
    scope: validated.value.scope || OAUTH_SCOPE,
  });

  const redirect = new URL(validated.value.redirect_uri);
  redirect.searchParams.set('code', code);
  if (validated.value.state) redirect.searchParams.set('state', validated.value.state);
  return NextResponse.redirect(redirect.toString(), 302);
}

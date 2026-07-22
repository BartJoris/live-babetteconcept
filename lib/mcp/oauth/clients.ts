import { signJwt, verifyJwt } from '@/lib/mcp/oauth/jwt';
import { redirectUriMatches } from '@/lib/mcp/oauth/redirectUri';
import {
  CLIENT_TTL_SEC,
  type ClientRecordPayload,
  type RegisteredClient,
} from '@/lib/mcp/oauth/types';

type CimdDocument = {
  client_id?: string;
  client_name?: string;
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
};

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchCimdClient(clientId: string): Promise<RegisteredClient | null> {
  if (!isHttpsUrl(clientId)) return null;

  try {
    const res = await fetch(clientId, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as CimdDocument;
    if (!Array.isArray(doc.redirect_uris) || doc.redirect_uris.length === 0) {
      return null;
    }
    return {
      client_id: clientId,
      client_name: doc.client_name,
      redirect_uris: doc.redirect_uris.filter((u) => typeof u === 'string'),
      token_endpoint_auth_method: doc.token_endpoint_auth_method || 'none',
    };
  } catch {
    return null;
  }
}

function clientFromJwt(clientId: string): RegisteredClient | null {
  const payload = verifyJwt<ClientRecordPayload>(clientId, 'mcp_client');
  if (!payload) return null;
  return {
    client_id: clientId,
    client_secret: payload.client_secret,
    redirect_uris: payload.redirect_uris,
    client_name: payload.client_name,
    token_endpoint_auth_method: payload.token_endpoint_auth_method || 'none',
  };
}

export async function resolveClient(clientId: string): Promise<RegisteredClient | null> {
  if (!clientId) return null;

  const fromJwt = clientFromJwt(clientId);
  if (fromJwt) return fromJwt;

  return fetchCimdClient(clientId);
}

export function registerClient(input: {
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
}): RegisteredClient {
  const redirect_uris = input.redirect_uris.filter((u) => typeof u === 'string' && u.length > 0);
  if (redirect_uris.length === 0) {
    throw new Error('redirect_uris required');
  }

  const clientId = signJwt(
    {
      typ: 'mcp_client',
      redirect_uris,
      client_name: input.client_name,
      token_endpoint_auth_method: input.token_endpoint_auth_method || 'none',
    },
    CLIENT_TTL_SEC
  );

  return {
    client_id: clientId,
    redirect_uris,
    client_name: input.client_name,
    token_endpoint_auth_method: input.token_endpoint_auth_method || 'none',
  };
}

export function isRedirectUriAllowed(
  client: RegisteredClient,
  redirectUri: string
): boolean {
  return client.redirect_uris.some((registered) =>
    redirectUriMatches(redirectUri, registered)
  );
}

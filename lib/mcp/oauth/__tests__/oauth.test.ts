import { createHash, randomBytes } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { authorizeMcpRequest } from '@/lib/mcp-auth';
import { registerClient, resolveClient, isRedirectUriAllowed } from '@/lib/mcp/oauth/clients';
import { verifyPkceS256 } from '@/lib/mcp/oauth/pkce';
import { redirectUriMatches } from '@/lib/mcp/oauth/redirectUri';
import {
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  issueTokenPair,
  verifyAccessToken,
} from '@/lib/mcp/oauth/tokens';

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

describe('MCP OAuth helpers', () => {
  const envKeys = [
    'MCP_API_TOKEN',
    'MCP_OAUTH_SIGNING_SECRET',
    'MCP_PUBLIC_BASE_URL',
    'SESSION_SECRET',
  ] as const;
  const original = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));

  afterEach(() => {
    for (const key of envKeys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('verifies PKCE S256', () => {
    const { verifier, challenge } = pkcePair();
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256(verifier + 'x', challenge)).toBe(false);
  });

  it('matches loopback redirect URIs ignoring port', () => {
    expect(
      redirectUriMatches('http://127.0.0.1:54321/callback', 'http://127.0.0.1:9999/callback')
    ).toBe(true);
    expect(
      redirectUriMatches(
        'https://chatgpt.com/connector/oauth/abc',
        'https://chatgpt.com/connector/oauth/abc'
      )
    ).toBe(true);
    expect(
      redirectUriMatches(
        'https://chatgpt.com/connector/oauth/abc',
        'https://chatgpt.com/connector/oauth/xyz'
      )
    ).toBe(false);
  });

  it('registers and resolves JWT clients', async () => {
    process.env.MCP_OAUTH_SIGNING_SECRET = 'oauth-signing-secret-for-tests';
    const client = registerClient({
      redirect_uris: ['https://chatgpt.com/connector/oauth/test'],
      client_name: 'ChatGPT',
    });
    const resolved = await resolveClient(client.client_id);
    expect(resolved?.client_name).toBe('ChatGPT');
    expect(
      isRedirectUriAllowed(resolved!, 'https://chatgpt.com/connector/oauth/test')
    ).toBe(true);
  });

  it('exchanges auth code for access token and accepts it on MCP auth', () => {
    process.env.MCP_API_TOKEN = 'static-mcp-token';
    process.env.MCP_OAUTH_SIGNING_SECRET = 'oauth-signing-secret-for-tests';
    process.env.MCP_PUBLIC_BASE_URL = 'https://live.babetteconcept.be';

    const { verifier, challenge } = pkcePair();
    const resource = 'https://live.babetteconcept.be/api/mcp';
    const issuer = 'https://live.babetteconcept.be';
    const clientId = 'test-client';

    const code = issueAuthorizationCode({
      clientId,
      redirectUri: 'https://chatgpt.com/connector/oauth/test',
      codeChallenge: challenge,
      resource,
    });

    const exchanged = exchangeAuthorizationCode({
      code,
      clientId,
      redirectUri: 'https://chatgpt.com/connector/oauth/test',
      codeVerifier: verifier,
      resource,
      issuer,
    });
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;

    const verified = verifyAccessToken(exchanged.tokens.access_token, resource, issuer);
    expect(verified?.client_id).toBe(clientId);

    const request = new Request(resource);
    expect(
      authorizeMcpRequest(`Bearer ${exchanged.tokens.access_token}`, request)
    ).toBe('ok');
    expect(authorizeMcpRequest('Bearer static-mcp-token', request)).toBe('ok');
    expect(authorizeMcpRequest('Bearer not-a-token', request)).toBe('unauthorized');
  });

  it('issues refreshable token pairs', () => {
    process.env.MCP_OAUTH_SIGNING_SECRET = 'oauth-signing-secret-for-tests';
    const tokens = issueTokenPair({
      clientId: 'c1',
      resource: 'https://live.babetteconcept.be/api/mcp',
      issuer: 'https://live.babetteconcept.be',
    });
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.refresh_token.length).toBeGreaterThan(20);
  });
});

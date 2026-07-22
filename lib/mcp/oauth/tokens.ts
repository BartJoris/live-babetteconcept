import { signJwt, verifyJwt } from '@/lib/mcp/oauth/jwt';
import { verifyPkceS256 } from '@/lib/mcp/oauth/pkce';
import {
  ACCESS_TOKEN_TTL_SEC,
  AUTH_CODE_TTL_SEC,
  OAUTH_SCOPE,
  REFRESH_TOKEN_TTL_SEC,
  type AccessTokenPayload,
  type AuthCodePayload,
  type RefreshTokenPayload,
} from '@/lib/mcp/oauth/types';

export function issueAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope?: string;
}): string {
  return signJwt(
    {
      typ: 'mcp_auth_code',
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      resource: input.resource,
      scope: input.scope || OAUTH_SCOPE,
    },
    AUTH_CODE_TTL_SEC
  );
}

export function issueTokenPair(input: {
  clientId: string;
  resource: string;
  issuer: string;
  scope?: string;
}): {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
} {
  const scope = input.scope || OAUTH_SCOPE;
  const access_token = signJwt(
    {
      typ: 'mcp_access',
      client_id: input.clientId,
      aud: input.resource,
      scope,
      iss: input.issuer,
    },
    ACCESS_TOKEN_TTL_SEC
  );
  const refresh_token = signJwt(
    {
      typ: 'mcp_refresh',
      client_id: input.clientId,
      aud: input.resource,
      scope,
      iss: input.issuer,
    },
    REFRESH_TOKEN_TTL_SEC
  );

  return {
    access_token,
    refresh_token,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SEC,
    scope,
  };
}

export function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
  issuer: string;
}):
  | { ok: true; tokens: ReturnType<typeof issueTokenPair> }
  | { ok: false; error: string; description: string } {
  const payload = verifyJwt<AuthCodePayload>(input.code, 'mcp_auth_code');
  if (!payload) {
    return { ok: false, error: 'invalid_grant', description: 'Invalid or expired code' };
  }
  if (payload.client_id !== input.clientId) {
    return { ok: false, error: 'invalid_grant', description: 'Code was not issued to this client' };
  }
  if (payload.redirect_uri !== input.redirectUri) {
    return { ok: false, error: 'invalid_grant', description: 'redirect_uri mismatch' };
  }
  if (!verifyPkceS256(input.codeVerifier, payload.code_challenge)) {
    return { ok: false, error: 'invalid_grant', description: 'PKCE verification failed' };
  }
  if (input.resource && input.resource !== payload.resource) {
    return { ok: false, error: 'invalid_target', description: 'resource mismatch' };
  }

  return {
    ok: true,
    tokens: issueTokenPair({
      clientId: payload.client_id,
      resource: payload.resource,
      issuer: input.issuer,
      scope: payload.scope,
    }),
  };
}

export function exchangeRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  resource?: string;
  issuer: string;
}):
  | { ok: true; tokens: ReturnType<typeof issueTokenPair> }
  | { ok: false; error: string; description: string } {
  const payload = verifyJwt<RefreshTokenPayload>(input.refreshToken, 'mcp_refresh');
  if (!payload) {
    return { ok: false, error: 'invalid_grant', description: 'Invalid or expired refresh token' };
  }
  if (payload.client_id !== input.clientId) {
    return { ok: false, error: 'invalid_grant', description: 'Refresh token client mismatch' };
  }
  if (input.resource && input.resource !== payload.aud) {
    return { ok: false, error: 'invalid_target', description: 'resource mismatch' };
  }

  return {
    ok: true,
    tokens: issueTokenPair({
      clientId: payload.client_id,
      resource: payload.aud,
      issuer: input.issuer,
      scope: payload.scope,
    }),
  };
}

export function verifyAccessToken(
  token: string,
  expectedResource: string,
  expectedIssuer: string
): AccessTokenPayload | null {
  const payload = verifyJwt<AccessTokenPayload>(token, 'mcp_access');
  if (!payload) return null;
  if (payload.aud !== expectedResource) return null;
  if (payload.iss !== expectedIssuer) return null;
  return payload;
}

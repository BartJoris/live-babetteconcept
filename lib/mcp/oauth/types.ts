export const OAUTH_SCOPE = 'mcp:tools';

export const AUTH_CODE_TTL_SEC = 5 * 60;
export const ACCESS_TOKEN_TTL_SEC = 60 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
export const CLIENT_TTL_SEC = 365 * 24 * 60 * 60;

export type RegisteredClient = {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
};

export type AuthCodePayload = {
  typ: 'mcp_auth_code';
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  resource: string;
  scope: string;
  iat: number;
  exp: number;
};

export type AccessTokenPayload = {
  typ: 'mcp_access';
  client_id: string;
  aud: string;
  scope: string;
  iss: string;
  iat: number;
  exp: number;
};

export type RefreshTokenPayload = {
  typ: 'mcp_refresh';
  client_id: string;
  aud: string;
  scope: string;
  iss: string;
  iat: number;
  exp: number;
};

export type ClientRecordPayload = {
  typ: 'mcp_client';
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method?: string;
  client_secret?: string;
  iat: number;
  exp: number;
};

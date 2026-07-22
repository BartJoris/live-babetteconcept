import {
  getMcpIssuerUrl,
  getMcpPublicBaseUrl,
  getMcpResourceUrl,
} from '@/lib/mcp/oauth/baseUrl';
import { OAUTH_SCOPE } from '@/lib/mcp/oauth/types';

export function getProtectedResourceMetadata(request?: Request) {
  const issuer = getMcpIssuerUrl(request);
  return {
    resource: getMcpResourceUrl(request),
    authorization_servers: [issuer],
    scopes_supported: [OAUTH_SCOPE],
    resource_name: 'Babette Concept MCP',
    bearer_methods_supported: ['header'],
  };
}

export function getAuthorizationServerMetadata(request?: Request) {
  const base = getMcpPublicBaseUrl(request);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: [OAUTH_SCOPE],
    // ChatGPT / Claude prefer CIMD when advertised with public-client token auth.
    client_id_metadata_document_supported: true,
  };
}

export function getResourceMetadataUrl(request?: Request): string {
  const base = getMcpPublicBaseUrl(request);
  return `${base}/.well-known/oauth-protected-resource`;
}

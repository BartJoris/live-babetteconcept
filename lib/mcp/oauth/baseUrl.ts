/**
 * Public origin for MCP OAuth metadata and redirects.
 * Prefer MCP_PUBLIC_BASE_URL; else Host / x-forwarded-*; else VERCEL_URL.
 */
export function getMcpPublicBaseUrl(request?: Request): string {
  const configured = process.env.MCP_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  if (request) {
    const proto =
      request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
    const host =
      request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
      request.headers.get('host')?.trim();
    if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${host}`;
  }

  return 'http://localhost:3000';
}

export function getMcpResourceUrl(request?: Request): string {
  return `${getMcpPublicBaseUrl(request)}/api/mcp`;
}

export function getMcpIssuerUrl(request?: Request): string {
  return getMcpPublicBaseUrl(request);
}

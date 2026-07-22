import { odooClient } from '@/lib/odooClient';

export type McpOdooCredentials = {
  uid: number;
  password: string;
  username: string;
};

let cached: { credentials: McpOdooCredentials; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Service-account credentials for MCP tools.
 * Uses ODOO_USERNAME + ODOO_API_KEY (or ODOO_PASSWORD) from the environment.
 */
export async function getMcpOdooCredentials(): Promise<McpOdooCredentials> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.credentials;
  }

  const username = process.env.ODOO_USERNAME?.trim();
  const password =
    process.env.ODOO_PASSWORD?.trim() || process.env.ODOO_API_KEY?.trim();

  if (!username || !password) {
    throw new Error(
      'MCP Odoo credentials missing: set ODOO_USERNAME and ODOO_API_KEY (or ODOO_PASSWORD)'
    );
  }

  const uid = await odooClient.authenticate(username, password);
  if (!uid) {
    throw new Error(
      'Odoo authentication failed for MCP service account (check ODOO_USERNAME / ODOO_API_KEY)'
    );
  }

  const credentials: McpOdooCredentials = { uid, password, username };
  cached = { credentials, expiresAt: now + CACHE_TTL_MS };
  return credentials;
}

/** Test helper — clears the in-memory auth cache. */
export function clearMcpOdooCredentialsCache(): void {
  cached = null;
}

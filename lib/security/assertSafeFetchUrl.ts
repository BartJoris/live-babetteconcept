import dns from 'node:dns/promises';
import net from 'node:net';

export type SafeFetchUrlCode =
  | 'INVALID_URL'
  | 'INSECURE_SCHEME'
  | 'BLOCKED_HOST'
  | 'HOST_NOT_ALLOWED'
  | 'PRIVATE_IP';

export class SafeFetchUrlError extends Error {
  readonly code: SafeFetchUrlCode;

  constructor(code: SafeFetchUrlCode, message: string) {
    super(message);
    this.name = 'SafeFetchUrlError';
    this.code = code;
  }
}

export type AssertSafeFetchUrlOptions = {
  /** If set, hostname must match one of these (case-insensitive). */
  allowedHosts?: string[];
  /**
   * When true, skip DNS resolution (unit tests / pre-checked hosts).
   * Production callers should leave this false.
   */
  skipDnsLookup?: boolean;
  /** Allow http:// in addition to https:// (default false). */
  allowHttp?: boolean;
};

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true;
  // Literal IPs in the hostname
  if (net.isIP(host)) return isPrivateOrReservedIp(host);
  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
    if (normalized.startsWith('fe80')) return true; // link-local
    // IPv4-mapped IPv6
    const mapped = normalized.match(/^:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }
  return true;
}

function hostAllowed(hostname: string, allowedHosts?: string[]): boolean {
  if (!allowedHosts || allowedHosts.length === 0) return true;
  const host = normalizeHost(hostname);
  const allowed = allowedHosts.map((h) => h.toLowerCase());
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

/**
 * Validate that a caller-supplied URL is safe to fetch from the server.
 * Blocks non-https (by default), localhost/metadata hosts, and private/reserved IPs.
 */
export async function assertSafeFetchUrl(
  raw: string,
  options: AssertSafeFetchUrlOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchUrlError('INVALID_URL', 'Invalid URL');
  }

  const allowHttp = options.allowHttp === true;
  if (url.protocol === 'https:') {
    // ok
  } else if (url.protocol === 'http:' && allowHttp) {
    // ok
  } else if (url.protocol === 'http:' || url.protocol === 'https:') {
    throw new SafeFetchUrlError('INSECURE_SCHEME', 'Only https URLs are allowed');
  } else {
    throw new SafeFetchUrlError('INSECURE_SCHEME', `Unsupported URL scheme: ${url.protocol}`);
  }

  if (url.username || url.password) {
    throw new SafeFetchUrlError('INVALID_URL', 'URLs with credentials are not allowed');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new SafeFetchUrlError('BLOCKED_HOST', 'Host is not allowed');
  }

  if (!hostAllowed(url.hostname, options.allowedHosts)) {
    throw new SafeFetchUrlError('HOST_NOT_ALLOWED', 'Host is not in the allowlist');
  }

  if (!options.skipDnsLookup) {
    const hostname = normalizeHost(url.hostname);
    // Literal IP already checked in isBlockedHostname; still resolve hostnames.
    if (!net.isIP(hostname)) {
      let addresses: string[];
      try {
        const results = await dns.lookup(hostname, { all: true, verbatim: true });
        addresses = results.map((r) => r.address);
      } catch {
        throw new SafeFetchUrlError('INVALID_URL', 'Host could not be resolved');
      }
      if (addresses.length === 0) {
        throw new SafeFetchUrlError('INVALID_URL', 'Host could not be resolved');
      }
      for (const address of addresses) {
        if (isPrivateOrReservedIp(address)) {
          throw new SafeFetchUrlError('PRIVATE_IP', 'Host resolves to a private or reserved address');
        }
      }
    }
  }

  return url;
}

/** Parse comma-separated SAFE_FETCH_ALLOWED_HOSTS (empty = no host allowlist). */
export function allowedHostsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] | undefined {
  const raw = env.SAFE_FETCH_ALLOWED_HOSTS?.trim();
  if (!raw) return undefined;
  const hosts = raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : undefined;
}

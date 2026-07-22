import { createHmac, timingSafeEqual } from 'crypto';

export type JwtPayload = Record<string, unknown> & {
  typ: string;
  exp: number;
  iat: number;
};

function getSigningSecret(): string {
  const secret =
    process.env.MCP_OAUTH_SIGNING_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.MCP_API_TOKEN?.trim();
  if (!secret) {
    throw new Error('No signing secret configured for MCP OAuth');
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlJson(value: unknown): string {
  return base64url(JSON.stringify(value));
}

function signHs256(data: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(data).digest());
}

export function signJwt(
  payload: { typ: string } & Record<string, unknown> & { exp?: number; iat?: number },
  expiresInSec: number
): string {
  const secret = getSigningSecret();
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = {
    ...payload,
    typ: payload.typ,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + expiresInSec,
  };
  const header = base64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64urlJson(full);
  const signingInput = `${header}.${body}`;
  return `${signingInput}.${signHs256(signingInput, secret)}`;
}

export function verifyJwt<T extends JwtPayload>(
  token: string,
  expectedTyp: string
): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sig] = parts;
  if (!headerB64 || !bodyB64 || !sig) return null;

  let secret: string;
  try {
    secret = getSigningSecret();
  } catch {
    return null;
  }

  const signingInput = `${headerB64}.${bodyB64}`;
  const expected = signHs256(signingInput, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const json = Buffer.from(
      bodyB64.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8');
    const payload = JSON.parse(json) as T;
    if (payload.typ !== expectedTyp) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

import { SessionOptions } from 'iron-session';

export interface SessionData {
  user?: {
    uid: number;
    username: string;
    /**
     * Odoo password (or API key) sealed inside the iron-session cookie.
     * Prefer short cookie lifetime; long-term fix is a server-side session store.
     */
    password: string;
  };
  isLoggedIn: boolean;
}

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET must be set to a random string of at least 32 characters. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return secret;
}

export const sessionOptions: SessionOptions = {
  // Getter so missing SESSION_SECRET fails on first use (and vitest can set env before access).
  get password() {
    return requireSessionSecret();
  },
  cookieName: 'babette_pos_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    // Cookie holds Odoo credentials — keep lifetime short to limit theft window.
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  },
};

export const defaultSession: SessionData = {
  isLoggedIn: false,
};


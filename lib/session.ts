import { SessionOptions } from 'iron-session';

export interface SessionData {
  user?: {
    uid: number;
    username: string;
    password: string; // Encrypted in session cookie via iron-session
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
    // Shorter lifetime reduces impact if a session cookie is stolen (still holds Odoo password).
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  },
};

export const defaultSession: SessionData = {
  isLoggedIn: false,
};


import { SessionOptions } from 'iron-session';

export interface SessionData {
  user?: {
    uid: number;
    username: string;
    password: string; // Encrypted in session cookie
  };
  isLoggedIn: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long_change_this_in_production',
  cookieName: 'babette_pos_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  },
};

export const defaultSession: SessionData = {
  isLoggedIn: false,
};


import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/middleware/withAuth';
import { odooClient } from '@/lib/odooClient';
import { loginSchema } from '@/lib/validation/auth';
import { rateLimitLogin } from '@/lib/middleware/rateLimiter';
import { logLoginSuccess, logLoginFailure } from '@/lib/auditLog';

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function getUserAgent(req: NextApiRequest): string {
  return req.headers['user-agent'] || 'unknown';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Apply rate limiting (5 attempts per 15 minutes)
  const allowed = await rateLimitLogin(req, res);
  if (!allowed) {
    return; // Rate limiter already sent response
  }

  try {
    // Validate input
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.issues,
      });
    }

    const { username, password } = validation.data;

    // Authenticate with Odoo
    const uid = await odooClient.authenticate(username, password);

    if (!uid) {
      // Log failed login attempt
      logLoginFailure(
        username,
        getClientIp(req),
        'Invalid credentials',
        getUserAgent(req)
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get session and store credentials securely
    const session = await getSession(req, res);
    session.user = {
      uid,
      username,
      password, // Encrypted in session cookie
    };
    session.isLoggedIn = true;
    await session.save();

    // Log successful login
    logLoginSuccess(uid, username, getClientIp(req), getUserAgent(req));

    return res.status(200).json({
      success: true,
      user: {
        uid,
        username,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    
    // Log error as failed login
    const validation = loginSchema.safeParse(req.body);
    const username = validation.success ? validation.data.username : 'unknown';
    logLoginFailure(
      username,
      getClientIp(req),
      'Login error',
      getUserAgent(req)
    );
    
    return res.status(500).json({ error: 'Login failed' });
  }
}

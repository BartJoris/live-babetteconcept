import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { NextApiRequest, NextApiResponse } from 'next';
import { logRateLimitExceeded } from '@/lib/auditLog';

// Rate limiter for login attempts (5 per 15 minutes)
const loginLimiter = new RateLimiterMemory({
  points: 5, // 5 attempts
  duration: 15 * 60, // per 15 minutes
  blockDuration: 15 * 60, // block for 15 minutes if exceeded
});

// Rate limiter for general API calls (100 per minute)
const apiLimiter = new RateLimiterMemory({
  points: 100, // 100 requests
  duration: 60, // per minute
});

// Rate limiter for expensive operations like imports (10 per hour)
const importLimiter = new RateLimiterMemory({
  points: 10, // 10 imports
  duration: 60 * 60, // per hour
  blockDuration: 60 * 60, // block for 1 hour if exceeded
});

/**
 * Get client identifier (IP address or fallback)
 */
function getClientId(req: NextApiRequest): string {
  // Try various headers for real IP (handles proxies/load balancers)
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  
  if (typeof realIp === 'string') {
    return realIp;
  }
  
  if (typeof cfConnectingIp === 'string') {
    return cfConnectingIp;
  }
  
  // Fallback to socket address
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Rate limit middleware for login endpoint
 */
export async function rateLimitLogin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  const clientId = getClientId(req);
  
  try {
    await loginLimiter.consume(clientId);
    return true;
  } catch (rateLimiterRes) {
    const retryAfter = Math.round(
      ((rateLimiterRes as { msBeforeNext: number }).msBeforeNext || 0) / 1000
    );
    
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Too many login attempts',
      message: `Please try again after ${retryAfter} seconds`,
      retryAfter,
    });
    
    // Log security event via audit logger
    logRateLimitExceeded(clientId, '/api/odoo-login');
    
    return false;
  }
}

/**
 * Rate limit middleware for general API calls
 */
export async function rateLimitApi(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  const clientId = getClientId(req);
  
  try {
    await apiLimiter.consume(clientId);
    return true;
  } catch (rateLimiterRes) {
    const retryAfter = Math.round(
      ((rateLimiterRes as { msBeforeNext: number }).msBeforeNext || 0) / 1000
    );
    
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please slow down.',
      retryAfter,
    });
    
    return false;
  }
}

/**
 * Rate limit middleware for expensive operations (imports)
 */
export async function rateLimitImport(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  const clientId = getClientId(req);
  
  try {
    await importLimiter.consume(clientId);
    return true;
  } catch (rateLimiterRes) {
    const retryAfter = Math.round(
      ((rateLimiterRes as { msBeforeNext: number }).msBeforeNext || 0) / 1000
    );
    
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Import rate limit exceeded',
      message: `You can perform ${importLimiter.points} imports per hour. Please try again after ${retryAfter} seconds`,
      retryAfter,
    });
    
    // Log security event via audit logger
    logRateLimitExceeded(clientId, '/api/import-products');
    
    return false;
  }
}

/**
 * Combined middleware that applies authentication + rate limiting
 */
export function withRateLimit(
  limiter: 'login' | 'api' | 'import' = 'api'
) {
  return async (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
    let allowed = false;
    
    switch (limiter) {
      case 'login':
        allowed = await rateLimitLogin(req, res);
        break;
      case 'import':
        allowed = await rateLimitImport(req, res);
        break;
      case 'api':
      default:
        allowed = await rateLimitApi(req, res);
        break;
    }
    
    if (allowed) {
      next();
    }
  };
}


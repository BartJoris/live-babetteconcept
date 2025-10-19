import { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession, IronSession } from 'iron-session';
import { sessionOptions, SessionData } from '../session';

export type NextApiRequestWithSession = NextApiRequest & {
  session: IronSession<SessionData>;
};

export type AuthenticatedApiHandler = (
  req: NextApiRequestWithSession,
  res: NextApiResponse
) => Promise<void> | void;

/**
 * Higher-order function to protect API routes with authentication
 * Validates session and attaches user context to request
 */
export function withAuth(handler: AuthenticatedApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Get session from iron-session
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    // Check if user is authenticated
    if (!session.isLoggedIn || !session.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to access this resource',
      });
    }

    // Attach session to request
    (req as NextApiRequestWithSession).session = session;

    // Call the actual handler
    return handler(req as NextApiRequestWithSession, res);
  };
}

/**
 * Get session from request/response (for use in API routes)
 */
export async function getSession(req: NextApiRequest, res: NextApiResponse): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, sessionOptions);
}


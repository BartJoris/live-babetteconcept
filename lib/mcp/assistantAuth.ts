import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function requireAssistantSession(): Promise<
  | { ok: true; username: string; uid: number }
  | { ok: false; response: Response }
> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  if (!session.isLoggedIn || !session.user) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Unauthorized', message: 'Je moet ingelogd zijn om de assistent te gebruiken.' },
        { status: 401 }
      ),
    };
  }

  return {
    ok: true,
    username: session.user.username,
    uid: session.user.uid,
  };
}

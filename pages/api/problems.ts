import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import {
  createBraindumpProblem,
  listBraindumpProblems,
} from '@/lib/braindump-problems';
import { sessionOptions, SessionData } from '@/lib/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.isLoggedIn || !session.user) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const data = await listBraindumpProblems();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const prompt = String(req.body?.prompt ?? '').trim();
      if (!prompt) {
        return res.status(400).json({ ok: false, error: 'Beschrijf het probleem.' });
      }

      const data = await createBraindumpProblem({
        prompt,
        reportedBy: session.user.username,
      });
      return res.status(200).json(data);
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Braindump problems API error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Kon probleem niet verwerken.',
    });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createBraindumpProblem,
  listBraindumpProblems,
} from '@/lib/braindump-problems';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { user } = req.session;
  if (!user) {
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
        reportedBy: user.username,
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

import type { NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware/withAuth';
import { getCameras } from '@/lib/cameraConfig';

export default withAuth(async (req, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const cameras = getCameras();
  const camera = cameras.find((c) => c.id === id);

  if (!camera) {
    return res.status(404).json({ error: 'Camera niet gevonden' });
  }

  try {
    const headers: Record<string, string> = {};
    if (camera.authUser && camera.authPass) {
      headers['Authorization'] =
        'Basic ' + Buffer.from(`${camera.authUser}:${camera.authPass}`).toString('base64');
    }

    const response = await fetch(camera.snapshotUrl, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(502).json({
        error: `Camera antwoordde met status ${response.status}`,
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    return res.send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return res.status(502).json({ error: message });
  }
});

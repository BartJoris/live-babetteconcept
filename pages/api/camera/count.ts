import type { NextApiRequest, NextApiResponse } from 'next';
import { getCameras, getAnalysisProvider } from '@/lib/cameraConfig';
import { cameraStore } from '@/lib/cameraStore';
import { analyzeImage } from '@/lib/analysisProvider';

async function fetchSnapshot(url: string, user?: string, pass?: string): Promise<Buffer> {
  const headers: Record<string, string> = {};
  if (user && pass) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Camera snapshot fout: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['x-camera-secret'];
  const secret = process.env.CAMERA_API_SECRET;
  if (secret && authHeader !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cameras = getCameras();
  if (cameras.length === 0) {
    return res.status(400).json({ error: 'Geen camera\'s geconfigureerd' });
  }

  const provider = getAnalysisProvider();
  const { cameraId } = req.body || {};

  const camerasToAnalyze = cameraId
    ? cameras.filter((c) => c.id === cameraId)
    : cameras;

  if (camerasToAnalyze.length === 0) {
    return res.status(404).json({ error: 'Camera niet gevonden' });
  }

  const results = [];

  for (const camera of camerasToAnalyze) {
    cameraStore.register(camera.id, camera.name);

    try {
      const imageBuffer = await fetchSnapshot(
        camera.snapshotUrl,
        camera.authUser,
        camera.authPass
      );
      const imageBase64 = imageBuffer.toString('base64');

      const analysis = await analyzeImage(imageBase64, provider);

      cameraStore.update(camera.id, analysis.count, analysis.confidence);

      results.push({
        cameraId: camera.id,
        cameraName: camera.name,
        count: analysis.count,
        confidence: analysis.confidence,
        details: analysis.details,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout';
      cameraStore.setError(camera.id, message);
      results.push({
        cameraId: camera.id,
        cameraName: camera.name,
        error: message,
      });
    }
  }

  const totalCount = results.reduce(
    (sum, r) => sum + (r.count ?? 0),
    0
  );

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    provider,
    totalCount,
    cameras: results,
  });
}

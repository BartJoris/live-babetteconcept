import type { NextApiResponse } from 'next';
import { withAuth } from '@/lib/middleware/withAuth';
import { getCameras } from '@/lib/cameraConfig';
import { cameraStore } from '@/lib/cameraStore';

export default withAuth(async (req, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cameras = getCameras();
  for (const camera of cameras) {
    cameraStore.register(camera.id, camera.name);
  }

  const { hours } = req.query;
  const hoursFilter = Math.min(parseInt(hours as string, 10) || 24, 72);
  const cutoff = new Date(Date.now() - hoursFilter * 60 * 60 * 1000).toISOString();

  const statuses = cameraStore.getAllStatuses().map((status) => ({
    ...status,
    history: status.history.filter((entry) => entry.timestamp >= cutoff),
  }));

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    totalCount: cameraStore.getTotalCount(),
    cameras: statuses,
  });
});

export const config = {
  api: {
    responseLimit: false,
  },
};

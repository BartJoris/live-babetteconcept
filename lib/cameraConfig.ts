export interface CameraConfig {
  id: string;
  name: string;
  snapshotUrl: string;
  authUser?: string;
  authPass?: string;
}

export function getCameras(): CameraConfig[] {
  const cameras: CameraConfig[] = [];

  for (let i = 1; i <= 20; i++) {
    const name = process.env[`CAMERA_${i}_NAME`];
    const snapshotUrl = process.env[`CAMERA_${i}_SNAPSHOT_URL`];

    if (!name || !snapshotUrl) break;

    cameras.push({
      id: `camera-${i}`,
      name,
      snapshotUrl,
      authUser: process.env[`CAMERA_${i}_AUTH_USER`],
      authPass: process.env[`CAMERA_${i}_AUTH_PASS`],
    });
  }

  return cameras;
}

export function getAnalysisProvider(): 'openai' | 'yolo' {
  const provider = process.env.CAMERA_ANALYSIS_PROVIDER?.toLowerCase();
  if (provider === 'yolo') return 'yolo';
  return 'openai';
}

export function getAnalysisInterval(): number {
  const interval = parseInt(process.env.CAMERA_ANALYSIS_INTERVAL || '60', 10);
  return Math.max(10, interval);
}

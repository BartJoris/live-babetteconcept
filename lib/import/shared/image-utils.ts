const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
/** Re-encode when estimated decoded size is above this (keeps uploads under Vercel body limits). */
const FORCE_REENCODE_BYTES = 700_000;

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

/**
 * Resize (if needed) and re-encode to JPEG so large camera/studio shots
 * stay small enough for serverless upload payloads (~4.5MB request limit).
 */
export function compressImage(
  dataUrl: string,
  maxDimension = MAX_DIMENSION,
  quality = JPEG_QUALITY,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const needsResize = width > maxDimension || height > maxDimension;
      const needsReencode =
        needsResize || estimateDataUrlBytes(dataUrl) > FORCE_REENCODE_BYTES;

      if (!needsReencode) {
        resolve(dataUrl);
        return;
      }

      if (needsResize) {
        if (width > height) {
          height = Math.round((height / width) * maxDimension);
          width = maxDimension;
        } else {
          width = Math.round((width / height) * maxDimension);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

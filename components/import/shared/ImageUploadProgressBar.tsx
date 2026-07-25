import type { ImageUploadProgress } from '@/lib/import/image-upload-client';

interface ImageUploadProgressBarProps {
  progress: ImageUploadProgress;
  title?: string;
}

export default function ImageUploadProgressBar({
  progress,
  title = 'Afbeeldingen uploaden...',
}: ImageUploadProgressBarProps) {
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100">
          {title}
        </h3>
        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
          {progress.current}/{progress.total} ({pct}%)
        </span>
      </div>
      <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
        <div
          className="h-3 rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {(progress.currentProduct || progress.currentFile) && (
        <div className="space-y-1 text-sm text-blue-900 dark:text-blue-100">
          {progress.currentProduct && (
            <div>
              <span className="text-blue-700 dark:text-blue-300">Product: </span>
              {progress.currentProduct}
            </div>
          )}
          {progress.currentFile && (
            <div className="truncate">
              <span className="text-blue-700 dark:text-blue-300">Bestand: </span>
              {progress.currentFile}
            </div>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
        Sluit dit venster niet tijdens het uploaden.
      </p>
    </div>
  );
}

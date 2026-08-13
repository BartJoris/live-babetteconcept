export function supportsDirectoryPicker(): boolean {
  if (typeof window === 'undefined') return false;
  const input = document.createElement('input');
  return 'webkitdirectory' in input;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (
    successCallback: (file: File) => void,
    errorCallback?: (err: Error) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      successCallback: (entries: FileSystemEntryLike[]) => void,
      errorCallback?: (err: Error) => void,
    ) => void;
  };
};

/**
 * Collect files from a drag-and-drop event, including nested folder contents
 * when the browser exposes webkitGetAsEntry (Chrome/Edge/Safari).
 */
export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<File[]> {
  const items = dataTransfer.items;
  if (!items?.length) {
    return Array.from(dataTransfer.files || []);
  }

  const entries: FileSystemEntryLike[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry =
      typeof item.webkitGetAsEntry === 'function'
        ? (item.webkitGetAsEntry() as FileSystemEntryLike | null)
        : null;
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    return Array.from(dataTransfer.files || []);
  }

  const files: File[] = [];

  const readAllEntries = async (
    reader: {
      readEntries: (
        successCallback: (entries: FileSystemEntryLike[]) => void,
        errorCallback?: (err: Error) => void,
      ) => void;
    },
  ): Promise<FileSystemEntryLike[]> => {
    const all: FileSystemEntryLike[] = [];
    const readBatch = () =>
      new Promise<FileSystemEntryLike[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
    let batch = await readBatch();
    while (batch.length > 0) {
      all.push(...batch);
      batch = await readBatch();
    }
    return all;
  };

  const walk = async (entry: FileSystemEntryLike): Promise<void> => {
    if (entry.isFile && entry.file) {
      const file = await new Promise<File>((resolve, reject) => {
        entry.file!(resolve, reject);
      });
      files.push(file);
      return;
    }
    if (entry.isDirectory && entry.createReader) {
      const children = await readAllEntries(entry.createReader());
      for (const child of children) {
        await walk(child);
      }
    }
  };

  for (const entry of entries) {
    await walk(entry);
  }

  return files.length > 0 ? files : Array.from(dataTransfer.files || []);
}

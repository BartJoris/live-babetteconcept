export interface CountEntry {
  count: number;
  timestamp: string;
  confidence?: string;
}

export interface CameraStatus {
  cameraId: string;
  cameraName: string;
  current: CountEntry | null;
  history: CountEntry[];
  lastError?: string;
  lastAnalyzedAt?: string;
}

const MAX_HISTORY = 1440; // 24 hours at 1 per minute

class CameraStore {
  private data: Map<string, CameraStatus> = new Map();

  register(cameraId: string, cameraName: string): void {
    if (!this.data.has(cameraId)) {
      this.data.set(cameraId, {
        cameraId,
        cameraName,
        current: null,
        history: [],
      });
    }
  }

  update(cameraId: string, count: number, confidence?: string): void {
    const status = this.data.get(cameraId);
    if (!status) return;

    const entry: CountEntry = {
      count,
      timestamp: new Date().toISOString(),
      confidence,
    };

    status.current = entry;
    status.history.push(entry);
    status.lastAnalyzedAt = entry.timestamp;
    status.lastError = undefined;

    if (status.history.length > MAX_HISTORY) {
      status.history = status.history.slice(-MAX_HISTORY);
    }
  }

  setError(cameraId: string, error: string): void {
    const status = this.data.get(cameraId);
    if (!status) return;
    status.lastError = error;
  }

  getStatus(cameraId: string): CameraStatus | undefined {
    return this.data.get(cameraId);
  }

  getAllStatuses(): CameraStatus[] {
    return Array.from(this.data.values());
  }

  getTotalCount(): number {
    let total = 0;
    for (const status of this.data.values()) {
      total += status.current?.count ?? 0;
    }
    return total;
  }
}

// Singleton: survives across API route invocations in the same Node.js process
const globalStore = globalThis as unknown as { __cameraStore?: CameraStore };
if (!globalStore.__cameraStore) {
  globalStore.__cameraStore = new CameraStore();
}

export const cameraStore: CameraStore = globalStore.__cameraStore;

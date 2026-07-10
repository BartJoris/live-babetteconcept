import type {
  DoclingConvertOptions,
  DoclingConvertResponse,
  DoclingAsyncTaskResponse,
  DoclingTaskStatus,
} from './types';

const DEFAULT_DOCLING_URL = 'http://localhost:5001';
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

export class DoclingClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(options?: { url?: string; apiKey?: string }) {
    this.baseUrl = options?.url || process.env.DOCLING_URL || DEFAULT_DOCLING_URL;
    this.apiKey = options?.apiKey || process.env.DOCLING_API_KEY;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }
    return headers;
  }

  async convertFile(
    file: Buffer,
    filename: string,
    options: DoclingConvertOptions
  ): Promise<DoclingConvertResponse> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file)], { type: 'application/octet-stream' });
    formData.append('files', blob, filename);
    formData.append('options', JSON.stringify(options));

    const response = await fetch(`${this.baseUrl}/v1/convert/file`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Docling convert failed (${response.status}): ${text || response.statusText}`
      );
    }

    return response.json() as Promise<DoclingConvertResponse>;
  }

  async convertSource(
    url: string,
    options: DoclingConvertOptions
  ): Promise<DoclingConvertResponse> {
    const response = await fetch(`${this.baseUrl}/v1/convert/source`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        http_sources: [{ url }],
        options,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Docling convert source failed (${response.status}): ${text || response.statusText}`
      );
    }

    return response.json() as Promise<DoclingConvertResponse>;
  }

  async convertFileAsync(
    file: Buffer,
    filename: string,
    options: DoclingConvertOptions
  ): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file)], { type: 'application/octet-stream' });
    formData.append('files', blob, filename);
    formData.append('options', JSON.stringify(options));

    const response = await fetch(`${this.baseUrl}/v1/convert/file/async`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Docling async convert failed (${response.status}): ${text || response.statusText}`
      );
    }

    const data = (await response.json()) as DoclingAsyncTaskResponse;
    return data.task_id;
  }

  async getTaskStatus(taskId: string): Promise<DoclingTaskStatus> {
    const response = await fetch(`${this.baseUrl}/v1/status/poll/${taskId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Docling status check failed (${response.status}): ${text || response.statusText}`
      );
    }

    return response.json() as Promise<DoclingTaskStatus>;
  }

  async getTaskResult(taskId: string): Promise<DoclingConvertResponse> {
    const response = await fetch(`${this.baseUrl}/v1/result/${taskId}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Docling result fetch failed (${response.status}): ${text || response.statusText}`
      );
    }

    return response.json() as Promise<DoclingConvertResponse>;
  }

  async waitForResult(
    taskId: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
  ): Promise<DoclingConvertResponse> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.getTaskStatus(taskId);

      switch (status.status) {
        case 'success':
          return this.getTaskResult(taskId);
        case 'failure':
          throw new Error(`Docling task ${taskId} failed`);
        case 'pending':
        case 'running':
          break;
        default: {
          const _exhaustive: never = status.status;
          throw new Error(`Unknown task status: ${_exhaustive}`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(
      `Docling task ${taskId} timed out after ${timeoutMs}ms`
    );
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const doclingClient = new DoclingClient();

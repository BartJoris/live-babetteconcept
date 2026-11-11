import {
  assertSafeFetchUrl,
  allowedHostsFromEnv,
  type AssertSafeFetchUrlOptions,
  SafeFetchUrlError,
} from './assertSafeFetchUrl';

export { SafeFetchUrlError, assertSafeFetchUrl, allowedHostsFromEnv };

export type SafeFetchOptions = AssertSafeFetchUrlOptions & {
  /** Max response body bytes (default 8 MiB). */
  maxBytes?: number;
  /** Abort after this many ms (default 15_000). */
  timeoutMs?: number;
  headers?: HeadersInit;
  signal?: AbortSignal;
};

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Fetch a caller-influenced URL after SSRF checks.
 * Disallows redirects (redirect targets are not re-validated).
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const allowedHosts = options.allowedHosts ?? allowedHostsFromEnv();
  await assertSafeFetchUrl(rawUrl, {
    ...options,
    allowedHosts,
  });

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onOuterAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'error',
      headers: options.headers,
      signal: controller.signal,
    });

    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader) {
      const length = Number(lengthHeader);
      if (Number.isFinite(length) && length > maxBytes) {
        throw new SafeFetchUrlError('INVALID_URL', `Response too large (Content-Length ${length})`);
      }
    }

    // Buffer with a hard cap so attackers cannot stream unbounded bodies.
    const reader = response.body?.getReader();
    if (!reader) {
      return response;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new SafeFetchUrlError('INVALID_URL', `Response exceeds ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    }

    const body = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener('abort', onOuterAbort);
  }
}

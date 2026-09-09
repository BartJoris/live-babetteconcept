import { APICallError } from '@ai-sdk/provider';
import { RetryError } from 'ai';

function unwrapError(error: unknown): unknown {
  if (RetryError.isInstance(error)) {
    return error.lastError ?? error;
  }
  return error;
}

function parseOpenAiErrorBody(responseBody?: string): { code?: string; message?: string } {
  if (!responseBody) return {};
  try {
    const parsed = JSON.parse(responseBody) as {
      error?: { code?: string; message?: string };
    };
    return parsed.error ?? {};
  } catch {
    return {};
  }
}

function isQuotaExhausted(code?: string, message?: string): boolean {
  const combined = `${code ?? ''} ${message ?? ''}`.toLowerCase();
  return (
    code === 'credit_balance_exhausted' ||
    code === 'insufficient_quota' ||
    combined.includes('no credits') ||
    combined.includes('insufficient_quota') ||
    combined.includes('credit_balance_exhausted')
  );
}

/** Map OpenAI / AI SDK failures to a short Dutch message for the /assistant UI. */
export function formatAssistantChatError(error: unknown): string {
  const root = unwrapError(error);

  if (APICallError.isInstance(root)) {
    const { code, message } = parseOpenAiErrorBody(root.responseBody);

    if (isQuotaExhausted(code, message ?? root.message)) {
      return 'OpenAI-tegoed is op. Herlaad credits op platform.openai.com om de assistent te gebruiken.';
    }
    if (root.statusCode === 401) {
      return 'OPENAI_API_KEY is ongeldig of verlopen. Controleer de API-sleutel in de serverconfiguratie.';
    }
    if (root.statusCode === 429) {
      return 'OpenAI-limiet bereikt. Probeer het zo meteen opnieuw.';
    }
    if (root.statusCode != null && root.statusCode >= 500) {
      return 'OpenAI is tijdelijk niet bereikbaar. Probeer het later opnieuw.';
    }
  }

  return 'De assistent kon geen antwoord genereren. Probeer later opnieuw.';
}

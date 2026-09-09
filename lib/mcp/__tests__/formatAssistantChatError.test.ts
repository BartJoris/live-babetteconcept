import { APICallError } from '@ai-sdk/provider';
import { RetryError } from 'ai';
import { describe, expect, it } from 'vitest';
import { formatAssistantChatError } from '@/lib/mcp/formatAssistantChatError';

describe('formatAssistantChatError', () => {
  it('maps exhausted OpenAI credits to a Dutch billing message', () => {
    const apiError = new APICallError({
      message: 'You have no credits remaining.',
      url: 'https://api.openai.com/v1/responses',
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          code: 'credit_balance_exhausted',
          message: 'You have no credits remaining.',
        },
      }),
    });

    expect(formatAssistantChatError(apiError)).toContain('OpenAI-tegoed is op');
  });

  it('unwraps RetryError and formats the last API error', () => {
    const apiError = new APICallError({
      message: 'quota',
      url: 'https://api.openai.com/v1/responses',
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify({
        error: { code: 'insufficient_quota', message: 'quota exceeded' },
      }),
    });

    const retry = new RetryError({
      message: 'Failed after 3 attempts',
      reason: 'maxRetriesExceeded',
      errors: [apiError, apiError, apiError],
    });

    expect(formatAssistantChatError(retry)).toContain('OpenAI-tegoed is op');
  });

  it('maps invalid API keys to a configuration message', () => {
    const apiError = new APICallError({
      message: 'Incorrect API key provided',
      url: 'https://api.openai.com/v1/responses',
      requestBodyValues: {},
      statusCode: 401,
    });

    expect(formatAssistantChatError(apiError)).toContain('OPENAI_API_KEY');
  });
});

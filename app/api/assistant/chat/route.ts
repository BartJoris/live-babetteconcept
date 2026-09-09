import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { requireAssistantSession } from '@/lib/mcp/assistantAuth';
import { buildAssistantSystemPrompt, createMcpAiTools } from '@/lib/mcp/chatTools';
import { formatAssistantChatError } from '@/lib/mcp/formatAssistantChatError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Keep ≤60s for plans without Fluid Compute extended duration.
// See https://vercel.com/docs/functions/limitations#max-duration
export const maxDuration = 60;

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  const auth = await requireAssistantSession();
  if (!auth.ok) return auth.response;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      { error: 'OPENAI_API_KEY is niet geconfigureerd' },
      { status: 503 }
    );
  }

  let body: { messages?: UIMessage[] };
  try {
    body = (await request.json()) as { messages?: UIMessage[] };
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'messages required' }, { status: 400 });
  }

  // Cap history to keep tool-heavy turns bounded.
  const recent = messages.slice(-24);

  const result = streamText({
    model: openai(process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4.1'),
    system: buildAssistantSystemPrompt({ username: auth.username }),
    messages: await convertToModelMessages(recent),
    tools: createMcpAiTools(),
    stopWhen: stepCountIs(8),
    temperature: 0.2,
    // Quota/rate-limit errors are retryable but repeating them adds ~10s of wait.
    maxRetries: 0,
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      const message = formatAssistantChatError(error);
      console.error('[assistant/chat]', error);
      return message;
    },
  });
}

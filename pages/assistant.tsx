import { FormEvent, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Navigation from '@/components/Navigation';
import { useAuth } from '@/lib/hooks/useAuth';

function partText(part: { type: string; text?: string }): string | null {
  if (part.type === 'text' && typeof part.text === 'string') return part.text;
  return null;
}

function toolLabel(part: { type: string; toolName?: string; state?: string }): string | null {
  if (!part.type.startsWith('tool-') && part.type !== 'dynamic-tool') return null;
  const name =
    'toolName' in part && typeof part.toolName === 'string'
      ? part.toolName
      : part.type.replace(/^tool-/, '');
  const state = 'state' in part && typeof part.state === 'string' ? part.state : '';
  if (state === 'input-available' || state === 'input-streaming') {
    return `Tool: ${name}…`;
  }
  if (state === 'output-available') {
    return `Tool: ${name} ✓`;
  }
  if (state === 'output-error') {
    return `Tool: ${name} ✗`;
  }
  return `Tool: ${name}`;
}

export default function AssistantPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const [input, setInput] = useState('');

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/assistant/chat',
        credentials: 'include',
      }),
    []
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
  });

  const busy = status === 'submitted' || status === 'streaming';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    void sendMessage({ text });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Navigation />
        <main className="max-w-3xl mx-auto px-4 py-10 text-stone-600">Laden…</main>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-orange-50/30 to-stone-100">
      <Navigation />
      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col" style={{ minHeight: 'calc(100vh - 4rem)' }}>
        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Babette assistent
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Stel vragen over omzet, merken, collecties, sell-through en solden. De chat gebruikt
            dezelfde MCP-tools als Cursor/ChatGPT.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {[
              'Hoeveel is onze huidige stock waard?',
              'Hoeveel % is Zomer 2026 al verkocht?',
              'Van welke producten is er enkel nog 1 maat over?',
              'Welke producten zijn ouder dan 2 jaar?',
            ].map((example) => (
              <button
                key={example}
                type="button"
                disabled={busy}
                onClick={() => {
                  setInput(example);
                }}
                className="rounded-full border border-stone-300 bg-white/80 px-3 py-1 text-stone-700 hover:border-stone-500 disabled:opacity-50"
              >
                {example}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="rounded-lg border border-dashed border-stone-300 bg-white/50 p-6 text-sm text-stone-600">
              Tip: vraag bv. om sell-through van een collectie vóór/tijdens de solden, of om een
              merkenranking.
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'ml-8 bg-stone-900 text-stone-50'
                  : 'mr-8 bg-white border border-stone-200 text-stone-800 shadow-sm'
              }`}
            >
              <div className="text-[11px] uppercase tracking-wide opacity-60 mb-1">
                {message.role === 'user' ? 'Jij' : 'Assistent'}
              </div>
              <div className="space-y-2 whitespace-pre-wrap">
                {message.parts.map((part, index) => {
                  const text = partText(part as { type: string; text?: string });
                  if (text != null) {
                    return <p key={`${message.id}-t-${index}`}>{text}</p>;
                  }
                  const label = toolLabel(
                    part as { type: string; toolName?: string; state?: string }
                  );
                  if (label) {
                    return (
                      <p
                        key={`${message.id}-tool-${index}`}
                        className="text-xs font-mono text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1"
                      >
                        {label}
                      </p>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error.message || 'Er ging iets mis bij de assistent.'}
          </div>
        )}

        <form onSubmit={onSubmit} className="sticky bottom-0 bg-gradient-to-t from-stone-100 via-stone-100 to-transparent pt-4 pb-2">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="Vraag iets over verkoop, merken of solden…"
              className="flex-1 resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
            />
            {busy ? (
              <button
                type="button"
                onClick={() => stop()}
                className="rounded-lg bg-stone-200 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-300"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
              >
                Stuur
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

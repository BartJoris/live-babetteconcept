import { useEffect, useState, type FormEvent } from 'react';

type ProblemJob = {
  id: string;
  prompt: string;
  status: string;
  prUrl: string | null;
  error: string | null;
  createdAt: string;
};

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'In wachtrij';
    case 'running':
      return 'In behandeling';
    case 'done':
      return 'Opgelost';
    case 'failed':
      return 'Mislukt';
    default:
      return status;
  }
}

export default function ProblemsPanel({ projectLabel }: { projectLabel: string }) {
  const [jobs, setJobs] = useState<ProblemJob[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/problems');
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Kon tickets niet laden.');
      }
      setJobs(payload.jobs ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kon tickets niet laden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Kon probleem niet versturen.');
      }
      setPrompt('');
      setSuccess('Probleem gemeld. Je ziet de status hieronder.');
      await loadJobs();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Kon probleem niet versturen.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Problemen</h1>
        <p className="mt-2 text-sm text-gray-600">
          Meld een probleem voor <strong>{projectLabel}</strong>. Tickets worden opgepakt via hetzelfde systeem als Braindump code-taken.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm text-gray-700">
            Wat gaat er mis?
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              required
              rows={6}
              placeholder="Bijvoorbeeld: supplier plugin parseert CSV niet meer correct…"
              className="rounded-xl border border-gray-300 px-3 py-3 text-base outline-none focus:border-blue-500"
            />
          </label>

          {success ? (
            <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {success}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? 'Versturen…' : 'Probleem melden'}
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-gray-500">Recente tickets</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Laden…</p>
        ) : jobs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
            Nog geen problemen gemeld.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <article
                key={job.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-600">
                    {statusLabel(job.status)}
                  </span>
                  <time className="text-xs text-gray-500">
                    {new Date(job.createdAt).toLocaleString('nl-BE')}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-900">{job.prompt}</p>
                {job.prUrl ? (
                  <a
                    href={job.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-blue-600 underline"
                  >
                    Open PR
                  </a>
                ) : null}
                {job.error ? (
                  <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
                    {job.error}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

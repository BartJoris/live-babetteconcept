const DEFAULT_BRAINDUMP_URL = 'https://brain.bartjoris.be';
const REPO_SLUG = 'live-babetteconcept';

function braindumpUrl(): string {
  return (process.env.BRAINDUMP_URL || DEFAULT_BRAINDUMP_URL).replace(/\/$/, '');
}

function problemsToken(): string {
  const token = process.env.BRAINDUMP_PROBLEMS_TOKEN;
  if (!token) {
    throw new Error('BRAINDUMP_PROBLEMS_TOKEN is not configured.');
  }
  return token;
}

export async function listBraindumpProblems() {
  const response = await fetch(`${braindumpUrl()}/api/problems/${REPO_SLUG}`, {
    headers: {
      Authorization: `Bearer ${problemsToken()}`,
    },
    cache: 'no-store',
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Could not load problems.');
  }
  return payload;
}

export async function createBraindumpProblem(input: {
  prompt: string;
  reportedBy?: string;
}) {
  const body = new URLSearchParams();
  body.set('prompt', input.prompt);
  if (input.reportedBy) {
    body.set('reportedBy', input.reportedBy);
  }

  const response = await fetch(`${braindumpUrl()}/api/problems/${REPO_SLUG}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${problemsToken()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Could not create problem.');
  }
  return payload;
}

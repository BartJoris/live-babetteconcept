import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { getPullRequest, getLatestWorkflowRunForBranch, GitHubApiError } from '@/lib/github/repoWriter';

interface OnboardStatusResponse {
  success: boolean;
  prState?: 'open' | 'closed' | 'merged' | 'unknown';
  mergeable?: boolean | null;
  workflowStatus?: string | null;
  workflowConclusion?: string | null;
  workflowUrl?: string | null;
  error?: string;
}

async function handler(req: NextApiRequestWithSession, res: NextApiResponse<OnboardStatusResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { prNumber, branch } = req.query;
  const prNumberValue = Array.isArray(prNumber) ? prNumber[0] : prNumber;
  const branchValue = Array.isArray(branch) ? branch[0] : branch;

  if (!prNumberValue || Number.isNaN(Number(prNumberValue))) {
    return res.status(400).json({ success: false, error: 'prNumber is verplicht.' });
  }

  let prState: OnboardStatusResponse['prState'] = 'unknown';
  let mergeable: boolean | null = null;
  try {
    const pr = await getPullRequest(Number(prNumberValue));
    prState = pr.merged ? 'merged' : pr.state;
    mergeable = pr.mergeable;
  } catch (error) {
    if (!(error instanceof GitHubApiError)) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
    // Keep prState 'unknown' but don't fail the whole poll on a transient GitHub error.
  }

  let workflowStatus: string | null = null;
  let workflowConclusion: string | null = null;
  let workflowUrl: string | null = null;
  if (branchValue) {
    try {
      const run = await getLatestWorkflowRunForBranch(branchValue);
      if (run) {
        workflowStatus = run.status;
        workflowConclusion = run.conclusion;
        workflowUrl = run.htmlUrl;
      }
    } catch (error) {
      if (!(error instanceof GitHubApiError)) {
        return res.status(500).json({ success: false, error: (error as Error).message });
      }
      // Transient — client will retry on the next poll.
    }
  }

  return res.status(200).json({ success: true, prState, mergeable, workflowStatus, workflowConclusion, workflowUrl });
}

export default withAuth(handler);

import type { NextApiResponse } from 'next';
import { withAuth, NextApiRequestWithSession } from '@/lib/middleware/withAuth';
import { auditLogger } from '@/lib/auditLog';

/**
 * Audit logs viewing endpoint (admin only)
 * GET /api/audit-logs?type=recent&count=100
 * GET /api/audit-logs?type=failed&count=50
 * GET /api/audit-logs?type=event&event=LOGIN_FAILURE&count=25
 */
async function handler(req: NextApiRequestWithSession, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type = 'recent', count: countStr = '100', event, userId, ip } = req.query;
    const count = parseInt(countStr as string, 10) || 100;

    let logs;

    switch (type) {
      case 'recent':
        logs = auditLogger.getRecentLogs(count);
        break;

      case 'failed':
        logs = auditLogger.getFailedEvents(count);
        break;

      case 'event':
        if (!event || typeof event !== 'string') {
          return res.status(400).json({ error: 'Event type required' });
        }
        logs = auditLogger.getLogsByEvent(event as any, count);
        break;

      case 'user':
        if (!userId) {
          return res.status(400).json({ error: 'User ID required' });
        }
        logs = auditLogger.getLogsByUser(parseInt(userId as string, 10), count);
        break;

      case 'ip':
        if (!ip || typeof ip !== 'string') {
          return res.status(400).json({ error: 'IP address required' });
        }
        logs = auditLogger.getLogsByIp(ip, count);
        break;

      case 'export':
        const exported = auditLogger.exportLogs();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.json');
        return res.send(exported);

      default:
        return res.status(400).json({ error: 'Invalid type parameter' });
    }

    return res.status(200).json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    console.error('Audit logs error:', error);
    const err = error as { message?: string };
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve audit logs',
    });
  }
}

export default withAuth(handler);


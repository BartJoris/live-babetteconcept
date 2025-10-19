import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

interface AuditLogEntry {
  timestamp: string;
  event: string;
  userId?: number;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  success: boolean;
}

export default function AuditMonitor() {
  const { isLoggedIn, isLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'failed' | 'success'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchLogs = async () => {
    try {
      const type = filter === 'failed' ? 'failed' : 'recent';
      const res = await fetch(`/api/audit-logs?type=${type}&count=50`);
      const data = await res.json();
      
      if (data.success) {
        let filteredLogs = data.logs;
        if (filter === 'success') {
          filteredLogs = data.logs.filter((log: AuditLogEntry) => log.success);
        }
        setLogs(filteredLogs);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  useEffect(() => {
    if (isLoggedIn && !isLoading) {
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, isLoading, filter]);

  useEffect(() => {
    if (!autoRefresh || !isLoggedIn) return;

    const interval = setInterval(() => {
      fetchLogs();
    }, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, isLoggedIn, filter]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-600">⏳ Loading...</p>
      </div>
    );
  }

  const getEventColor = (event: string) => {
    if (event.includes('SUCCESS')) return 'text-green-600 bg-green-50';
    if (event.includes('FAILURE')) return 'text-red-600 bg-red-50';
    if (event.includes('EXCEEDED')) return 'text-orange-600 bg-orange-50';
    if (event.includes('LOGOUT')) return 'text-blue-600 bg-blue-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getEventIcon = (event: string) => {
    if (event.includes('SUCCESS')) return '✅';
    if (event.includes('FAILURE')) return '❌';
    if (event.includes('EXCEEDED')) return '⚠️';
    if (event.includes('LOGOUT')) return '👋';
    if (event.includes('IMPORT')) return '📦';
    return '📝';
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">🔍 Security Audit Monitor</h1>
              <p className="text-sm text-gray-600 mt-1">
                Real-time security event tracking • Last update: {lastUpdate.toLocaleTimeString()}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                  autoRefresh
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                }`}
              >
                {autoRefresh ? '🔄 Auto-Refresh ON' : '⏸️ Auto-Refresh OFF'}
              </button>
              <button
                onClick={fetchLogs}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
              >
                🔄 Refresh Now
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All Events ({logs.length})
            </button>
            <button
              onClick={() => setFilter('success')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'success'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ✅ Success Only
            </button>
            <button
              onClick={() => setFilter('failed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'failed'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              ❌ Failed Only
            </button>
          </div>

          {/* Logs Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Time</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Event</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">User</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">IP Address</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500">
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log, index) => (
                    <tr
                      key={`${log.timestamp}-${index}`}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getEventColor(
                            log.event
                          )}`}
                        >
                          <span>{getEventIcon(log.event)}</span>
                          {log.event.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {log.username ? (
                          <div>
                            <div className="font-medium text-gray-900">{log.username}</div>
                            {log.userId && (
                              <div className="text-xs text-gray-500">ID: {log.userId}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">Anonymous</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 font-mono">
                        {log.ipAddress || 'unknown'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {log.details && Object.keys(log.details).length > 0 ? (
                          <details className="cursor-pointer">
                            <summary className="text-blue-600 hover:text-blue-700">
                              View details
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-600 font-medium">Total Events</div>
              <div className="text-2xl font-bold text-blue-900">{logs.length}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-green-600 font-medium">Successful</div>
              <div className="text-2xl font-bold text-green-900">
                {logs.filter((l) => l.success).length}
              </div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-sm text-red-600 font-medium">Failed</div>
              <div className="text-2xl font-bold text-red-900">
                {logs.filter((l) => !l.success).length}
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-sm text-purple-600 font-medium">Unique Users</div>
              <div className="text-2xl font-bold text-purple-900">
                {new Set(logs.map((l) => l.username).filter(Boolean)).size}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-700 mb-2">Event Types:</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div>✅ LOGIN_SUCCESS</div>
              <div>❌ LOGIN_FAILURE</div>
              <div>👋 LOGOUT</div>
              <div>⚠️ RATE_LIMIT_EXCEEDED</div>
              <div>📦 PRODUCT_IMPORT_*</div>
              <div>🔒 UNAUTHORIZED_ACCESS</div>
              <div>📝 SESSION_CREATED</div>
              <div>⏰ SESSION_EXPIRED</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


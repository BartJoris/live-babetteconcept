/**
 * Audit Logging System
 * Logs security-relevant events for monitoring and compliance
 */

export type AuditEvent =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'SESSION_CREATED'
  | 'SESSION_EXPIRED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNAUTHORIZED_ACCESS'
  | 'PRODUCT_IMPORT_START'
  | 'PRODUCT_IMPORT_SUCCESS'
  | 'PRODUCT_IMPORT_FAILURE'
  | 'DATA_EXPORT'
  | 'PERMISSION_DENIED';

export interface AuditLogEntry {
  timestamp: string;
  event: AuditEvent;
  userId?: number;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  success: boolean;
}

class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 events in memory

  /**
   * Log a security event
   */
  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    const logEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    // Add to in-memory logs
    this.logs.push(logEntry);

    // Trim if exceeds max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Log to console (in production, this would go to a logging service)
    this.logToConsole(logEntry);

    // In production, you would also:
    // - Write to file
    // - Send to logging service (e.g., Winston, Pino, Datadog, Sentry)
    // - Store in database for long-term audit trail
  }

  /**
   * Log to console with appropriate level
   */
  private logToConsole(entry: AuditLogEntry): void {
    const prefix = entry.success ? '✅' : '❌';
    const level = entry.success ? 'info' : 'warn';
    
    const message = `${prefix} [AUDIT] ${entry.event}`;
    const details = {
      timestamp: entry.timestamp,
      user: entry.username || entry.userId || 'anonymous',
      ip: entry.ipAddress || 'unknown',
      ...entry.details,
    };

    if (level === 'warn') {
      console.warn(message, details);
    } else {
      console.log(message, details);
    }
  }

  /**
   * Get recent logs (for monitoring dashboards)
   */
  getRecentLogs(count: number = 100): AuditLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs filtered by event type
   */
  getLogsByEvent(event: AuditEvent, count: number = 100): AuditLogEntry[] {
    return this.logs
      .filter((log) => log.event === event)
      .slice(-count);
  }

  /**
   * Get failed events (for security monitoring)
   */
  getFailedEvents(count: number = 100): AuditLogEntry[] {
    return this.logs
      .filter((log) => !log.success)
      .slice(-count);
  }

  /**
   * Get logs for a specific user
   */
  getLogsByUser(userId: number, count: number = 100): AuditLogEntry[] {
    return this.logs
      .filter((log) => log.userId === userId)
      .slice(-count);
  }

  /**
   * Get logs for a specific IP address (for abuse detection)
   */
  getLogsByIp(ipAddress: string, count: number = 100): AuditLogEntry[] {
    return this.logs
      .filter((log) => log.ipAddress === ipAddress)
      .slice(-count);
  }

  /**
   * Clear all logs (use with caution)
   */
  clear(): void {
    this.logs = [];
    console.log('[AUDIT] Log history cleared');
  }

  /**
   * Export logs as JSON (for backup or analysis)
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();

// Helper functions for common events

export function logLoginSuccess(userId: number, username: string, ipAddress: string, userAgent?: string): void {
  auditLogger.log({
    event: 'LOGIN_SUCCESS',
    userId,
    username,
    ipAddress,
    userAgent,
    success: true,
  });
}

export function logLoginFailure(username: string, ipAddress: string, reason: string, userAgent?: string): void {
  auditLogger.log({
    event: 'LOGIN_FAILURE',
    username,
    ipAddress,
    userAgent,
    details: { reason },
    success: false,
  });
}

export function logLogout(userId: number, username: string, ipAddress: string): void {
  auditLogger.log({
    event: 'LOGOUT',
    userId,
    username,
    ipAddress,
    success: true,
  });
}

export function logRateLimitExceeded(ipAddress: string, endpoint: string): void {
  auditLogger.log({
    event: 'RATE_LIMIT_EXCEEDED',
    ipAddress,
    details: { endpoint },
    success: false,
  });
}

export function logUnauthorizedAccess(endpoint: string, ipAddress: string, userId?: number): void {
  auditLogger.log({
    event: 'UNAUTHORIZED_ACCESS',
    userId,
    ipAddress,
    details: { endpoint },
    success: false,
  });
}

export function logProductImport(
  userId: number,
  username: string,
  ipAddress: string,
  success: boolean,
  productsCount: number,
  details?: Record<string, unknown>
): void {
  auditLogger.log({
    event: success ? 'PRODUCT_IMPORT_SUCCESS' : 'PRODUCT_IMPORT_FAILURE',
    userId,
    username,
    ipAddress,
    details: { 
      productsCount, 
      timestamp: new Date().toISOString(),
      ...details 
    },
    success,
  });
}


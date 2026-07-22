const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Validates a requested redirect_uri against a registered one.
 * Per RFC 8252 §7.3, any port is allowed for loopback hosts.
 */
export function redirectUriMatches(requested: string, registered: string): boolean {
  if (requested === registered) return true;

  let req: URL;
  let reg: URL;
  try {
    req = new URL(requested);
    reg = new URL(registered);
  } catch {
    return false;
  }

  if (!LOOPBACK_HOSTS.has(req.hostname) || !LOOPBACK_HOSTS.has(reg.hostname)) {
    return false;
  }

  return (
    req.protocol === reg.protocol &&
    req.hostname === reg.hostname &&
    req.pathname === reg.pathname &&
    req.search === reg.search
  );
}

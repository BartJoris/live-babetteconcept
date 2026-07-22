function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAuthorizePage(input: {
  action: string;
  error?: string;
  clientName?: string;
  fields: Record<string, string>;
}): string {
  const hidden = Object.entries(input.fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`
    )
    .join('\n');

  const errorBlock = input.error
    ? `<p class="error">${escapeHtml(input.error)}</p>`
    : '';

  const clientLine = input.clientName
    ? `<p class="muted">App: <strong>${escapeHtml(input.clientName)}</strong></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Babette MCP — Authorize</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
      background: linear-gradient(160deg, #f7f3ee 0%, #ebe4da 50%, #e3ece8 100%);
      color: #1c1917;
    }
    main {
      width: min(420px, calc(100vw - 2rem));
      padding: 1.75rem;
      background: rgba(255,255,255,0.72);
      border: 1px solid rgba(28,25,23,0.08);
      backdrop-filter: blur(8px);
    }
    h1 { font-size: 1.25rem; margin: 0 0 0.35rem; font-weight: 650; letter-spacing: -0.02em; }
    p { margin: 0 0 1rem; line-height: 1.45; }
    .muted { color: #57534e; font-size: 0.95rem; }
    .error { color: #9f1239; background: #fff1f2; padding: 0.65rem 0.75rem; }
    label { display: block; font-size: 0.85rem; margin-bottom: 0.35rem; color: #44403c; }
    input[type="password"] {
      width: 100%; box-sizing: border-box; padding: 0.7rem 0.75rem;
      border: 1px solid #d6d3d1; background: #fff; font-size: 1rem;
    }
    button {
      margin-top: 1rem; width: 100%; padding: 0.75rem 1rem;
      border: 0; background: #1c1917; color: #fafaf9; font-size: 0.95rem; cursor: pointer;
    }
    button:hover { background: #292524; }
  </style>
</head>
<body>
  <main>
    <h1>Babette Concept MCP</h1>
    <p class="muted">Bevestig toegang met je MCP API token (zelfde token als in Cursor).</p>
    ${clientLine}
    ${errorBlock}
    <form method="post" action="${escapeHtml(input.action)}">
      ${hidden}
      <label for="token">MCP API token</label>
      <input id="token" name="token" type="password" autocomplete="current-password" required autofocus />
      <button type="submit">Authorize</button>
    </form>
  </main>
</body>
</html>`;
}

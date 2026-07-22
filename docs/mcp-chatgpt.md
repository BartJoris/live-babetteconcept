# ChatGPT → Babette MCP (OAuth)

Remote MCP URL:

```text
https://live.babetteconcept.be/api/mcp
```

Auth: OAuth (authorization code + PKCE). On the authorize page, enter the same `MCP_API_TOKEN` you use in Cursor.

## ChatGPT web (Developer mode)

1. Paid ChatGPT plan (Plus / Pro / Business / …).
2. Settings → **Security and login** → enable **Developer mode**.
3. Open [chatgpt.com/plugins](https://chatgpt.com/plugins) → **+** → create developer-mode app.
4. Fill in:
   - **Name:** Babette Concept
   - **MCP server URL:** `https://live.babetteconcept.be/api/mcp`
   - **Authentication:** OAuth
5. Create / Connect. ChatGPT opens the Babette authorize page.
6. Paste `MCP_API_TOKEN` → **Authorize**.
7. In a chat: Plus menu → **Developer mode** → enable the Babette app.

## Required Vercel env

| Variable | Required | Notes |
|----------|----------|--------|
| `MCP_API_TOKEN` | yes | Shared secret (Cursor Bearer + authorize page) |
| `MCP_PUBLIC_BASE_URL` | yes in prod | `https://live.babetteconcept.be` |
| `MCP_OAUTH_SIGNING_SECRET` | recommended | Random 32+ bytes; otherwise falls back to `SESSION_SECRET` / `MCP_API_TOKEN` |

## Discovery endpoints

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/api/mcp`
- `/.well-known/oauth-authorization-server`
- `/oauth/authorize`
- `/oauth/token`
- `/oauth/register`

## Cursor (unchanged)

Keep using Bearer auth in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "babetteconcept": {
      "url": "https://live.babetteconcept.be/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_API_TOKEN"
      }
    }
  }
}
```

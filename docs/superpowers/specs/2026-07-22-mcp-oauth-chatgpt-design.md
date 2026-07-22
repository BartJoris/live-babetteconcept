# MCP OAuth for ChatGPT (design)

## Goal

Allow ChatGPT web (Developer mode) to connect to `https://live.babetteconcept.be/api/mcp` via OAuth, while keeping existing Cursor Bearer (`MCP_API_TOKEN`) working.

## Approach

Minimal Authorization Server embedded in the Next.js app:

- Shared secret gate on `/oauth/authorize` (same `MCP_API_TOKEN`)
- Authorization Code + PKCE (S256)
- CIMD + Dynamic Client Registration (JWT-encoded client records for serverless)
- Access/refresh tokens as HS256 JWTs (no DB)
- `/api/mcp` accepts static Bearer **or** valid OAuth access JWT

## Endpoints

| Path | Purpose |
|------|---------|
| `/.well-known/oauth-protected-resource` | PRM (resource = `/api/mcp`) |
| `/.well-known/oauth-protected-resource/api/mcp` | Path-specific PRM |
| `/.well-known/oauth-authorization-server` | AS metadata (CIMD + DCR) |
| `/oauth/authorize` | Consent page + code redirect |
| `/oauth/token` | Code/refresh → tokens |
| `/oauth/register` | DCR |

## Env

- `MCP_API_TOKEN` (required, existing)
- `MCP_OAUTH_SIGNING_SECRET` (recommended; falls back to `SESSION_SECRET` then `MCP_API_TOKEN`)
- `MCP_PUBLIC_BASE_URL` (optional; else request Host / `VERCEL_URL`)

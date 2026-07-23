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

## On-site chat (`/assistant`)

Logged-in users can chat at **https://live.babetteconcept.be/assistant**.

- API: `POST /api/assistant/chat` (iron-session auth + OpenAI tool calling)
- Tools: same read-only MCP tool set as Cursor/ChatGPT
- Requires `OPENAI_API_KEY` (optional `OPENAI_ASSISTANT_MODEL`)

## Sell-through & merkeninzicht

### Metric

`sell-through % = stuks verkocht / (startvoorraad + inkomen in periode) × 100` (POS only).

Status buckets: hit ≥80%, good ≥60%, slow ≥40%, dead &lt;40%.

### Belgian trading calendar

- Wintersolden: 3 jan–31 jan (2 jan als 3 jan zondag is)
- Zomersolden: 1 jul–31 jul (30 jun als 1 jul zondag is)
- Tool: `get_retail_calendar`

### New tools

| Tool | Use when |
|------|----------|
| `get_retail_calendar` | Wanneer starten solden/seizoenen? |
| `list_categories` | Zoek collectie “Zomer 2026” / “Solden …” |
| `analyze_assortment` | % verkocht merk/collectie; voor/tijdens solden |
| `rank_brands` | Beste merk (audience: `adults` / `kids` / `babies` / `children` / `teens`) |
| `analyze_solden_discounts` | Hoe/wanneer korting tijdens vorige solden |
| `get_stock_summary` | Huidige stock: stuks/varianten/modellen + kost- én verkoopwaarde |
| `list_last_size_left` | Modellen met nog exact 1 stuk van 1 variant |
| `list_aged_stock` | Stock ouder dan 2j (collectiejaar of eerste ontvangst) |
| `count_assortment` | Hoeveel modellen/varianten aangemaakt in merk/collectie (bv. AW26) |

### Example prompts

- “Hoeveel percent is er al verkocht van Zomer 2026?”
- “Toon me hoeveel van Zomer 2026 verkocht is vóór de zomersolden.”
- “Hoe goed verkocht Hvid dit jaar?”
- “Welk merk verkocht het best voor volwassenen dit jaar?”
- “Analyseer hoe en wanneer er korting werd gegeven tijdens de zomersolden 2025.”
- “Hoeveel is onze huidige stock waard?”
- “Hoeveel producten zijn er nog aanwezig?”
- “Van welke producten is er enkel nog 1 maat over?”
- “Welke producten zijn ouder dan 2 jaar en hoeveel hebben we daar nog van?”

### Discount manners (`analyze_solden_discounts`)

- `line_percent` — `pos.order.line.discount > 0`
- `order_level_korting` — aparte POS-regel met naam korting/discount/summersales
- `solden_category` — artikel in Solden-categorie (prijs kan al verlaagd zijn)

Geen historische list_price: markdown “van €X naar €Y” is niet reconstrueerbaar.

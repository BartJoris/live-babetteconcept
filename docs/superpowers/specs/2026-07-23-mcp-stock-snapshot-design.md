# MCP stock snapshot & aged stock — design

**Date:** 2026-07-23  
**Status:** Implemented  
**Surface:** MCP tools (`/api/mcp`) + on-site assistant (`/assistant` via `createMcpAiTools`)

## Goal

Let staff ask natural-language questions about current inventory:

1. How much is current stock worth? (cost **and** retail)
2. How many products are still available? (units + variants + templates)
3. Which products have only one size/variant left, with qty = 1?
4. Which products are older than 2 years, and how much stock remains?

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Valuation | Both: `Σ qty × standard_price` (cost) and `Σ qty × list_price` (retail/RRP) |
| Availability counts | Return all three: total units, in-stock variant count, in-stock template count |
| Last size left | Exactly **one** in-stock variant on the template **and** that variant’s `qty_available === 1` |
| Aged stock age signals | Collection year from category name **or** first incoming `stock.move` (OR) |
| Default age threshold | 2 years (`minAgeYears`, overridable) |
| Tool split | Three read-only tools (not one mega-tool) |
| Filters | Optional brand / category / audience (same semantics as sell-through) |

## Non-goals

- Seasonal historical valuation (that stays on brand-inventory)
- Archiving empty variants
- Changing Odoo data
- Webshop-only published filter (unless later requested)

## Architecture

```
lib/retail/stockSnapshot.ts     # shared domain logic
lib/mcp/tools.ts                # Zod schemas + thin MCP wrappers
lib/mcp/chatTools.ts            # system prompt hints for the three tools
docs/mcp-chatgpt.md             # short tool table update
lib/retail/__tests__/…          # pure helpers (age parse, last-size predicate)
```

Reuse from `lib/retail/sellThrough.ts` where practical:

- Category resolve + category tree IDs
- Brand (MERK) template filter
- `AudienceFilter` / `sizeAttributeNamesForAudience`

Do **not** order Odoo queries by non-stored fields (e.g. `complete_name`).

## Tool 1: `get_stock_summary`

**Purpose:** Answer “stock waard?” and “hoeveel producten aanwezig?”

**Input (all optional except nothing required):**

- `brand?: string` — MERK value
- `category?: string` — product.category name/path
- `audience?:` `all` \| `adults` \| `kids` \| `babies` \| `children` \| `teens`

**Domain:**

- Active `product.product`
- `qty_available > 0`
- Exclude `qty_available === -1` (unlimited sentinel used elsewhere)
- Apply optional brand/category/audience filters at template level where applicable

**Output:**

```ts
{
  filters: { brand, category, audience },
  totalUnits: number,
  variantCount: number,   // distinct product.product with stock
  templateCount: number,  // distinct product_tmpl_id with stock
  costValue: number,      // Σ qty * standard_price
  retailValue: number,    // Σ qty * list_price
  zeroCostUnits: number,  // units where standard_price is 0/missing
  summary: string         // short NL sentence for the model
}
```

## Tool 2: `list_last_size_left`

**Purpose:** “Enkel nog XS met 1 stuk” / laatste maat met qty 1.

**Input:**

- Same optional filters as summary
- `limit?: number` (default 50, max 100)

**Logic (per `product_tmpl_id`):**

1. Consider active variants only
2. In-stock set = variants with `qty_available > 0` and `qty_available !== -1`
3. Match if `inStock.length === 1` **and** that variant’s qty `=== 1`

**Output:**

```ts
{
  count: number,
  items: Array<{
    templateId: number,
    name: string,
    remainingVariantId: number,
    remainingLabel: string,  // size / display hint from display_name or attribute
    barcode: string | null,
    qty: 1,
    costPrice: number,
    listPrice: number,
    brand: string | null,
    category: string | null
  }>,
  summary: string
}
```

## Tool 3: `list_aged_stock`

**Purpose:** Products older than N years that still have stock.

**Input:**

- `minAgeYears?: number` (default 2, min 1, max 10)
- Same optional brand/category/audience filters
- `limit?: number` (default 50, max 100)

**Age signals:**

1. **Collection year** — parse from `product.category` `name` / `complete_name`  
   Patterns to support (case-insensitive): years in names like `Zomer 2024`, `Winter 2023`, `Solden zomer 2024`, `Stocksale juni 2026`. Take the most relevant 4-digit year `20xx` from the category path.  
   Age in years (calendar): `currentYear - collectionYear` (Europe/Brussels current year).
2. **First receipt** — earliest completed incoming `stock.move` for the product’s variants (same spirit as sell-through stock-in; prefer moves that increase stock / incoming). Store ISO date.

**Inclusion (OR):**

- `collectionYear` present and `currentYear - collectionYear >= minAgeYears`, **or**
- `firstReceiptDate` present and age from that date ≥ `minAgeYears` (use calendar date in Europe/Brussels)

If collection year cannot be parsed → only first-receipt rule applies.  
If neither signal → exclude from aged list (do not guess from `create_date`).

**Output:**

```ts
{
  minAgeYears: number,
  asOfDate: string, // YYYY-MM-DD Brussels
  totals: {
    templateCount: number,
    totalUnits: number,
    costValue: number,
    retailValue: number
  },
  items: Array<{
    templateId: number,
    name: string,
    category: string | null,
    collectionYear: number | null,
    firstReceiptDate: string | null, // YYYY-MM-DD
    ageReason: 'collection' | 'first_receipt' | 'both',
    units: number,
    costValue: number,
    retailValue: number,
    brand: string | null
  }>,
  summary: string
}
```

Sort: oldest first (by collectionYear asc, then firstReceiptDate asc). Truncate `items` to `limit` but keep `totals` over the full aged set when feasible; if full-catalog scan must be capped for performance, document the cap in `summary`.

## Performance & pitfalls

| Risk | Mitigation |
|------|------------|
| Large catalog | Batch `search_read` with high limit; if truncated, set `truncated: true` + warn in summary |
| `standard_price` = 0 | Surface `zeroCostUnits` / note in summary |
| `qty_available = -1` | Never treat as “1 left” or countable stock |
| Non-stored `complete_name` order | Never SQL-order by it |
| Color × size variants | “Last size” = last **in-stock variant**, not MAAT-only unless label parsing is cheap |
| First receipt query cost | Group by template; query moves for candidate product IDs with stock only |
| Ambiguous category years | Prefer year on the product’s own `categ_id` path; if multiple years, use the **latest** year in the path (most specific season) |

## Assistant prompt additions

- Stock value → `get_stock_summary` (report cost **and** retail)
- Counts → same tool
- Last piece / only XS left → `list_last_size_left`
- Older than 2 years / old stock → `list_aged_stock`
- Answer in Dutch; mention filters when applied

## Testing

- Unit: parse collection year from category strings; last-size predicate; age OR rule
- Smoke (manual/local): `executeTool('get_stock_summary', {})`, small filtered `list_last_size_left`, `list_aged_stock` with `minAgeYears: 2`

## Out of scope follow-ups

- Breakdown by brand in summary (can use existing `rank_brands` / brand-inventory UI)
- Export CSV from chat
- Using `create_date` as third age signal

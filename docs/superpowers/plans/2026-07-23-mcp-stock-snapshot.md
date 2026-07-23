# MCP Stock Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or subagent-driven-development.

**Goal:** Add three read-only MCP tools for stock value/counts, last-size-left (qty=1), and aged stock (collection year OR first receipt ≥ N years).

**Architecture:** Domain logic in `lib/retail/stockSnapshot.ts`; thin Zod wrappers in `lib/mcp/tools.ts`; assistant prompt hints in `lib/mcp/chatTools.ts`. Reuse category tree + audience MAAT mapping from sell-through.

**Tech Stack:** TypeScript, Odoo JSON-RPC via `odooClient`, Vitest, Zod schemas in MCP tools.

## Global Constraints

- Valuation: both `qty × standard_price` and `qty × list_price`
- In-stock: `qty_available > 0` and not `-1`
- Last size: exactly one in-stock variant with qty === 1
- Aged: collection year OR first incoming stock.move (OR), default minAgeYears=2
- Never SQL-order by non-stored `complete_name`
- Access: `read` only

---

### Task 1: Pure helpers + unit tests

**Files:**
- Create: `lib/retail/stockSnapshot.ts` (helpers first)
- Create: `lib/retail/__tests__/stockSnapshot.test.ts`

- [x] Parse collection year, last-size predicate, age OR rule, unit tests
- [x] Implement Odoo-backed summary / last-size / aged list
- [x] Wire MCP tools + assistant prompt + docs

---

### Task 2: MCP wiring

**Files:**
- Modify: `lib/mcp/tools.ts`
- Modify: `lib/mcp/chatTools.ts`
- Modify: `docs/mcp-chatgpt.md`
- Modify: `lib/__tests__/mcp-tools.test.ts` (expect new tool names)

---

### Task 3: Smoke

- Manual `executeTool` against Odoo when credentials available
- `npm run test:run` + `npm run typecheck`

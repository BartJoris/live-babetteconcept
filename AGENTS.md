# Agent guide — supplier plugins

When asked to add or update a supplier, follow this checklist.

## 1. Create the plugin folder

- Path: `lib/suppliers/<supplier-id>/`
- Use lowercase id without spaces (e.g. `newbrand`).

## 2. Implement the plugin

- Add `index.ts` exporting a `SupplierPlugin` (see `lib/suppliers/types.ts`).
- Reuse helpers from `lib/suppliers/create-csv-supplier.ts` when the supplier sends CSV orders.
- Add PDF parsers only when needed (see `lib/suppliers/fub/pdf.ts` as example).
- Put sample files under `lib/suppliers/<id>/samples/`.
- Add `index.test.ts` with at least one parse test.

## 3. Register the supplier

- Import the plugin in `lib/suppliers/index.ts`.
- Add it to the `allPlugins` array.

## 4. Verify

```bash
npm test
```

## 5. Pull request

- One supplier per PR when possible.
- PR title: `Add supplier: <Display Name>`
- Mention supported file types in the PR body.

## References

- Registry: `lib/suppliers/registry.ts`
- Onboarding flow: `lib/suppliers/onboarding/`, `pages/supplier-onboarding.tsx`
- Smart upload UI: `pages/smart-upload.tsx`
- Similar CSV suppliers: `lib/suppliers/baje/`, `lib/suppliers/nixnut/`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

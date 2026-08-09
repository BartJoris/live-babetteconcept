---
name: supplier-onboarding
description: >-
  Finishes a new-supplier onboarding pull request: refines the CSV/PDF parser
  from real sample files, writes a Vitest test, refines the detection rule,
  and wires up image-filename matching. Use when the user asks to pick up,
  process, verwerk, or finish a supplier onboarding PR/branch (branch prefix
  "supplier/"), or wants to integrate a new supplier into the smart detection
  system after the "Nieuwe Leverancier Toevoegen" website flow created a PR.
---

# Supplier Onboarding (local pickup)

This replaces the (currently broken) self-hosted-runner GitHub Actions agent:
the PR from `pages/api/suppliers/onboard.ts` already exists with sample files
and a bare concept parser — you finish it locally instead of CI.

Per the workspace `graphify` rule, query the graph before exploring
`lib/suppliers/` (e.g. `graphify query "<supplier id> supplier plugin"`).

## Steps

1. **Resolve the branch.** If the user gave a PR number or branch name, use
   it. Otherwise run `gh pr list --search "head:supplier/" --state open` and
   ask which one. Branches are named `supplier/<id>-<timestamp>`.
2. **Check out the branch.** `git fetch origin <branch> && git checkout <branch>`.
3. **Duplicate check first.** Search `lib/suppliers/*/index.ts` for a plugin
   with matching `displayName`/`brandName`/CSV columns, and check the
   detection score in `pages/api/detect-supplier.ts` for this sample data
   against existing rules. If it's actually an existing supplier under a
   different name/id: remove the new duplicate plugin folder, the
   registration in `lib/suppliers/index.ts`, and the detect stub again, and
   port the improvement into the existing plugin instead. Explain this in
   the commit message (see the `tinybigsister` → `tinycottons` merge in git
   history for precedent). Commit + push, then stop — no further steps needed.
4. **Refine the parser.** Not a duplicate: open and read the real sample
   files in `lib/suppliers/<id>/samples/` yourself (don't rely on the
   generated stub's assumptions — it was created with empty column mappings
   on purpose). Rewrite `lib/suppliers/<id>/index.ts` to parse correctly,
   following the pattern of `lib/suppliers/create-csv-supplier.ts` for simple
   single-CSV suppliers or an existing multi-file plugin (e.g.
   `lib/suppliers/wyncken/index.ts`) for PDF/multi-file cases. Commit + push.
5. **Add a test.** Add a Vitest test using the sample files as fixtures,
   following the style of `lib/suppliers/tinycottons/index.test.ts`. Commit + push.
6. **Refine detection.** Improve the detection rule for `<id>` in
   `pages/api/detect-supplier.ts` based on the real CSV headers/content
   instead of the filename-only stub. Commit + push.
7. **Images (if applicable).** If `lib/suppliers/<id>/samples/image-filenames.txt`
   exists, analyze those filenames together with the sample product
   references and implement a working `imageUpload.extractReference`
   (patterns: `lib/suppliers/tangerine/index.ts`,
   `lib/suppliers/jellymallow/index.ts`). Return `null` when no clear pattern
   is recognizable. Commit + push.
8. **Verify.** Run `npm run typecheck` and `npm run test:run`, fix any
   failures. Do NOT run `npm run build` — Vercel already builds a preview for
   the PR, that's the final check. Commit + push the end result.

## Restrictions

- Don't touch other suppliers' files.
- Don't open a new PR and don't merge — commit and push straight to the
  existing branch.
- Don't add PR review comments unless the user asks for that.
- After finishing, tell the user the PR is ready for their review; don't merge it yourself.

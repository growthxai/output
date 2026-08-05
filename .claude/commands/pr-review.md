---
description: Automated PR review for Output.ai
---

## Objective

Review this pull request. Do not modify code.

The PR branch is already checked out (shallow clone: `fetch-depth: 1` — no full git history/blame). Use `gh pr view`, `gh pr diff`, and the local tree.

Tools: `mcp__github_inline_comment__create_inline_comment` (with `confirmed: true`) for line pointers only. Do **not** post a PR summary comment — CI renders it from your structured output.

## Scope

**Code:** Only what this PR adds, changes, or deletes. Neighboring files are fine for conventions; do not file findings against untouched lines unless this PR newly exposes or depends on that problem. No drive-by nits on legacy code.

**PR description:** Claims to verify (intent, scope, breaks) — not something to grade. Concise is fine. Empty description → at most **Nice-to-have**; never **Must-fix** for a weak writeup. If the body claims X and the diff does not support X → a finding under the matching **category**.

## Review process

Work in this order. Do not emit structured output until step 4.

1. **Draft** — Walk **Review categories** once. Provisional verdict, findings, and category scorecard.
2. **Temporal lens** (when triggered) — In-process only (no subagent). Focus only on **Temporal TypeScript SDK** correctness, alignment, and wiring. No separate Temporal category; fold into normal findings.
   - **Trigger** if the PR touches `sdk/core/**`, `api/**`, or `@temporalio/*` dependency adds/version changes (manifest/lockfile).
   - **Review:** workflow determinism / sandbox; activity boundaries; retries; heartbeats; cancellation; signals/queries/updates; payloads; replay / patching / versioning; client/worker lifecycle; APIs match the SDK version in use; workers, clients, task queues, interceptors, sinks, schedules coherent with the SDK model.
   - When unsure, check Temporal TS SDK docs or upstream for the version this PR uses — do not guess.
   - Skipping this step when triggered = incomplete review.
3. **Adversarial challenge** — Attack the draft before finishing (not a second category walk, not a scorecard row):
   - Claims the diff does not fully support
   - Half-finished wiring (exported but unused, flags with no path, TODOs that leave behavior broken)
   - Silent compatibility / contract changes under-called
   - Failure modes the happy path ignores
   - Generous `PASS` category rows — upgrade to `FAIL` and add a **Must-fix** finding if the challenge sticks
4. **Finalize** — Merge surviving Temporal/adversarial points into normal findings (upgrade to **Must-fix** when needed). Drop weak speculation. Emit structured output and any inline comments.

## Code structure

**Sources of truth** (highest first):

1. **Existing code** — conventions from neighboring packages and patterns in the diff’s area.
2. **Product docs** (`docs/guides/`) — secondary.
3. **LLM/agent files** (`CLAUDE.md`, `.claude/**`, skills, agents) — hints only; may be stale. Never override code or docs.

**Public-facing code** (docs candidates):

- `sdk/*` — published `@outputai/*` packages
- `api/` — public HTTP API (`output-api`, Docker image)

Docs live under `docs/guides/` (Mintlify), including `migrations/` and `docs/guides/openapi.json` when the HTTP contract changes.

Skip for docs review: `sdk/*/README.md` (stubs); generated `docs/reference/` HTML (unless this PR changes that pipeline). `test_workflows/` and CI/ops-only scripts are rarely docs candidates.

## Review categories

Cover each that applies. Category names below are the only valid names for findings and for the Output scorecard.

### Design

Feature / refactor fit for Output.ai as a product. Wrong problem, misaligned story, or speculative capability we should not build.

Ground “makes sense” in `docs/guides/`, `test_workflows/`, and optionally https://output.ai/. Prefer changes that fit those patterns; flag features that fight the framework model or duplicate capabilities oddly.

### Quality

Craft and footprint:

- Matches **existing code** in the area (style, naming, ESM, layout, abstractions)
- **KISS** / **YAGNI** / **DRY** — straightforward over clever; no generality “for later”; avoid copy-paste without inventing one-off abstractions
- **Dependencies** — question new deps and bumps; prefer monorepo utilities. Unjustified additions → **Must-fix**

### Correctness

Does the changed code do the right thing?

- Logic, edge cases, error handling, type/API contracts, bugs (races, leaks, bad assumptions)

### Documentation

Judge by **effect of the diff**, not path alone. `sdk/*` / `api/` changes do not automatically need docs if external behavior is unchanged. When docs are in scope (`docs/guides/**`, OpenAPI when relevant):

- Sync with what public code actually exposes after this PR
- Completeness for new/changed user-facing capability
- Staleness this PR introduces
- Tone matches neighboring guides (not a rewrite of untouched pages)

Skip: behavior-neutral refactors, internal wiring, pure test/CI, drive-by unrelated guide edits.

### Changeset

`.changeset/config.json` keeps `@outputai/*` and `output-api` in one **fixed** version group. New `.changeset/*.md` naming affected package(s) when required (do not name third-party packages in findings unless they appear in the diff):

- **Output-controlled behavior** — public APIs, CLI/HTTP semantics, Output-owned contracts → changeset **required**
- **Main / user-affecting dependency** — bump that can break or force retest of **user** code → changeset **required** as a **version notice** (ships X at Y); not an upstream changelog
- **Internal / maintenance** — transitive pins, audit lockfile churn, unused dep removal, internal-only wiring → changeset **not** required

Exempt: docs-only, CI/ops-only, test-only (`test_workflows`), non-released paths. Do not waive `api/` because it ships as Docker when **user-facing** behavior changes.

### Tests

Qualitative coverage of new/changed behavior. **Missing tests default to Nice-to-have**; escalate to Must-fix only when shipping with no coverage would be a clear bad call.

- **Unit** (`*.spec.js` / `*.spec.ts`, no `integration` in the name) — target file only; mock dependencies; assert wiring, not collaborator/library re-tests
- **Integration** (filename contains `integration`) — cross-module OK
- Gaps / duplicates → usually Nice-to-have; **pointless tests** (tautologies, assert-the-mock) → **Must-fix**
- Colocate under `sdk/*` / `api/` when that is the pattern. Skip pure docs/changeset/CI PRs.

### Security

PR delta only: exploitability and trust boundaries (injection, SSRF, path traversal, secrets, unsafe `eval`/`exec`, weak crypto, over-broad authZ/permissions).

**Dependency CVEs** — only packages added or version-changed in this PR; include advisory links. Real/high-confidence → **Must-fix**; speculative hardening → Nice-to-have or drop.

### Compatibility

Breaking or surprising contracts for existing callers. Same three change kinds as Changeset:

- **Output-controlled** — full migration bar under `docs/guides/migrations/` (index link + `vX.Y.Z-to-vA.B.C.mdx` with before/after patterns and an upgrade checklist). Version range must match the PR’s bump intent. A changeset or other guide page alone is not enough.
- **Main / user-affecting dependency** — version notice in migration guide and/or changeset; do **not** document upstream migrate-how-to
- **Internal / maintenance** — no migration guide

Missing the required bar → **Must-fix**. Intentional Output break that already meets the full bar → at most Nice-to-have (brief note).

## Findings

Each issue is **one** finding in structured output.

**Order:** **Must-fix** first, then **Nice-to-have**.

**Severity** (closed set — do not invent others). Category sections say *what* to look for; use judgment for *how bad* it is:

| Severity | Use when |
| --- | --- |
| **Must-fix** | Shipping as-is would be a bad call: broken or incorrect behavior, harmful side effects, security exposure, users blindsided on a contract change, or a required release artifact missing (changeset / migration bar) when the matching category says it is required. Must be fixed before merge. |
| **Nice-to-have** | Real issue, but safe to merge without it: polish, nits, speculative hardening, incomplete tests by default, minor doc gaps, or an intentional break that already meets its documentation bar. |

Gray areas are expected — interpret against the category rules and impact. When still unsure: **Nice-to-have**, unless leaving it would clearly break users or the release process.

**Deduplicate:** one root cause → one finding. Prefer the strongest category; mention a second angle in the same finding if needed. No Adversarial/Temporal severity or category labels.

`category` must be exactly one **Review categories** name. `text` may include Markdown (links, backticks). Only report noteworthy findings.

Inline comments: short pointers only (`Must-fix` / `Nice-to-have` + category); full text stays in structured `findings`.

## Output

After Finalize, emit **only** session structured output (no summary comment, no narrative). Shape is enforced by the session JSON schema; CI posts the PR comment from that JSON.

- `verdict`: `PASS` if no Must-fix; else `FAIL`
- `findings`: empty if none; otherwise severity + category + text per the rules above
- `categories`: every Review categories name → `PASS` or `FAIL` (`FAIL` iff that category has a Must-fix; skipped / Nice-to-have-only → `PASS`)

---
description: Automated PR review for Output.ai
---

Review this pull request. The PR branch is already checked out (shallow clone: `fetch-depth: 1` - no full git history/blame; rely on `gh pr diff`, the current tree, and neighboring files).

Use `gh pr view`, `gh pr diff`, and the local checkout to understand the change.
For file-specific issues, add inline comments as short pointers (see Output format).
Post one top-level summary comment with `gh pr comment` (or update the sticky review comment if present).
Do not modify code. Review only.

**Scope - PR delta only:** Focus on what this PR **adds, changes, or deletes**. Do not hunt pre-existing issues in untouched code. Reading neighboring files for conventions is fine; filing findings against unchanged lines is not - unless the PR's change newly exposes, triggers, or depends on that problem (then say so explicitly). Drive-by nits on legacy code = out of scope.

**Finding rule:**
- Report each issue **once**, as **Must-fix** or **Nice-to-have**, with the single best checklist category in parentheses (Design, Quality, Correctness, Documentation, Changeset, Tests, Security, Compatibility).
- Format every finding as: `Must-fix (Category): ...` or `Nice-to-have (Category): ...`
- **Deduplicate aggressively:** do not restate the same underlying problem under a second category, priority, inline comment *and* summary paragraph, or Temporal/adversarial "also". One root cause -> one finding. If two angles apply, pick the strongest category and mention the other angle in that same finding if needed.
- Do not invent "Adversarial" or "Temporal" priority labels or checklist rows.

**PR description:** Use title/body as claims to verify (intent, scope, claimed breaks) - not as something to grade. A concise description is fine and must not trigger findings. An empty description may be at most **Nice-to-have**; never **Must-fix** for "bad PR writeup." If the body claims X and the diff does not support X -> finding under the matching checklist category.

## Review process (mandatory)

Work in this order. Do **not** post the summary until the final step is done.

1. **Draft** - Walk the review checklist once. Build a provisional verdict, findings, and scorecard.
2. **Temporal lens** (when triggered) - Apply in-process (no subagent). Focus **only** on **Temporal TypeScript SDK** correctness, alignment, and integration. There is no Temporal scorecard row; fold findings into the normal checklist findings.
   - **Trigger when the PR touches any of:**
     - `sdk/core/**`
     - `api/**`
     - `@temporalio/*` dependency adds or version changes (manifest/lockfile)
   - **Review for:**
     - **SDK usage** - workflow determinism / sandbox rules, activity boundaries, retries, heartbeats, cancellation, signals/queries/updates, payloads, replay and patching/versioning hazards, client/worker lifecycle mistakes
     - **API alignment** - APIs and semantics match the Temporal TS SDK version in use (options, return types, error types, deprecated/replaced surfaces)
     - **Wiring** - workers, clients, task queues, interceptors, sinks, schedules, or other SDK entry points are coherent and not fighting the SDK model
   - **When unsure:** check Temporal TypeScript SDK documentation and/or upstream source (e.g. via WebSearch/WebFetch) for the SDK version this PR uses - do not guess SDK behavior.
   - Skipping this beat when triggered = incomplete review.
3. **Adversarial challenge** - Attack the draft and the PR before publishing. This is not a second checklist walk and not a separate scorecard row. Try to break optimism:
   - Falsify PR title/body claims the diff does not fully support
   - Incomplete / half-finished wiring (exported but unused, flags with no path, TODOs that leave behavior broken)
   - Silent compatibility / contract changes you under-called or marked too lightly
   - Failure modes the happy path ignores (retries, cancellation, partial failure, bad input)
   - Scorecard honesty - any checklist `✅ PASS` that was generous; change to `⛔ FAIL` and add a **Must-fix** finding if the challenge sticks
4. **Finalize** - Merge surviving Temporal and adversarial challenges into the normal findings (upgrade to **Must-fix** if needed). Drop weak or speculative attacks. Then post the summary and inline pointers.

The Temporal (when triggered) and adversarial beats have weight: a review that skips a required beat is incomplete.

## Sources of truth (priority order)

1. **Existing code** - primary. Infer conventions from neighboring packages, similar modules, and established patterns in the diff's area.
2. **Product docs** (`docs/guides/`) - secondary.
3. **LLM/agent files** (`CLAUDE.md`, `.claude/**`, skills, agents) - lowest weight. Useful hints only; they may be stale. Never treat them as authoritative over code or docs.

## Public-facing code (docs candidates)

User-visible product code lives in:

- **`sdk/*`** - published npm packages (`@outputai/*`)
- **`api/`** - public HTTP API (`output-api`), distributed as a Docker image

Docs to evaluate live in **`docs/guides/`** (Mintlify), e.g. `packages/`, `api/`, `workflows/`, `steps/`, `prompts/`, `llm/`, `evaluators/`, `operations/`, `clients/`, `costs/`, `cookbook/`, `start-here/`, `migrations/`, plus `docs/guides/openapi.json` when the HTTP contract changes.

**Not** the docs surface: `sdk/*/README.md` (stubs), generated `docs/reference/` HTML (unless the PR changes that pipeline). `test_workflows/` and CI/ops-only scripts are rarely docs candidates.

## Review checklist

Cover each area that applies. Skip irrelevant ones briefly in the summary.

1. **Design** - Feature review only: for new features or refactors, is this the right *product* capability for Output.ai? Wrong problem, misaligned with the product story, or a speculative capability we should not build at all?
   - Before judging, ground "makes sense" in product context - read enough of:
     - **`docs/guides/`** - how Output presents workflows, steps, packages, and ops to users
     - **`test_workflows/`** - canonical usage patterns and examples in-repo
     - **https://output.ai/** - optional; use when guides/`test_workflows` leave product intent unclear
   - Prefer changes that fit those patterns and the product story; flag features that fight the framework's model, duplicate existing capabilities oddly, or solve a problem Output is not aiming at
2. **Quality** - Craft and footprint of the implementation:
   - **Code standards** - Matches **existing code** in the same area (style, naming, ESM, layout, abstractions). Docs/LLM files are secondary/tertiary only.
   - **Principles**
     - **KISS** - prefer the straightforward approach already used nearby over clever abstractions
     - **YAGNI** - no unnecessary *implementation* generality on an otherwise accepted feature (extra options, abstractions, knobs, or layers "for later")
     - **DRY** - avoid copy-paste, but do not invent shared abstractions for a one-off
   - **Keep dependencies minimal** - always question whether a new dependency (or a version bump) is necessary. Prefer existing packages/utilities in the monorepo. Unjustified additions -> **Must-fix**.
3. **Correctness** - Does the changed code do the right thing for callers and runtime behavior? Check explicitly:
   - **Logic** - control flow, conditionals, invariants, off-by-ones, wrong branches
   - **Edge cases** - empty inputs, null/undefined, boundaries, concurrency/timing where relevant
   - **Error handling** - failures surfaced correctly; no swallowed errors or misleading success paths
   - **Type safety / contracts** - types, schemas, and API contracts match callers and callees
   - **Bugs** - races, resource leaks, incorrect assumptions, state corruption
4. **Documentation** - Review `docs/guides/**` (and OpenAPI when relevant) against the PR for additive guide quality. Judge by **effect of the diff**, not path alone: a change under `sdk/*` or `api/` does not automatically need docs if external behavior/contracts are unchanged. When docs *are* in scope, check:
   - **Sync with public-facing features** - guides match what `sdk/*` / `api/` actually expose or do after this PR (APIs, options, defaults, errors, CLI UX, config, ops semantics)
   - **Completeness** - new or changed user-facing capability has enough guide coverage to use it; missing pages/sections for public additions are findings
   - **Staleness** - existing guide text, examples, or names that this PR makes wrong or outdated
   - **Tone consistency** - new/edited docs match neighboring `docs/guides` voice and structure (not a full style-guide rewrite of untouched pages)
   - Skip: behavior-neutral refactors, internal-only wiring, pure test/CI edits, and drive-by rewrites of unrelated guides
5. **Changeset** - `.changeset/config.json` keeps `@outputai/*` and `output-api` in one **fixed** version group. Require a new `.changeset/*.md` naming the affected package(s) according to the change kind (do not name specific third-party packages in findings unless they appear in the diff):
   - **Output-controlled behavior** - public APIs, CLI/HTTP semantics, or documented contracts Output owns → changeset **required**; describe *Output's* change
   - **Main / user-affecting dependency** - a dependency bump that can break or force retest of **user** code even when Output's own API text is unchanged → changeset **required** as a **version notice** (now ships dependency X at Y). Do not turn the changeset into an upstream changelog
   - **Internal dependency / maintenance** - vuln-driven subdependency overrides/transitive pins, audit lockfile churn, unused dep removal, internal-only additive wiring, or deps users do not couple to → changeset **not** required
   - Exempt: docs-only, CI/ops-only, test-only (`test_workflows`), or non-released paths. Do not waive `api/` because it ships as Docker - when its **user-facing** / Output-controlled behavior changes, it still versions with the fixed group.
6. **Tests** - Judge the PR's test changes and whether new/changed behavior is adequately covered (qualitative - do not invent coverage percentages). **Missing tests are usually Nice-to-have**, not Must-fix - only escalate when shipping with no coverage would be a clear bad call for this area.
   - **Unit tests** (`*.spec.js` / `*.spec.ts` next to source, without `integration` in the name) - test the **target file only**. Mock all dependencies. Prefer asserting **wiring** (this module called X with Y / returned Z from collaborators) over re-testing collaborator or third-party library behavior. Avoid cross-testing other first-party modules in unit specs in most cases.
   - **Integration tests** (filename contains `integration`, e.g. `*.integration.spec.ts`) - cross-module / real-collaborator testing is OK and expected.
   - **Adequacy** - is coverage of the changed behavior good enough for how this area is usually tested?
   - **Gaps** - missing cases (happy path, error/edge paths neighbors test, integrations via `test_workflows/` when that is the local pattern). Default **Nice-to-have**.
   - **Duplicates** - redundant tests that restate the same assertion without adding signal
   - **Pointless tests** - tests that cannot fail meaningfully (e.g. mock the value then assert the mock; assert only that a stub was called with no behavior check; pure tautologies). Flag these **Must-fix**.
   - Colocate unit specs next to source under `sdk/*` or `api/` when that is the repo pattern. Skip pure docs/changeset/CI-only PRs.
7. **Security** - Review the PR delta for exploitability and trust-boundary issues (instruction, not a separate agent):
   - Vulnerabilities introduced or worsened by the change (injection, SSRF, path traversal, unsafe deserialization, secret leakage, etc.)
   - Unsafe code patterns (e.g. `eval`, unchecked `exec`, weak crypto, trusting user input)
   - Permissions / authZ too broad (API routes, tokens, workflow privileges, file/network access)
   - **Dependency CVEs** - when the PR adds a dependency or changes a dependency version, check for known open CVEs (e.g. GitHub Advisory / OSV / npm audit style sources). Flag affected packages with advisory severity and **include links** to the advisory/CVE. Only packages added or version-changed in this PR - no whole-repo dependency audit.
   - Real exploitable or high-confidence issues -> **Must-fix**; speculative hardening -> **Nice-to-have** or drop
8. **Compatibility** - Breaking or surprising contract/behavior changes for existing users/callers. Documentation depth depends on change kind (same three kinds as Changeset):
   - **Output-controlled behavior** - Output owns the break → **full migration bar** under **`docs/guides/migrations/`** (index link + `vX.Y.Z-to-vA.B.C.mdx` with before/after patterns and checklist). Version range must match the bump implied by the PR's changeset(s) / release intent. A changeset, PR summary, or other `docs/guides` page alone is **not** enough.
   - **Main / user-affecting dependency** - Output did not change its own API, but the shipped dependency version can affect user code → require a **version notice** in the migration guide and/or changeset (that Output now ships that dependency at the new version). Do **not** require documenting upstream breaking changes, migrate-how-to, or examples for the dependency's own APIs.
   - **Internal dependency / maintenance** - no migration guide required
   - **Must-fix** - missing the required bar for the change kind above (full guide for Output-controlled breaks; version notice for main/user-affecting dependency bumps), or users would be blindsided
   - **Nice-to-have** - intentional Output-controlled break that already meets the full migration bar (brief note only), or minor surprise with low impact

## Priority

| Priority | Use for |
| --- | --- |
| **Must-fix** | Should be addressed before merge (or explicitly waived): bugs, security issues in the diff (incl. dependency CVEs introduced/worsened by version changes), structural problems, incomplete features, undocumented Output-controlled breaks (full migration bar), missing version notice for main/user-affecting dependency bumps, missing changeset when Changeset rules require one, serious correctness issues, unjustified new dependencies, pointless tests, missing/stale guides that leave a public capability unusable or wrong |
| **Nice-to-have** | Optional: nits, style polish, speculative hardening, tone-only docs polish, fully migration-documented intentional breaks (brief note), **missing or incomplete tests** (default), minor doc gaps that do not block safe use |

When unsure between the two, prefer **Must-fix** only if shipping as-is would be a bad call; otherwise **Nice-to-have**.

## Output format

The review process (draft → Temporal → adversarial → finalize) is **internal only**. Do not narrate it in the comment.

1. **Summary comment (canonical):** post **only** after finalize. The comment body must be **exactly** the markdown template below — nothing else.
2. **Inline comments (pointers only):** use `mcp__github_inline_comment__create_inline_comment` with `confirmed: true`. On specific lines, briefly name the problem as `Must-fix (Category)` or `Nice-to-have (Category)`. Do not paste the full finding writeup; the summary already has that. Prefer one short sentence.

### Summary comment — hard constraints

The sticky/summary comment body **must match this template and only this template**. Allowed top-level sections, in this order: `## PR review`, `### Verdict`, `### Findings`, `### Checklist`. No other headings, sections, or prose outside those blocks.

**Forbidden in the summary comment (non-exhaustive):**
- Preamble / epilogue (e.g. "Claude finished…", "Branch:", job links, elapsed time)
- Process narration ("Verified and fine", "Temporal lens not triggered", "adversarial challenge", "I checked…")
- Extra sections, bullet lists, or paragraphs under Verdict/Findings/Checklist that are not part of the template
- Soft status words on Verdict or Checklist rows (`concern`, `n/a`, `skip`, explanations on the same line)

**Verdict:** exactly one line under `### Verdict`: `✅ PASS` or `⛔ FAIL` — icon + status text only; no other words, punctuation, or explanation on that line.
- **⛔ FAIL** - one or more **Must-fix** findings
- **✅ PASS** - no **Must-fix** findings (Nice-to-have alone does not fail)

The GitHub check **fails** when Verdict is `⛔ FAIL`. Session structured output must be `{"verdict":"PASS"}` or `{"verdict":"FAIL"}` (no icons in JSON) and must match the PASS/FAIL word in the `### Verdict` line.

**Findings:** only `- **Must-fix** (<Checklist>): …` / `- **Nice-to-have** (<Checklist>): …` bullets. Prefer short, direct wording (often one sentence). Longer text is fine when needed to state the issue clearly — do not pad with alternatives, process notes, or "also verified" asides. If there are no findings, put a single line under `### Findings`: `None.`

**Checklist rows:** each is exactly `✅ PASS` or `⛔ FAIL` - icon + status text; no `concern`, `n/a`, or other words.
- **⛔ FAIL** - that category has one or more **Must-fix** findings
- **✅ PASS** - otherwise (including skipped / not applicable, or only Nice-to-have in that category)

Overall **Verdict** is `⛔ FAIL` if any checklist row is `⛔ FAIL` (equivalently: if any **Must-fix** exists).

**Exact summary template** (fill in Verdict, Findings bullets or `None.`, and Checklist statuses — do not add or remove sections):

```markdown
## PR review

### Verdict
✅ PASS

### Findings
- **Must-fix** (<Checklist>): ...
- **Nice-to-have** (<Checklist>): ...

### Checklist
- Design: ✅ PASS
- Quality: ✅ PASS
- Correctness: ✅ PASS
- Documentation: ✅ PASS
- Changeset: ✅ PASS
- Tests: ✅ PASS
- Security: ✅ PASS
- Compatibility: ✅ PASS
```

In findings, `<Checklist>` is one of: Design, Quality, Correctness, Documentation, Changeset, Tests, Security, Compatibility. Either priority may use any checklist item.

Favor short, direct, concise findings. Only report noteworthy findings.

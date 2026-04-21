---
name: output-migrate
description: Upgrade a project between versions of the Output framework. Use when the user asks to upgrade, migrate, or move to a newer Output version. Detects the current @outputai/* version in the project, fetches the matching migration guide from docs.output.ai, applies the changes, and verifies the project still type-checks.
allowed-tools: [Bash, Read, Write, Edit, MultiEdit, Grep, WebFetch, TodoWrite]
---

# Migrate an Output Project

## Overview

This skill migrates a project from one version of the Output framework to another.

You do not carry migration instructions in your own context. The docs site at `https://docs.output.ai/migrations` is the source of truth — fetch the right page and follow it.

Use the todo tool to track your progress.

## When to Use This Skill

- The user wants to upgrade `@outputai/*` packages to a newer version
- The user mentions "migrate", "upgrade", or "move to vX.Y.Z"
- A breaking-change release shipped and the user is still on an older version

## URL contract

Migration guides are hand-authored MDX pages linked from a single index:

- Index: `https://docs.output.ai/migrations`
- Per-boundary guide: `https://docs.output.ai/migrations/v{FROM_FULL}-to-v{TO_FULL}` (e.g. `v0.1.12-to-v0.2.0`)

The index lists every available guide with a title and a short description. A release only has a guide if it introduced breaking changes — most releases will not have one.

If the user is jumping multiple boundaries, fetch each applicable guide in order and apply them sequentially.

## Instructions

<process_flow>

<step number="0" name="arguments_analysis">

### Step 0: Arguments Analysis

If the user passed arguments when invoking this skill, parse them as positional values in this order (all optional):
  - `from-version`: The version the project is currently on. If blank, detect it in Step 2.
  - `to-version`: The target version. If blank, resolve it in Step 1.
  - `additional-instructions`: Free-form guidance from the user (e.g. "skip the http changes, we don't use that package").

</step>

<step number="1" name="detect_to_version">

### Step 1: Determine the target (TO) version

If the user provided a `to-version` argument, use it.

Otherwise, run `npm view @outputai/core version` via Bash and use that as the target.

</step>

<step number="2" name="detect_from_version">

### Step 2: Detect the current (FROM) version

If the user provided a `from-version` argument, use it and skip the rest of this step.

Otherwise, read `package.json` at the project root and resolve the current framework version from the first entry that exists, in this order:
  1. `dependencies["@outputai/core"]`
  2. `devDependencies["@outputai/core"]`
  3. `dependencies["@outputai/cli"]`

Strip any leading `^` or `~`. If no `@outputai/*` package is present, stop and tell the user: "This project doesn't depend on any @outputai/* packages — nothing to migrate."

**If the version read from `package.json` equals the TO version**, the user may have already edited `package.json` to the new version without running the migration yet. Don't give up — find the pre-bump version by looking in this order:

  1. Run `git diff package.json pnpm-lock.yaml package-lock.json yarn.lock 2>/dev/null` and scan the diff for an `@outputai/*` version that was removed (lines starting with `-`). If you find one, that's the FROM version.
  2. Run `git log -p -n 20 -- package.json` and find the most recent commit that changed an `@outputai/*` version. The old value on that commit's parent side is the FROM version.
  3. If neither locates a prior version, tell the user: "Cannot detect the FROM version — both `package.json` and git history show `vX.Y.Z`. Re-run with `--from <version>` to specify it explicitly."

If FROM and TO still resolve to the same version after this recovery, stop and tell the user: "Already on `vX.Y.Z` — nothing to migrate."

</step>

<step number="3" name="fetch_migration_guide">

### Step 3: Fetch migration guides

WebFetch `https://docs.output.ai/migrations`. This is the index page — it links to every hand-authored migration guide with a title keyed on the version boundary.

From the index, identify every guide whose `v{FROM}-to-v{TO}` range falls between the user's FROM and TO versions. Examples:
  - User FROM `0.1.12`, TO `0.2.0` → if a `v0.1.12-to-v0.2.0` guide is listed, fetch it.
  - User FROM `0.1.12`, TO `0.3.0` → fetch `v0.1.12-to-v0.2.0` first, then (if listed) `v0.2.0-to-v0.3.0`.
  - Multiple patch-level guides between the same minor boundaries should all be applied in chronological order.

Fetch each applicable guide by hitting `https://docs.output.ai/migrations/v{FROM_FULL}-to-v{TO_FULL}`.

If the index lists no guides covering the FROM → TO range, stop and tell the user: "No migration guides found for `vFROM` → `vTO`. The releases in this range were additive; just bump your dependencies."

Also WebFetch `https://docs.output.ai/changelog` to cross-reference what shipped in the range — use it to fill in gaps the migration guides may not cover.

</step>

<step number="4" name="plan_changes">

### Step 4: Plan the changes

From the fetched guide(s), produce a TodoWrite list of concrete changes, one todo per change. Do not start editing yet.

For each todo, capture:
  - Which file(s) are affected (use Grep to find call sites for deprecated APIs the guide mentions).
  - What the change is (diff-shaped if possible).
  - Which guide section it came from.

If the user passed `additional-instructions`, honor them: skip todos they asked to skip, add todos they asked to add.

Print the plan and ask the user to confirm before proceeding. If they reject, stop.

</step>

<step number="5" name="apply_changes">

### Step 5: Apply the changes

Work through each todo. For every todo:
  1. Mark it `in_progress` before starting.
  2. Apply the change with Edit/MultiEdit.
  3. Mark it `completed` when done.

Do not batch completions — update TodoWrite after each one.

</step>

<step number="6" name="bump_dependencies">

### Step 6: Bump dependencies

Update every `@outputai/*` package and (if present) `output-api` entry in `package.json` to the TO version. The framework uses a fixed version group, so all packages move together.

Then run `pnpm install` (or `npm install` / `yarn install` — detect from the lockfile).

</step>

<step number="7" name="verify">

### Step 7: Verify

Run the project's type checker if one is configured (check `package.json` scripts for `typecheck`, `tsc`, or `build`).

If type checking fails, surface each error with the migration guide section that maps to it. Do not attempt silent fixes — report what broke.

If the project has no type check script, note that and recommend the user run their test suite.

</step>

<step number="8" name="summary">

### Step 8: Summary

Report:
  - FROM → TO version
  - Which migration guide URL(s) were used
  - List of files modified
  - Type-check result
  - Anything the user should verify manually (things the guide flagged as needing judgment)

Do not suggest additional commands or next steps — the CLI handles post-migration messaging.

</step>

</process_flow>

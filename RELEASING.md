# Releasing

This document covers how Output packages are versioned, built, and published to npm.

## Packages

This monorepo publishes the following packages to npm:

| Package | Path | Description |
|---------|------|-------------|
| `@outputai/cli` | `sdk/cli` | CLI for project scaffolding and workflow management |
| `@outputai/core` | `sdk/core` | Core framework (workflows, steps, parallel execution) |
| `@outputai/llm` | `sdk/llm` | LLM integration (generateText, prompt loading) |
| `@outputai/http` | `sdk/http` | HTTP client with tracing |
| `@outputai/evals` | `sdk/evals` | Evaluation framework (LLM-as-judge) |
| `@outputai/credentials` | `sdk/credentials` | Encrypted credential management |
| `@outputai/output` | `sdk/framework` | Umbrella package (re-exports all SDK packages) |
| `output-api` | `api` | API server (private, Docker image only) |

All `@outputai/*` packages and `output-api` are in a **fixed version group** — they always share the same version number and are bumped together. This is configured in `.changeset/config.json`.

## How It Works (The Big Picture)

There are three ways packages get published, each tied to a **dist tag** on npm:

```
                          ┌──────────────────────────────┐
  You merge a PR          │  push to main triggers two   │
  ─────────────────────►  │  workflows in parallel:       │
                          │                              │
                          │  1. release.yml              │
                          │     → opens "Version         │
                          │       Packages" PR           │
                          │       (if changesets exist)   │
                          │                              │
                          │  2. publish_npm_next.yml     │
                          │     → publishes @next        │
                          │       immediately             │
                          └──────────────────────────────┘

  You merge the                publish.yml
  "Version Packages" PR  ───►  → publishes @latest
                               → creates git tags

  You click "Run workflow"     publish_npm_dev.yml
  in GitHub Actions       ───► → publishes @dev
  (any branch/SHA)
```

| Tag | Version example | Install | When it publishes |
|-----|-----------------|---------|-------------------|
| `latest` | `0.1.4` | `npx @outputai/cli` | When you merge the "Version Packages" PR |
| `next` | `0.1.4-next.abc1234` | `npx @outputai/cli@next` | Automatically on every push to main |
| `dev` | `0.1.4-dev.0` | `npx @outputai/cli@dev` | Manually from GitHub Actions (any branch) |

All dist tags apply to every published package, not just the CLI.

## What Are Changesets?

[Changesets](https://github.com/changesets/changesets) is a tool that manages version bumps and changelogs for monorepos. Instead of manually editing `package.json` versions, you describe what changed and let the tooling handle the rest.

A changeset is a small markdown file that lives in `.changeset/` and describes:
1. **Which packages** are affected
2. **What kind of bump** (patch, minor, major)
3. **A description** of the change

Here's a real example from this repo (`.changeset/fix-publish-add-next.md`):

```markdown
---
"@outputai/cli": patch
---

Fix prod publish to include build step before publishing to npm.
```

The frontmatter (`---` block) says "bump `@outputai/cli` by a patch version." Since all our packages are in a fixed group, this actually bumps **all** of them together.

### Do I need to add a changeset?

| Change type | Changeset needed? |
|-------------|:-:|
| New feature, bug fix, breaking change | Yes |
| Dependency update that affects behavior | Yes |
| CI/CD changes, docs-only, internal refactors | No |
| Claude plugin updates | No |

If unsure, ask: "Would a user installing our packages notice this change?" If yes, add a changeset.

## Stable Releases (`@latest`) — Step by Step

This is the full lifecycle of a stable release:

### Step 1: Add a changeset to your PR

While working on your feature branch, run:

```bash
pnpm changeset
```

The CLI will ask you:
1. Which packages changed? (select with space, confirm with enter)
2. Is it a major, minor, or patch bump?
3. Write a summary of the change

This creates a file like `.changeset/cool-dogs-jump.md` (random name). Commit it with your PR.

> You can also create the file by hand — it's just markdown with YAML frontmatter.

### Step 2: Merge your PR to main

Nothing special here. Just merge as usual. Two things happen automatically:

1. **`@next` publishes immediately** — your change is available via `@outputai/cli@next` within minutes.

2. **The Release workflow** (`release.yml`) picks up any `.changeset/*.md` files and opens (or updates) a PR titled **"Version Packages"**. This PR:
   - Deletes the changeset files
   - Bumps `version` in every `package.json`
   - Updates `CHANGELOG.md` in each package
   - Syncs the CLI's embedded SDK version

   You don't need to merge this immediately. Multiple PRs with changesets can accumulate — the "Version Packages" PR will keep updating itself.

### Step 3: Merge the "Version Packages" PR

When you're ready to cut a stable release, merge the "Version Packages" PR. The **Publish workflow** (`publish.yml`) runs and:

1. Installs dependencies (`pnpm install --frozen-lockfile`)
2. Builds all packages (`pnpm -r run build`)
3. Publishes to npm under `@latest` (`pnpm publish -r --no-git-checks`)
4. Publishes the API Docker image
5. Creates git tags (e.g., `v0.1.4`)

That's it. Users running `npx @outputai/cli` will now get the new version.

## Next Releases (`@next`)

Every push to `main` triggers `publish_npm_next.yml`. This happens automatically — no changeset needed.

What it does:
1. Runs the full validation suite (install, lint, build, test)
2. Bumps all packages to a prerelease version tied to the commit SHA (e.g., `0.1.4-next.abc1234`)
3. Publishes under the `next` dist-tag

This means every merged PR is immediately available:

```bash
npx @outputai/cli@next init my-project
```

Useful for:
- Testing changes before a stable release
- CI/CD pipelines that want to track main
- Early adopters who want the latest

## Dev Releases (`@dev`)

`publish_npm_dev.yml` is triggered manually from GitHub Actions. You can publish from **any branch or SHA**.

1. Go to **Actions > "Publish Dev" > "Run workflow"**
2. Optionally enter a branch name or commit SHA (defaults to `main`)
3. Packages are published with a `-dev.N` prerelease suffix under the `dev` dist-tag

```bash
npx @outputai/cli@dev init my-project
```

Useful for:
- Testing a feature branch before merging
- Sharing a WIP build with someone for review

## Build Pipeline

All publish paths run `pnpm -r run build` before publishing. This compiles TypeScript to `dist/` in each package. Without the build step, published packages will be missing compiled code.

The build order is managed by pnpm workspace dependencies — packages are built in dependency order automatically.

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `ops/publish.sh` | Orchestrates prod publish (npm + Docker) |
| `ops/publish_npm_prod.sh` | Builds and publishes all packages to `@latest` |
| `ops/publish_npm_next.sh` | Bumps to `next.{SHA}` prerelease, publishes to `@next` |
| `ops/publish_npm_dev.sh` | Bumps to `dev.N` prerelease, publishes to `@dev` |
| `ops/bump.sh` | Runs `changeset version` and syncs CLI SDK version |
| `ops/tag.sh` | Creates git tags after publish |
| `ops/validate.sh` | Full validation: install, lint, build, test, docs |

## Troubleshooting

### Published package is missing `dist/`

The build step was skipped before publish. Re-publish:

```bash
pnpm -r run build
pnpm publish -r --no-git-checks
```

### `npx @outputai/cli` uses a cached broken version

Clear the npx cache and retry:

```bash
npx --yes @outputai/cli@latest init my-project
```

### Changeset version PR not appearing

Make sure your changeset files are committed to main. The Release workflow only runs on push to main.

### I merged my PR but `@latest` didn't update

That's expected. Merging your PR only publishes to `@next`. The `@latest` tag only updates when you merge the "Version Packages" PR. If no "Version Packages" PR exists, your PR probably didn't include a changeset.

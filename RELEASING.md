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

All `@outputai/*` packages are in a **fixed version group** — they always share the same version number and are bumped together. This is configured in `.changeset/config.json`.

## Dist Tags

| Tag | Install | Trigger | Source |
|-----|---------|---------|--------|
| `latest` | `npx @outputai/cli` | Merge of a "Version Packages" PR | Changesets on main |
| `next` | `npx @outputai/cli@next` | Automatic on every push to main | HEAD of main |
| `dev` | `npx @outputai/cli@dev` | Manual (GitHub Actions button) | Any branch or SHA |

All dist tags apply to every published package, not just the CLI.

## Stable Releases (`@latest`)

Stable releases use [Changesets](https://github.com/changesets/changesets).

### 1. Add a changeset

When your PR includes a user-facing change, run:

```bash
pnpm changeset
```

This creates a markdown file in `.changeset/` describing the change and the semver bump type (patch, minor, major). Commit it with your PR.

### 2. Merge to main

When your PR merges, the **Release** workflow (`release.yml`) runs. If there are pending changesets, it opens (or updates) a "Version Packages" PR that bumps versions and updates changelogs.

### 3. Merge the "Version Packages" PR

When the version PR merges, the **Publish** workflow (`publish.yml`) runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm -r run build` (compiles TypeScript to `dist/`)
3. `pnpm publish -r --no-git-checks` (publishes to npm under `@latest`)
4. Git tags are created for each published version

### When to add a changeset

- **Yes**: New features, bug fixes, breaking changes, dependency updates that affect behavior
- **No**: CI changes, docs-only changes, internal refactors with no public API change

## Next Releases (`@next`)

Every push to `main` triggers the **Publish Next** workflow (`publish_npm_next.yml`). This:

1. Runs the full validation suite (install, lint, build, test)
2. Bumps all packages to a prerelease version tied to the commit SHA (e.g., `0.1.4-next.abc1234`)
3. Publishes under the `next` dist-tag

Install with:

```bash
npx @outputai/cli@next init my-project
```

This is useful for:
- Testing the latest changes before a stable release
- CI/CD pipelines that want to track main
- Early adopters who want bleeding-edge features

## Dev Releases (`@dev`)

The **Publish Dev** workflow (`publish_npm_dev.yml`) is triggered manually from GitHub Actions. You can publish from any branch or SHA.

1. Go to Actions > "Publish Dev" > "Run workflow"
2. Optionally enter a branch name or commit SHA (defaults to `main`)
3. Packages are published with a `-dev.N` prerelease suffix under the `dev` dist-tag

Install with:

```bash
npx @outputai/cli@dev init my-project
```

This is useful for:
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

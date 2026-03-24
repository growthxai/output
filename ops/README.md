# `ops/` scripts

Reference for what each script is **for** and what to watch out for. Behavior and flags live in the scripts themselves—read them when you need exact steps.

## Release, versioning, and validation

| Script | Purpose | Caveats |
|--------|---------|---------|
| `publish_npm.sh` | Install dependencies, build packages, and publish the workspace to npm. Dist-tag (prerelease vs stable) is controlled by how you invoke it. | Needs registry credentials in the environment. Publishing without a successful build yields packages missing compiled output. |
| `publish_api.sh` | Build the API image and push it to the container registry, tagged from the API package version. | Needs Docker and registry credentials. Optional flags control whether semver convenience tags and `:latest` are updated—useful when you only want an exact version tag. Skips work if that version is already on the registry. |
| `bump_prerelease.sh` | Bump workspace versions along a prerelease line and keep the CLI’s embedded SDK version aligned with the workspace. | Requires a prerelease identifier argument. All versioned packages in the group should stay in sync—run in a clean tree and commit the result you intend to ship. |
| `bump_release.sh` | Apply changeset-driven version and changelog updates and align the CLI SDK version with the workspace. | Expects the changeset workflow to have produced pending changes; mutates package metadata. Review the diff before committing or merging. |
| `tag.sh` | Create a git tag for the current SDK version and push it to the remote. | No-ops if the tag already exists on the remote. Needs permission to push tags and a configured git author for the machine that runs it. |
| `validate.sh` | Full local/CI gate: dependency install, lint, tests, builds, and doc checks. | Slower than a quick lint; should match what you expect CI to enforce so failures are actionable. |

## End-to-end testing

| Script | Purpose | Caveats |
|--------|---------|---------|
| `test_e2e.sh` | Exercise the dev stack end-to-end: build artifacts, run the API and worker via Docker, wait until the system is ready, then run a deterministic workflow and assert the result. | Needs Docker and enough time for images, startup, and polling (often several minutes). Assumes a minimal test env; touches compose and temp files under the repo. |

## Formatting and repository checks

| Script | Purpose | Caveats |
|--------|---------|---------|
| `format_files.sh` | Apply auto-fix linting and EOF newline fixes; optional path arguments limit scope. | Changes files in place; run when you intend to rewrite working-tree content. |
| `ensure_eof_blank_line.sh` | Ensure tracked text files end with a newline; skips common binary extensions. | Mutates files by appending a newline when missing. If you pass paths, they are intersected with tracked files—see script for edge cases around deleted-but-listed paths. |
| `alert.sh` | Print a consistent styled banner for a warning or error title and body (stdout). | Purely presentational; callers supply the severity and copy. |
| `extra_files_warning.sh` | Detect a dirty working tree and print a **non-fatal** warning listing changed files. | Informational only—does not fail the step. Useful when generated files might have appeared after staging. |
| `extra_files_error.sh` | Fail if the working tree is not clean—typically to catch unexpected generated files after a build. | Configures a safe git directory when needed; exits unsuccessfully if there is any diff. |

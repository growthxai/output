# Contributing to Output

Thanks for your interest in contributing to Output! We welcome contributions from the community.

## Contribution Process

To keep work coordinated and avoid duplicated effort, we require all contributions to follow this process:

1. **Open an issue** describing the bug you want to fix or the feature you want to add.
2. **Wait for maintainer approval.** A maintainer will review the issue and decide whether it fits the project's direction.
3. **Get assigned to the issue.** Once approved, a maintainer will assign the issue to you.
4. **Start working.** Only begin implementation after you've been assigned — this ensures your work will be reviewed and merged.
5. **Open a pull request** referencing the issue.

> Pull requests submitted without an approved, assigned issue may be closed without review.

## Development Setup

```bash
git clone https://github.com/growthxai/output.git
cd output
pnpm install && npm run build:packages
```

Common commands:

```bash
npm run dev           # Start dev environment
npm test              # Run tests
npm run lint          # Lint code
./run.sh validate     # Validate everything
```

## Code Guidelines

- Follow existing code patterns and project structure.
- Use ES modules and TypeScript definitions alongside JavaScript implementations.
- Use `snake_case` for file and folder names.
- Wrap all external operations inside Temporal activities (steps).
- Prefer functional over object-oriented style.
- Don't opt out of lint rules without discussion.

See [CLAUDE.md](CLAUDE.md) for the full set of conventions.

## Questions

If you're unsure about anything, open an issue or start a discussion before writing code. We'd rather talk early than reject a PR late.

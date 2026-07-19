# Contributing to Sitepins

Thanks for your interest in contributing!

## Getting started

Requirements: Node.js 20+, pnpm 11+, MongoDB.

```bash
git clone git@github.com:sitepins/sitepins.git
cd sitepins
pnpm install

cp api/.env.example api/.env
cp app/.env.example app/.env
# fill in MongoDB URI, auth secrets, and a GitHub/GitLab OAuth app

pnpm dev:api   # backend on :4000
pnpm dev:app   # frontend on :3000
```

## Making changes

1. Fork the repo and create a branch from `main`.
2. Keep changes focused — one feature/fix per pull request.
3. Make sure the code typechecks, builds, and tests pass:
   ```bash
   pnpm build:api
   pnpm --filter sitepins exec next typegen
   pnpm --filter sitepins exec tsc --noEmit
   pnpm test
   ```
4. Format with Prettier (`pnpm format`).
5. Open a pull request with a clear description of the problem and solution.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) where practical:

```
feat: add GitLab branch protection support
fix: prevent duplicate project names within an org
docs: clarify self-hosting env vars
```

## Reporting bugs

Open a [GitHub issue](https://github.com/sitepins/sitepins/issues) with steps to reproduce, expected vs. actual behavior, and your environment (OS, Node version, browser). For security vulnerabilities, see [SECURITY.md](./SECURITY.md) — do not open a public issue.

## License

By contributing, you agree that your contributions will be licensed under the [Elastic License 2.0](./LICENSE).

# Contributing To MCP Bridge

Thanks for contributing.

## Before You Start

- Read the project README
- Search existing issues and pull requests first
- Open an issue before major architectural work

## Local Setup

```bash
npm install
npm run dev
```

For desktop development:

```bash
npm run electron:dev
```

## Development Expectations

- Keep pull requests focused and easy to review
- Prefer small commits with clear intent
- Update docs when behavior changes
- Add or adjust tests when practical
- Preserve the product goal: turning office HTTP workflows into safe MCP tools

## Pull Request Checklist

- The change is scoped and clearly explained
- `npm run check` passes
- User-facing changes are documented in the PR description
- Screenshots or recordings are included for UI changes
- Any security implications are called out explicitly

## Commit Style

You do not need a strict commit convention, but concise and descriptive messages help a lot.

Examples:

- `Improve desktop startup diagnostics`
- `Add light theme toggle`
- `Fix Electron dev runtime environment`

## Reporting Bugs

Please include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS, Node.js version, and app mode
- Logs, screenshots, or stack traces when available

## Feature Requests

Great requests usually explain:

- The workflow problem being solved
- Why current behavior is insufficient
- What success would look like for the end user

## Security

Please do not open public issues for vulnerabilities or sensitive credential handling problems. Use the process in [SECURITY.md](./SECURITY.md).

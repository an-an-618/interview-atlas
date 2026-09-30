# Contributing

Interview Atlas accepts focused product, design, documentation, test, and implementation contributions. The current product contract lives in `docs/product/`, and accepted technical boundaries live in `docs/adr/`.

## Before contributing

1. Search existing issues and decision records.
2. Open an issue for a material product or architecture proposal.
3. Describe the user problem, proposed outcome, exclusions, and acceptance criteria.
4. Confirm that the change fits the current PRD and accepted ADRs.

## Local setup

Use Node.js 24 and npm 11:

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm test
npm run typecheck
npm run build
```

## Branches and commits

- `feature/<short-name>` for product capabilities
- `fix/<short-name>` for defects
- `docs/<short-name>` for documentation and decisions

Use focused commits with messages such as:

```text
feat: add atomic question review
fix: preserve synchronized block links
docs: clarify AI provider boundary
```

## Pull requests

Pull requests must:

- link the relevant issue;
- summarize what changed and why;
- list validation performed;
- identify privacy, security, data-migration, or compatibility effects;
- include screenshots or recordings for visible UI changes;
- avoid unrelated formatting or generated-file changes.

## Sensitive information

Never submit real resumes, interview records, recordings, transcripts, tokens, API keys, credentials, local databases, or private model responses. Use fictional examples and environment-variable placeholders.

Screenshots must use fictional data. Generated builds, browser profiles, local databases, and automation artifacts must not be committed.

## Decision records

Copy `docs/adr/0000-template.md` when a choice affects architecture, data ownership, security, interoperability, or long-term maintenance. Accepted ADRs are changed by creating a superseding ADR, not by rewriting their history.

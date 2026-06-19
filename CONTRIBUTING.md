# Contributing

Interview Atlas is accepting requirement, design, documentation, and engineering-governance contributions while product discovery is in progress.

## Before contributing

1. Search existing issues and decision records.
2. Open an issue for a material product or architecture proposal.
3. Describe the user problem, proposed outcome, exclusions, and acceptance criteria.
4. Do not implement business code before the corresponding requirement and architecture decisions are approved.

## Branches and commits

- `feature/<short-name>` for product capabilities
- `fix/<short-name>` for defects
- `docs/<short-name>` for documentation and decisions

Use focused commits with messages such as:

```text
docs: define interview import boundary
chore: add repository security policy
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

## Decision records

Copy `docs/adr/0000-template.md` when a choice affects architecture, data ownership, security, interoperability, or long-term maintenance. Accepted ADRs are changed by creating a superseding ADR, not by rewriting their history.

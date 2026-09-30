# Repository Guidelines

## Project phase and scope

Interview Atlas is implementing its first local-first vertical slice. Product behavior is defined in `docs/product/product-context.md` and `docs/product/prd-v1.md`; accepted technical choices are recorded in `docs/adr/`.

Do not add a rich-text editor, AI SDK, desktop wrapper, credential store, cloud service, or new persistence technology until the relevant architecture decision record is approved. Keep unapproved proposals technology-neutral.

## Repository structure

- `docs/product/` contains discovery notes, requirements, and approved PRDs.
- `docs/adr/` contains architecture decision records. Copy `0000-template.md` for each decision.
- `docs/engineering/` contains security, dependency, and delivery policies.
- `.github/` contains issue and pull request templates.
- `src/domain/` contains framework-independent product rules and tests.
- `src/data/` contains local persistence implementations.
- `src/components/` contains reusable interface components.
- `src/` entry files compose the responsive application.
- `src-tauri/` contains the macOS desktop shell and bundle metadata.
- `scripts/` contains reproducible packaging helpers.

Do not place cloned reference repositories, generated files, resumes, interview transcripts, recordings, API keys, or local databases in this repository.

## Working method

Start each substantial change from an issue with explicit acceptance criteria. Use a `feature/<short-name>`, `fix/<short-name>`, or `docs/<short-name>` branch. Keep commits focused and use imperative messages such as `docs: define synchronized block questions`.

Open a pull request before merging into `main`. The pull request must explain the intent, affected decisions, validation performed, privacy impact, and screenshots when UI work exists. Important milestones receive an annotated Git tag.

Codex Cloud and both local computers use GitHub as the shared engineering state. Before starting work, read the linked issue, this file, and `docs/engineering/CODEX_CLOUD_WORKFLOW.md`. Before stopping unfinished work, push the branch and update the draft pull request with completed work, remaining work, validation, risks, and the exact next action. Never leave the only copy of useful work or context in a local Codex conversation.

## Documentation and decisions

Write user-facing product material in clear Simplified Chinese, with an English summary when it helps open-source contributors. Record durable technical choices as ADRs, including context, decision, alternatives, consequences, and status. Do not silently convert assumptions into requirements.

## Security and AI rules

Never commit secrets or real personal data. Use placeholders in examples. AI features must use user-provided credentials, provide a non-AI fallback where practical, expose uncertain results for review, and avoid silently overwriting user-authored content.

Third-party skills, MCP servers, packages, and scripts are untrusted until reviewed. Prefer official capabilities. Document the need, license, permissions, network behavior, credential access, and pinned version before adoption.

## Validation

For documentation-only changes, verify links, Markdown structure, repository cleanliness, and secret-scan results. Once code exists, every feature must include proportionate automated tests and reproducible local commands before merge.

# Repository Guidelines

## Project phase and scope

Interview Atlas is currently in product discovery. Do not add an application framework, runtime, database, rich-text editor, AI SDK, or production code until the relevant PRD and architecture decision records are approved. Keep proposals technology-neutral unless a comparison is explicitly requested.

## Repository structure

- `docs/product/` contains discovery notes, requirements, and approved PRDs.
- `docs/adr/` contains architecture decision records. Copy `0000-template.md` for each decision.
- `docs/engineering/` contains security, dependency, and delivery policies.
- `.github/` contains issue and pull request templates.
- Product source and test directories will be defined only after the application architecture is approved.

Do not place cloned reference repositories, generated files, resumes, interview transcripts, recordings, API keys, or local databases in this repository.

## Working method

Start each substantial change from an issue with explicit acceptance criteria. Use a `feature/<short-name>`, `fix/<short-name>`, or `docs/<short-name>` branch. Keep commits focused and use imperative messages such as `docs: define synchronized block questions`.

Open a pull request before merging into `main`. The pull request must explain the intent, affected decisions, validation performed, privacy impact, and screenshots when UI work exists. Important milestones receive an annotated Git tag.

## Documentation and decisions

Write user-facing product material in clear Simplified Chinese, with an English summary when it helps open-source contributors. Record durable technical choices as ADRs, including context, decision, alternatives, consequences, and status. Do not silently convert assumptions into requirements.

## Security and AI rules

Never commit secrets or real personal data. Use placeholders in examples. AI features must use user-provided credentials, provide a non-AI fallback where practical, expose uncertain results for review, and avoid silently overwriting user-authored content.

Third-party skills, MCP servers, packages, and scripts are untrusted until reviewed. Prefer official capabilities. Document the need, license, permissions, network behavior, credential access, and pinned version before adoption.

## Validation

For documentation-only changes, verify links, Markdown structure, repository cleanliness, and secret-scan results. Once code exists, every feature must include proportionate automated tests and reproducible local commands before merge.

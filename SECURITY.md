# Security Policy

## Reporting

While the repository is private, report security concerns directly to the repository owner through a private GitHub message or a private security advisory. Do not open a public issue containing credentials, personal data, exploit details, resumes, transcripts, or recordings.

## Secret handling

- Never store API keys in source files, documentation examples, screenshots, logs, fixtures, or Git history.
- Use environment-variable placeholders for development examples.
- Future application credentials must be stored through an operating-system credential facility or another reviewed local secret store.
- Logs must redact credentials and sensitive interview or resume content.
- Before the repository becomes public, run a full history and secret scan.

## Local data

Interview notes, resumes, recordings, transcripts, model prompts, and model outputs are sensitive user data. Future architecture decisions must define storage location, encryption expectations, deletion, export, backup, and AI-provider data flow before implementation.

## Dependency policy

Third-party packages, Codex skills, MCP servers, plugins, and copied scripts require review before adoption. Review ownership, maintenance, license, install scripts, subprocess use, network access, credential access, data collection, update behavior, and the exact version or commit.

No third-party skill may be installed merely because it appears in an “awesome” list.

# Security Policy

## Reporting

While the repository is private, report security concerns directly to the repository owner through a private GitHub message or a private security advisory. Do not open a public issue containing credentials, personal data, exploit details, resumes, transcripts, or recordings.

## Secret handling

- Never store API keys in source files, documentation examples, screenshots, logs, fixtures, or Git history.
- The current web application keeps AI API keys in `sessionStorage`; they are excluded from IndexedDB and workspace exports.
- Use placeholders for development examples and fictional data for screenshots.
- Logs must redact credentials and sensitive interview or resume content.
- Before the repository becomes public, run a full history and secret scan.

## Local data

Interview notes, resumes, prompts, and model outputs are sensitive user data.

- Workspace data is stored in the current browser profile through IndexedDB.
- Local storage is not application-level encrypted; device and browser-profile security remain the user's responsibility.
- Workspace export is an explicit user action and produces a JSON file without credentials.
- AI requests are sent directly from the browser to the provider configured by the user.
- Clearing the workspace removes application records from IndexedDB but does not control provider-side retention.

## Dependency policy

Third-party packages, Codex skills, MCP servers, plugins, and copied scripts require review before adoption. Review ownership, maintenance, license, install scripts, subprocess use, network access, credential access, data collection, update behavior, and the exact version or commit.

No third-party skill may be installed merely because it appears in an “awesome” list.

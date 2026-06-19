# Interview Atlas

[中文说明](README.zh-CN.md)

Interview Atlas, Chinese product name **千面**, is a local-first workspace for turning scattered interview experiences into reusable interview knowledge.

The product vision is to help job seekers import unstructured interview notes, organize them into atomic question-and-answer blocks, connect repeated questions through synchronized knowledge blocks, and review the knowledge that matters most to them.

## Current status

The project is in product discovery. This repository currently contains governance and requirement-review materials only. No application framework, database, editor, AI provider, or desktop runtime has been selected.

## Proposed product areas

- Import and AI-assisted structuring of interview experiences
- Editable atomic question, answer, and reference blocks
- Reusable synchronized blocks for recurring interview topics
- Personalized review of high-frequency questions
- Resume parsing and links between experience sections and interview questions
- User-defined organization and classification
- A later recording, transcription, and interview-video workflow

## Development principles

- Local-first and user-controlled data
- Bring-your-own API key for optional AI features
- Human review for AI extraction, matching, and synchronization
- Reversible changes through Git and GitHub
- Product decisions recorded before implementation
- No secrets, resumes, interview recordings, or private user data in Git

## Repository map

- `docs/product/`: discovery notes and future PRDs
- `docs/adr/`: architecture decision records
- `docs/engineering/`: engineering and dependency policies
- `.github/`: issue and pull request templates
- `AGENTS.md`: contributor and coding-agent rules

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes.

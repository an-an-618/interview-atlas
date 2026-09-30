# ADR 0002: IndexedDB workspace storage

- Status: Accepted
- Date: 2026-09-30
- Owners: repository maintainers

## Context

Interview records, atomic questions, synchronized blocks, review events, and resume experiences are sensitive user data. The first implementation must persist them locally, survive reloads, support transactional relationship changes, and remain usable without AI or a product backend.

The storage boundary must also permit a future desktop database implementation without coupling UI components to browser APIs.

## Decision

Use the browser's native IndexedDB API behind a typed repository interface.

Version 1 creates these object stores:

- `interviews`;
- `questions`;
- `syncBlocks`;
- `resumeExperiences`;
- `reviewEvents`;
- `preferences`.

Relationships use stable string identifiers. Relationship changes that affect multiple stores use one read-write transaction. UI components call repository methods and never call IndexedDB directly.

Database upgrades are explicit and monotonic. Each future schema change must:

1. increment the database version;
2. include an upgrade function;
3. preserve or deliberately migrate existing data;
4. add migration and export/restore tests.

The first milestone starts with an empty workspace. Demonstration data is only inserted through an explicit user action and is marked as sample data. There is no silent seed that can be confused with personal data.

JSON export includes a format version, export timestamp, and all relationship-bearing objects. API credentials are never part of the database or export.

## Alternatives considered

### Local Storage

Rejected because it is synchronous, string-only, difficult to migrate safely, and unsuitable for the expected data volume.

### IndexedDB wrapper package

Deferred. A wrapper may reduce boilerplate, but the first repository methods are small and native IndexedDB avoids another production dependency. Revisit if migrations or query complexity grow materially.

### SQLite

Deferred until a desktop runtime is selected. Browser-only delivery cannot rely on ordinary SQLite without additional runtime or WebAssembly decisions.

### Filesystem Markdown as primary storage

Rejected as the initial primary store because transactional relationships, indexes, and concurrent edits are difficult to maintain. Markdown remains an export format.

## Consequences

- User knowledge remains on the current browser profile by default.
- Clearing browser site data deletes the workspace, so export and backup affordances are required.
- Browser storage is not equivalent to encrypted storage at rest.
- H5 and PC views share one database when served from the same origin and browser profile.
- A future Tauri or native repository can implement the same domain interface.

## Validation

- Reloading restores created interviews, questions, and synchronized blocks.
- Creating a synchronized block and linking questions either completes atomically or leaves all records unchanged.
- Export contains complete relationships and a format version.
- Clearing the workspace removes every object store record.
- Automated tests cover pure relationship and recommendation rules; browser-level tests cover IndexedDB persistence before release.

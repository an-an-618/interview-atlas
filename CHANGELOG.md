# Changelog

## 1.1.0 - 2026-10-10

### Added

- Full-transcript AI extraction with staged prompts, background queueing, progress notifications, and tolerant evidence grounding.
- Structured answer points with inline editing for atomic Q&A and synchronized blocks.
- Synchronized-block favorites, favorites filtering, and relationship-count sorting.
- Global search across interviews, atomic Q&A, synchronized blocks, and resume experiences.
- Saved interview organization by company, role, round, date, tag, or custom collections.
- Dual-track macOS recording for system audio and microphone audio, plus optional Xfyun transcription.

### Changed

- Atomic Q&A acceptance and synchronized-block linking are reviewed as separate decisions.
- Interview metadata, atomic Q&A, and deletion workflows are editable from interview records.
- Workspace storage and export format advance to version 10 with automatic migration from versions 1-9.
- macOS minimum version is now 15.0 because dual-track recording depends on ScreenCaptureKit APIs.
- Model and transcription credentials are limited to the current application session.

### Fixed

- Long AI extraction responses recover from malformed output, truncation, and evidence-format variation.
- A silent recording track no longer causes the other track's transcription result to be discarded.
- Workspace deletion requires explicit typed confirmation.
- The browser development port is fixed to prevent IndexedDB origin changes from appearing as data loss.

## 1.0.0 - 2026-09-30

- First stable macOS and Windows release.

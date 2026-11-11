# Changelog

## Unreleased

## 2.0.0 · 信笺工作台 - 2026-11-11

见字·如面 2.0 是一次覆盖整理、练习与分享的较大改版：暖白信笺工作台、闪卡复习、可恢复的模拟面试 Agent、简历文件导入及完整内容分享图统一交付。

### Added

- Let the interviewer choose local readonly knowledge tools through native tool calls, with per-turn call/request/time budgets, current-answer evidence checks, durable tool traces and explicit fallback for unsupported providers.

- Add a durable mock-interview harness with JD-based topic plans, separate main-question/followup counts, bounded action validation, interrupted-session recovery and pinned model configuration.
- Rank interview context using JD/current-answer keywords and resume–Q&A–aggregate relationships; retain verified practice goals with bounded knowledge and conversation inputs.
- Validate report quotes against saved candidate message IDs and source ranges; copy candidate answers into atomic Q&A, exclude invalid report entries and preserve evidence in v11 backups.
- Add shuffled flashcards for aggregate blocks or atomic Q&A in the home workbench, with questions on the front, answers on the back, bidirectional swipe, pointer, trackpad and keyboard controls, and persistent favorites.
- Add a persistent “首页闪卡” settings switch, enabled by default; disabling it brings the three home panels and interview-room entry directly into view.
- Add manual flashcard shuffling with a slower 2.5-second animation around the curved carousel axis, smooth braking to a stop, and an immediate result for reduced-motion preferences.
- Parse Word (.docx), text PDFs, TXT/Markdown and optional resume images with the globally configured LLM; disclose API data sharing before parsing and review/edit/select experiences before appending them locally.
- Share atomic Q&A, aggregate blocks, resume experiences and complete interviews as local 1080 × 1440 PNG images, with optional metadata, full-content pagination, page previews and individual or batch downloads.
- Add an optional product watermark with the 见字·如面 name and GitHub repository address.

### Changed

- Rebuild the home page as a warm stationery workbench with compact portrait flashcards beside the interview entry and a single-column layout on narrow screens.
- Align all pages, navigation, forms, filters and dialogs around warm paper, dark green actions and light green selected states.
- Present portrait flashcards in a rotating carousel with dimmed adjacent cards; keep the curved track faint at rest and fade it in during shuffling. Left and right controls navigate previous and next.
- Replace the heavy search field border and focus ring with an icon, text and a fine underline.
- Simplify flashcard flip controls to an icon and text without a border or filled background.
- Keep collections and recent activity in the home workbench, and preserve review-card order and progress throughout each application session.
- Advance workspace exports to version 11, with automatic migration and restore compatibility for versions 1–10.
- Render share images as warm stationery with fine borders, ruled answers and botanical details; simplify atomic Q&A headers and omit page numbers on single-page images.
- Move the interview share button to the top-right corner of its detail header.
- Unify interaction motion with shared easing tokens, press feedback on buttons and list rows, instant touch response, and 40px aligned aggregate toolbar controls.
- Use “聚合块” consistently for aggregate blocks while preserving stored `SyncBlock` fields and backup compatibility.
- Give aggregate-block answers more reading space, with a collapsible directory and linked-question section.
- Search aggregate blocks with multiple keywords across titles, answers and notes, including full-width and case normalization.
- Reopen the directory when searching or changing scope; clear searches with a button or Escape.
- Split aggregate-block and shared page components out of the application entry point.
- Align product documentation with the accepted session-only credential policy.

### Fixed

- Keep the slowing shuffle card and final current card identical, with continuous position, size and brightness and no disappearing-card handoff.
- Open the mock-interview entry and setup at the top instead of retaining the home page's scroll position.
- Prevent horizontal trackpad overscroll from moving the home page, consume continuous momentum as one card turn, and keep question text readable in short windows.
- Keep source interviews readable in share images with numbered entries, hanging indents, spacing and repeated headings across pages.
- Exclude hidden aggregate blocks from the directory and its counts.
- Clear stale search text when leaving an empty favorites view.
- Hide collapsed sidebar labels without residual blocks and align its bottom icons across expanded, collapsed and mobile states.
- Preserve readable controls and layouts across desktop/mobile window sizes and browser zoom from 75% to 200%.

### Release and compatibility

- Synchronize the pending extraction branch history with the improved extraction implementation already shipped in 1.1; include all subsequent local source updates.
- Ship Apple Silicon macOS 15+ DMG and Windows 10/11 x64 NSIS/MSI installers. The application identifier and local storage boundary remain compatible; export a JSON backup before upgrading.
- macOS builds use ad-hoc signing and are not Apple-notarized; Windows installers remain without Authenticode signing.

## 1.1.0 - 2026-10-10

### Added

- Full-transcript AI extraction with staged prompts, background queueing, progress notifications, and tolerant evidence grounding.
- Structured answer points with inline editing for atomic Q&A and aggregate blocks.
- Aggregate-block favorites, favorites filtering, and relationship-count sorting.
- Global search across interviews, atomic Q&A, aggregate blocks, and resume experiences.
- Saved interview organization by company, role, round, date, tag, or custom collections.
- Dual-track macOS recording for system audio and microphone audio, plus optional Xfyun transcription.

### Changed

- Atomic Q&A acceptance and aggregate-block linking are reviewed as separate decisions.
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

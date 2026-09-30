# ADR 0004: macOS desktop wrapper with Tauri

- Status: Accepted
- Date: 2026-10-01
- Owners: repository maintainers

## Context

Interview Atlas already ships as a responsive React and Vite client with IndexedDB persistence. The next delivery milestone is a downloadable macOS application that can be distributed through GitHub Releases without forking the product code or introducing a hosted backend.

The first desktop preview must remain small, preserve the existing local-first behavior, and produce standard macOS `.app` and `.dmg` artifacts. The current maintainer machine is Apple Silicon. No Apple Developer signing identity or notarization credential is available yet.

## Decision

Use Tauri 2 as a thin macOS desktop wrapper around the existing Vite production build.

- The desktop shell loads the same `dist/` output as the browser application.
- The first desktop target is Apple Silicon macOS only.
- The bundle identifier is `com.interviewatlas.desktop`.
- Tauri owns the native window, application metadata, icon, `.app`, and `.dmg` generation.
- Domain logic, React components, AI requests, and the IndexedDB repository remain shared with the web application.
- No native plugin, filesystem access, updater, telemetry, backend, or persistent credential store is added in this milestone.
- Local preview artifacts may be unsigned. Public releases require Developer ID signing and Apple notarization.

The desktop WebView has its own storage origin. Existing data in a normal browser profile is not automatically migrated into the desktop application. JSON export and future restore support are the intended migration boundary.

## Alternatives considered

### Electron

Rejected for the first desktop package. Electron would make packaging familiar to JavaScript contributors, but it bundles a complete Chromium runtime and materially increases download size and idle memory for a product that already works in the system WebView.

### Progressive Web App only

Deferred as the sole distribution path. A PWA is useful for browser installation but does not produce the requested `.app` and `.dmg` artifacts or establish a path to future macOS keychain integration.

### Separate native application

Rejected. A Swift or AppKit rewrite would duplicate the current UI and domain behavior, creating two products to maintain before the workflow is stable.

### Cross-platform packaging immediately

Deferred. Windows and Linux require separate bundle formats, platform testing, signing, and release automation. The wrapper is structured so those targets can be added without changing the React application.

## Consequences

- Contributors building the desktop package need Rust and the macOS Command Line Tools in addition to Node.js.
- The application stays visually and behaviorally aligned with the web version.
- The produced app is substantially smaller than an Electron bundle.
- Browser and desktop workspaces are independent until import/restore is implemented.
- Unsigned preview builds trigger Gatekeeper warnings on other Macs.
- Distribution automation, code signing, notarization, auto-update, and secure persistent credentials require follow-up decisions and secrets management.

## Validation

- `npm test`, `npm run typecheck`, and `npm run build` continue to pass.
- `npm run desktop:build` produces a launchable `.app` and `.dmg` on Apple Silicon macOS.
- The packaged application renders the current interface and creates no additional network request during launch.
- The generated bundle contains the current Vite assets and reports the expected bundle identifier.
- The source repository does not track `src-tauri/target/`, signing credentials, or generated package artifacts.

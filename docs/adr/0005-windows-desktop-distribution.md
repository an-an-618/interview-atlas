# ADR 0005: Windows desktop distribution

- Status: Accepted
- Date: 2026-10-01
- Owners: repository maintainers

## Context

Interview Atlas already uses Tauri 2 to wrap the shared React/Vite application for macOS. Windows support should preserve the same local-first behavior without adding a second frontend or a hosted backend.

The first Windows preview needs standard installers that can be built and checked on a native Windows runner. No Windows code-signing certificate is currently available.

## Decision

- Support x64 Windows with the existing Tauri application.
- Produce an NSIS `.exe` for normal installation and an MSI package for managed environments.
- Use `Interview Atlas` as the Windows package and installed application name because WiX 3 cannot reliably link MSI output paths containing the Chinese product name. Keep `千面` as the in-app window title.
- Use the system WebView2 runtime and let the installer download its bootstrapper when the runtime is missing.
- Install the NSIS package for the current user by default, without requiring administrator privileges.
- Build and retain both installers in GitHub Actions.
- Keep the React application, IndexedDB repository, AI boundary, and product behavior shared with web and macOS.
- Treat unsigned packages as previews until Authenticode signing is configured.

## Consequences

- Windows application data has its own WebView storage and does not synchronize automatically with browser or macOS workspaces.
- JSON export and restore remain the explicit migration path between clients.
- Windows may show a Microsoft Defender SmartScreen warning for unsigned preview builds.
- The GitHub Actions workflow is the authoritative Windows build environment; macOS cannot natively produce or validate the MSVC installers.
- A future public release should sign the executable and installers with a trusted code-signing certificate.

## Validation

- The Windows CI job runs the application test suite and production frontend build.
- Rust compiles for the native `x86_64-pc-windows-msvc` host.
- CI verifies that exactly one NSIS installer and one MSI installer were produced.
- Both installers are uploaded as a workflow artifact.

# Third-Party Capability Policy

Interview Atlas does not treat a package, Codex skill, MCP server, plugin, copied script, or “awesome” list entry as trusted by default.

## Approval checklist

Before adoption, document:

- the capability gap it fills;
- why an existing official or installed capability is insufficient;
- repository owner, maintenance activity, and license;
- exact reviewed release or commit;
- install and update scripts;
- subprocess and filesystem behavior;
- outbound network access and contacted services;
- required credentials and accessible user data;
- telemetry, analytics, or remote logging;
- rollback and removal steps.

## Defaults

- Prefer official and already-installed capabilities.
- Keep research checkouts outside the product repository.
- Do not bulk-install collections.
- Do not execute code while performing an initial documentation review.
- Pin approved dependencies; do not depend on an unreviewed moving branch.
- Record material dependency choices in an ADR.

## Initial review

On 2026-06-19, the project reviewed isolated shallow checkouts of `openai/skills`, `ComposioHQ/awesome-codex-skills`, `RoggeOhta/awesome-codex-cli`, and `Austin1serb/agents-md`. No additional capability was installed. The community collections remain reference material only.

## Tauri desktop packaging

Tauri 2.12.0 is approved by [ADR 0004](../adr/0004-macos-tauri-wrapper.md) for the macOS desktop shell. The project is maintained by the Tauri Programme within the Commons Conservancy and is licensed under Apache-2.0 or MIT.

- Capability: native macOS window and `.app`/`.dmg` packaging around the existing Vite output.
- Reviewed packages: `@tauri-apps/cli@2.12.0`, `tauri@2.12.0`, and `tauri-build@2.7.0`.
- Install behavior: npm installs the platform-specific CLI package; Cargo downloads and compiles pinned Rust dependencies.
- Subprocess and filesystem access: the CLI invokes Cargo, Xcode command-line tools, and macOS bundle utilities; generated files stay under `src-tauri/target/`.
- Network behavior: package installation contacts the configured npm and Cargo registries. The desktop runtime adds no telemetry or product backend.
- Credentials: unsigned local builds require none. Future signing and notarization credentials must be supplied only through a reviewed release environment.
- Rollback: remove `src-tauri/`, the desktop npm scripts, and `@tauri-apps/cli`.

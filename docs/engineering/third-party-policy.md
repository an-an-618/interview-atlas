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

## GitHub Actions CI

The CI workflow uses two official GitHub-maintained actions:

| Action | Reviewed release and commit | Purpose |
| --- | --- | --- |
| `actions/checkout` | `v7.0.1` / `3d3c42e5aac5ba805825da76410c181273ba90b1` | Check out the repository in the GitHub-hosted runner |
| `actions/setup-node` | `v7.0.0` / `820762786026740c76f36085b0efc47a31fe5020` | Install Node.js 24 and enable the npm cache |
| `actions/upload-artifact` | `v6.0.0` / `b7c566a772e6b6bfb58ed0dc250532a479d7789f` | Retain generated Windows installers for download |

All three projects are maintained by GitHub under the MIT license. The workflow grants only `contents: read`, handles repository source, lockfiles, and generated installers, and sends network requests to GitHub, npm, and Cargo registries. It receives no application credentials or user workspace data. Removal consists of deleting `.github/workflows/ci.yml`.

## Tauri desktop packaging

Tauri 2.12.0 is approved by [ADR 0004](../adr/0004-macos-tauri-wrapper.md) and [ADR 0005](../adr/0005-windows-desktop-distribution.md) for the macOS and Windows desktop shell. The project is maintained by the Tauri Programme within the Commons Conservancy and is licensed under Apache-2.0 or MIT.

- Capability: native macOS and Windows application windows with `.app`, `.dmg`, NSIS, and MSI packaging around the existing Vite output.
- Reviewed packages: `@tauri-apps/cli@2.12.0`, `tauri@2.12.0`, and `tauri-build@2.7.0`.
- Install behavior: npm installs the platform-specific CLI package; Cargo downloads and compiles pinned Rust dependencies. Windows packaging may also download the NSIS/WiX toolchain and the WebView2 bootstrapper.
- Subprocess and filesystem access: the CLI invokes Cargo and native platform bundle utilities; generated files stay under `src-tauri/target/`.
- Network behavior: package installation contacts the configured npm and Cargo registries. The desktop runtime adds no telemetry or product backend.
- Credentials: unsigned local builds require none. Future signing and notarization credentials must be supplied only through a reviewed release environment.
- Rollback: remove `src-tauri/`, the desktop npm scripts, and `@tauri-apps/cli`.

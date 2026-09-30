# ADR 0001: Responsive web application foundation

- Status: Accepted
- Date: 2026-09-30
- Owners: repository maintainers

## Context

The approved implementation direction requires one local-first product that supports the PC v3 production workflow and the H5 v5 lightweight workflow without maintaining two independent business implementations. The repository has no application runtime yet.

The first milestone must run locally, preserve the existing React prototype's interaction model, and keep a future desktop wrapper possible. It must not require a cloud service or a framework with a server runtime.

## Decision

Build a single responsive client application with:

- React 19.3.0 for component and state composition;
- TypeScript 7.0.2 in strict mode;
- Vite 8.3.1 for local development and static production builds;
- `@vitejs/plugin-react` 6.1.1 for the supported React transform;
- Lucide React 1.49.0 for interface icons;
- Fontsource 5.3.0 packages for locally bundled Inter, Source Serif 4, and JetBrains Mono fonts;
- Vitest 5.0.2 for domain and data-layer tests;
- Node.js 24 for the initial development toolchain.

PC and H5 use the same domain and persistence code. Responsive navigation and task-specific presentation may differ by viewport, but object semantics and state transitions must remain shared.

The first release is a static client application. A desktop wrapper, PWA installation, filesystem integration, and cross-device synchronization require separate ADRs.

All package versions are exact in `package.json` and the lockfile. Runtime code has no telemetry and no product network calls in the first milestone. Vite's development server only serves local project assets.

## Third-party review

| Package | Owner | License | Purpose | Runtime access |
| --- | --- | --- | --- | --- |
| React / React DOM | Meta and React contributors | MIT | UI composition and DOM rendering | Browser DOM only |
| Lucide React | Lucide contributors | ISC | Consistent accessible interface icons | None |
| Fontsource font packages | Fontsource and upstream font authors | OFL-1.1 | Bundle the approved design fonts without runtime CDN requests | Static font assets only |
| Vite / React plugin | VoidZero and Vite contributors | MIT | Local build and development server | Local filesystem and local dev port |
| TypeScript | Microsoft | Apache-2.0 | Static type checking | Build-time filesystem access |
| Vitest | Vitest contributors | MIT | Automated tests | Test process and project files |

Packages are installed from the npm registry. Install scripts and transitive dependencies remain represented by the lockfile and must be reviewed by automated dependency checks before release. None of these packages require credentials or access to interview data. Removal consists of deleting the dependency and replacing its imported capability.

## Alternatives considered

### Separate PC and H5 applications

Rejected because it duplicates domain logic and makes state semantics drift likely. The existing prototypes already expose inconsistent frequency labels that a shared implementation should eliminate.

### Tauri immediately

Deferred. Tauri may provide stronger desktop integration and credential storage later, but it adds Rust, packaging, updater, and operating-system decisions before the core workflow has been validated.

### Next.js or another server-oriented framework

Rejected for the first milestone because there is no server-rendering or backend requirement. A server runtime would make the local-first boundary less clear.

### Continue with precompiled prototype scripts

Rejected because they have no type checking, test boundary, package manifest, or maintainable module structure.

## Consequences

- One codebase can implement PC and H5 behavior.
- The application can be built as static assets and run without a product server.
- Browser limitations apply to credential storage and filesystem access until a desktop runtime is selected.
- Responsive behavior must be tested at desktop and mobile viewports.
- A future desktop wrapper should consume the same application rather than fork it.

## Validation

- `npm run typecheck`, `npm test`, and `npm run build` pass on the pinned toolchain.
- The built app loads without third-party network assets.
- The core workflow works at desktop and mobile widths.
- No application request leaves localhost in the first milestone.

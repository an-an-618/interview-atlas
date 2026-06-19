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

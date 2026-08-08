# Donor decisions

Provider, lifecycle, process, worktree, and control-plane changes start by
checking both donors. Donor evidence informs the design; it does not qualify
the adapted hosted service.

## `openai/codex-plugin-cc`

- Revision: `db52e28f4d9ded852ab3942cea316258ae4ef346` (release 1.0.6).
- Inspected files: `.claude-plugin/marketplace.json`,
  `plugins/codex/.claude-plugin/plugin.json`,
  `plugins/codex/commands/review.md`,
  `plugins/codex/scripts/lib/broker-lifecycle.mjs`, and
  `plugins/codex/scripts/session-lifecycle-hook.mjs`.
- Useful invariant: the public integration stays thin while runtime code owns
  launch, readiness, lifecycle, and durable identity.
- Adaptation: target repositories install only the private GitHub App; this
  repository owns the complete hosted runtime behind that boundary and retains
  durable terminal evidence and bounded recovery.
- Rejected pattern: the donor's local session cleanup can tolerate termination
  failure before removing state. A hosted reviewer must not discard durable
  state while termination or recovery is ambiguous.
- Missing pattern: this donor provides no hosted deployment or infrastructure
  model, so it is not an authority for GitHub App or Cloudflare configuration.

## `xai-org/grok-build`

- Contract-audit revision:
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`.
- Current source inspected on 2026-08-08:
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files/surfaces: generated npm `grok/package.json` and `bin/grok`;
  `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tasks_cancel.rs`;
  `crates/codegen/xai-grok-shell/src/leader/lock.rs`; and the authentication
  storage implementation used by the generated CLI.
- Useful invariants: pin and attest one platform distribution; isolate
  `GROK_HOME`; pass signals through; scope cancellation to the owning session;
  use bounded termination and reap; never race jobs on a mutable shared auth
  home.
- Adaptation: each hosted review gets an isolated Grok home and an attested
  executable. Authentication is injected only at runtime. Cancellation and
  cleanup remain bound to the review owner and leave durable terminal evidence.
- Rejected patterns: embedded ACP is not a remote-service template, and Grok
  Build has no service infrastructure-as-code model. This repository neither
  forks Grok Build nor treats its source tree as a deployment unit.

## Licensing

The repository remains Apache-2.0. `LICENSE` was copied mechanically from the
source repository. `NOTICE` preserves and adapts the applicable OpenAI
`codex-plugin-cc` attribution inherited through that source. Grok Build source
is inspected for contracts but is not copied.
The official Grok distribution is a pinned runtime input; its package notices
and license material must remain intact whenever it is redistributed. The
project is independent and does not claim endorsement by OpenAI or xAI.

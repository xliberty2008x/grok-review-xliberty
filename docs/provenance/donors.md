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

## Task 4A persistence kernel

### `openai/codex-plugin-cc`

- Exact revision: `db52e28f4d9ded852ab3942cea316258ae4ef346`.
- Inspected files/surfaces: `.claude-plugin/marketplace.json`,
  `plugins/codex/.claude-plugin/plugin.json`,
  `plugins/codex/commands/review.md`,
  `plugins/codex/scripts/lib/broker-lifecycle.mjs`, and
  `plugins/codex/scripts/session-lifecycle-hook.mjs`.
- Useful invariant: the public integration remains thin while runtime-owned
  code holds durable lifecycle and identity.
- Local adaptation: the persistence schema and D1-compatible adapters are
  mechanically sourced from the frozen hosted App and exposed through the
  standalone control-plane boundary.
- Rejected or missing pattern: the donor has neither a hosted D1 schema nor a
  transactional-outbox implementation, and its best-effort local cleanup is
  not adopted as durable hosted recovery.

### `xai-org/grok-build`

- Exact revisions: contract audit
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current-source check
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files/surfaces: generated npm `grok/package.json` and `bin/grok`,
  `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tasks_cancel.rs`,
  `crates/codegen/xai-grok-shell/src/leader/lock.rs`, and the generated CLI's
  authentication-storage implementation.
- Useful invariant: a thin public integration delegates durable lifecycle and
  identity ownership to the runtime boundary.
- Local adaptation: the frozen hosted App, rather than Grok Build, supplies the
  mechanically ported parity schema and database adapters for the standalone
  control plane.
- Rejected or missing pattern: embedded ACP is not used as a hosted-service
  template, and the donor supplies neither a hosted D1 schema nor a
  transactional-outbox implementation.

This inspection is design evidence only. It does not qualify a D1 deployment
or a live hosted lifecycle.

## Task 4B authenticated request boundary

### `openai/codex-plugin-cc`

- Exact revision: `db52e28f4d9ded852ab3942cea316258ae4ef346`.
- Inspected files/surfaces: `.claude-plugin/marketplace.json`,
  `plugins/codex/.claude-plugin/plugin.json`,
  `plugins/codex/commands/review.md`,
  `plugins/codex/scripts/lib/broker-lifecycle.mjs`, and
  `plugins/codex/scripts/session-lifecycle-hook.mjs`.
- Useful invariant: keep the public integration thin and put authentication,
  lifecycle identity, and durable control in the runtime boundary.
- Local adaptation: the standalone control plane authenticates the exact raw
  GitHub webhook bytes and fixed immutable control ref before exposing bounded
  metadata to later durable lifecycle slices.
- Rejected or missing pattern: this donor supplies neither a hosted GitHub
  webhook/D1 request boundary nor a substitute for durable admission.

### `xai-org/grok-build`

- Exact revisions: contract audit
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current-source check
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files/surfaces: generated npm `grok/package.json` and `bin/grok`,
  `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tasks_cancel.rs`,
  `crates/codegen/xai-grok-shell/src/leader/lock.rs`, and the generated CLI's
  authentication-storage implementation.
- Useful invariant: authentication and executable identity must fail closed
  before an untrusted lifecycle can start.
- Local adaptation: webhook HMAC and immutable control identity are edge-owned
  gates; no Grok process or provider behavior is part of this slice.
- Rejected or missing pattern: embedded ACP is not a hosted-service boundary,
  and Grok Build supplies no GitHub webhook or D1 admission implementation.

### Frozen parity source and staged adaptation

The parity source is the frozen hosted App at
`aee1171c2f346948feb2864784e13abe020dcb34`. Current and frozen SHA-256
digests matched during this port:

- `http.mjs`: `246925c36a8cf11d10c93fb7f92fdd5c06d99201f97d2119d422d6f286c804a1`;
- `webhook.mjs`: `a9257c30fed425198df7adac92244ad5b49ce3f7d4cb4e0cc2fbca109657e7c5`;
- `index.mjs`: `f20cff697fc268af4d2d69129c20cc109a90caa9dd9b5e74d835540fb78a5bf2`;
- `ids.mjs`: `90b4394c5ae15ecda2cf6060451d12d65e6d1ea671421547f3f68a3da082cc4f`.

The intentional staged adaptation authenticates and parses exactly now, then
returns `503 webhook_route_unavailable` for valid supported lifecycle events
until installation authority, durable admission, and dispatch land. It does
not acknowledge fake success, write D1, dispatch work, or qualify any live
GitHub, Cloudflare, D1, or provider lifecycle.

## Task 4C installation and trigger authority

### `openai/codex-plugin-cc`

- Exact revision: `db52e28f4d9ded852ab3942cea316258ae4ef346`.
- Inspected files/surfaces: `.claude-plugin/marketplace.json`,
  `plugins/codex/.claude-plugin/plugin.json`,
  `plugins/codex/commands/review.md`,
  `plugins/codex/scripts/lib/broker-lifecycle.mjs`, and
  `plugins/codex/scripts/session-lifecycle-hook.mjs`.
- Useful invariant: the public integration stays thin while a runtime-owned
  boundary holds lifecycle authority and durable identity.
- Local adaptation: GitHub installation and selected-repository authority now
  live in the standalone edge control plane behind the authenticated webhook
  boundary.
- Rejected or missing pattern: this donor supplies no hosted GitHub App
  installation/repository authority, D1 revocation fence, or trigger-admission
  implementation.

### `xai-org/grok-build`

- Exact revisions: contract audit
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current-source check
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files/surfaces: generated npm `grok/package.json` and `bin/grok`,
  `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tasks_cancel.rs`,
  `crates/codegen/xai-grok-shell/src/leader/lock.rs`, and the generated CLI's
  authentication-storage implementation.
- Useful invariant: authorization and ownership gates must fail closed before
  provider work starts, and cancellation remains scoped to its owner.
- Local adaptation: installation revocation durably fences scoped hosted work
  before any later executor or network-cancellation slice can run.
- Rejected or missing pattern: embedded ACP is not a GitHub authority service,
  and Grok Build supplies no hosted App, repository-selection, webhook, D1, or
  service-IaC pattern.

### Frozen parity source and staged adaptation

The parity source remains
`aee1171c2f346948feb2864784e13abe020dcb34`. This slice inspected the complete
source `webhook.mjs`, `constants.mjs`, `memory-db.mjs`, `external-id.mjs`,
`ids.mjs`, and `index.mjs`; the installation and supersession surfaces in
`db.mjs`; and worker identities W08-W13/W19 plus their helpers. Their frozen
SHA-256 values were:

- `webhook.mjs`: `a9257c30fed425198df7adac92244ad5b49ce3f7d4cb4e0cc2fbca109657e7c5`;
- `constants.mjs`: `d94e1a331420317d94b2b3ae2678573765adef22d3083767d35a1a602d441011`;
- `db.mjs`: `9342cbed352fdc57ed372ac3e43b0d3d0e7219d318cd3c900125d0413bf63f92`;
- `memory-db.mjs`: `7df2a379b57721e206e5c1a847b3bc862fe472ec857644d5648b6cb57ed569f2`;
- `external-id.mjs`: `c82600aa441baca4a8145575e3006e04dba0ff8d816277ac87603f5cd6f788b5`;
- `ids.mjs`: `90b4394c5ae15ecda2cf6060451d12d65e6d1ea671421547f3f68a3da082cc4f`;
- `index.mjs`: `f20cff697fc268af4d2d69129c20cc109a90caa9dd9b5e74d835540fb78a5bf2`;
- `tests/grok-review-app-worker.test.mjs`:
  `cd7e3312bc27e4d258e5f66eac9754719d891194d72daa91fba36386d72c4c1a`.

W09 and W10 are the only mechanically bound identities in this slice. The
local authority layer performs installation/repository mutations and safe
trigger decisions, but valid authorized triggers deliberately return
`503 webhook_route_unavailable`. It admits no delivery or review request,
executes no outbox job, performs no outbound call, and does not return fake
`queued` success. W11 is deferred to Task 4D; W08, W12, and W19 to Task 4E;
and W13 to Task 4F. This evidence is design parity, not live GitHub,
Cloudflare, D1, or provider qualification.

## Vertical-first staging compatibility transport

### `openai/codex-plugin-cc`

- Exact revision: `db52e28f4d9ded852ab3942cea316258ae4ef346`.
- Inspected files: marketplace/plugin manifests, `commands/review.md`,
  `broker-lifecycle.mjs`, and `session-lifecycle-hook.mjs`.
- Useful invariant: the installed integration remains thin while the trusted
  runtime owns lifecycle identity and durable terminal evidence.
- Local adaptation: the E2E repository installs only the staging App; this
  independent control repository owns the copied Worker and runner.
- Rejected or missing pattern: local best-effort cleanup and the donor's absent
  hosted deployment model do not replace D1-backed recovery.

### `xai-org/grok-build`

- Exact revisions: contract audit
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current source
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files: generated package/launcher, owner-scoped cancellation,
  leader lock, and authentication storage.
- Useful invariant: attest one executable, isolate its auth home, scope
  cancellation to the owner, and terminate/reap within bounded control.
- Local adaptation: the compatibility runner preserves the frozen tool-free
  review and executable-attestation lifecycle for the first staging proof.
- Rejected or missing pattern: embedded ACP is not a hosted-service design,
  and Grok Build supplies no GitHub App, D1, or delivery model.

The transported source is
`aee1171c2f346948feb2864784e13abe020dcb34`. Prior live evidence for
`ea3594fb1f7cc546ede6d3dca2282860e54b8721` is provenance only; the new
repository remains unqualified until `terminal_receipt_committed`.

## Task 1 production cutover: App operations and regression ownership

### Frozen hosted App source (`xliberty2008x/grok-plugin` / `grok-plugin-e2e`)

- Exact revision: `aee1171c2f346948feb2864784e13abe020dcb34`.
- Inspected / copied paths:
  `apps/grok-review-app/README.md`,
  `docs/operations/private-grok-review-app.md`,
  `scripts/sync-grok-ci-auth.mjs`,
  `scripts/install-grok-ci-auth-sync.mjs`,
  `tests/ci-auth-sync.test.mjs`,
  `tests/grok-review-app-worker.test.mjs`,
  `tests/grok-review-app-github.test.mjs`,
  `tests/grok-review-app-runner.test.mjs`,
  and `tests/grok-review-app-target-collector.test.mjs`.
- Useful invariant: operations and regression ownership move before old-host
  removal.
- Local adaptation: repository name
  (`xliberty2008x/grok-plugin` → `xliberty2008x/grok-review-xliberty` in
  operational documentation) and a pinned deployment invocation:
  `evidence/private/vertical-staging/toolchains/node-v22.17.1-darwin-arm64/bin/node`
  executes only
  `$TARGET_ROOT/node_modules/wrangler/bin/wrangler.js` (Wrangler
  `4.120.0`); Prettier also normalizes the existing credential table so the
  standalone operations-document gate is enforceable.
- Rejected or missing pattern: do not keep the watcher owned by a checkout that
  will be deleted.

### `openai/codex-plugin-cc`

- Exact revision: `db52e28f4d9ded852ab3942cea316258ae4ef346`.
- Inspected files: marketplace/plugin manifests, `commands/review.md`,
  `broker-lifecycle.mjs`, and `session-lifecycle-hook.mjs`.
- Useful invariant: the public integration stays thin while runtime-owned code
  holds durable lifecycle and identity.
- Local adaptation: this repository owns App operations, the auth watcher, and
  the existing App regression suites; targets install only the GitHub App.
- Rejected or missing pattern: local best-effort cleanup does not authorize
  deleting a still-authoritative host before ownership has moved.

### `xai-org/grok-build`

- Exact revisions: contract audit
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current-source check
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files: generated package/launcher, owner-scoped cancellation,
  leader lock, and authentication storage.
- Useful invariant: isolate auth homes and attest executables before provider
  work; keep cancellation owner-scoped.
- Local adaptation: the moved auth watcher remains the only central
  `GROK_AUTH_JSON` owner after cutover and continues to fail closed on stale or
  unsafe material.
- Rejected or missing pattern: embedded ACP is not a hosted App operations or
  auth-watcher model.

## Task 3 production cutover: durable pause epoch and callback-key overlap

### `openai/codex-plugin-cc`

- Exact revision: `db52e28f4d9ded852ab3942cea316258ae4ef346`.
- Inspected files: `plugins/codex/scripts/lib/broker-lifecycle.mjs` and
  `plugins/codex/scripts/session-lifecycle-hook.mjs`.
- Useful invariant: durable lifecycle identity must be established and checked
  before an external side effect proceeds.
- Local adaptation: the hosted Worker owns a D1 singleton `control_state` gate
  and SQL/pre-network fences so repair, lease, watchdog, and GitHub work stop
  on pause or epoch change without discarding admitted webhook work.
- Rejected or missing pattern: local best-effort teardown or in-process state
  clearing is not a substitute for a durable hosted cutover gate.

### `xai-org/grok-build`

- Exact revisions: contract audit
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current-source check
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files:
  `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tasks_cancel.rs`
  and `crates/codegen/xai-grok-shell/src/leader/lock.rs`.
- Useful invariant: cancellation and exclusive work remain bound to the
  authoritative owner identity before the side effect runs.
- Local adaptation: outbox jobs re-check the exact leased owner plus the
  unpaused cutover epoch immediately before `dispatchWorkflow` /
  `cancelWorkflowRun`, and owner-fenced reschedule uses
  `cutover_epoch_changed` without rewriting a replacement owner's lease.
- Rejected or missing pattern: in-memory actor flags and embedded ACP are not a
  durable cross-invocation pause for a multi-invocation Worker/D1 control plane.

This inspection is design evidence only. It does not qualify a live D1, Worker,
GitHub, Cloudflare, or provider lifecycle.

## Issue #4 model-input projection

### `openai/codex-plugin-cc`

- Exact revision: `db52e28f4d9ded852ab3942cea316258ae4ef346`.
- Inspected files: `plugins/codex/commands/review.md` and
  `plugins/codex/scripts/lib/broker-lifecycle.mjs`.
- Useful invariant: the public review command remains thin, while the trusted
  runtime owns provider launch and lifecycle state.
- Local adaptation: the standalone host now derives a bounded UTF-8 model
  projection from authoritative exact-head evidence and rejects it before the
  provider dependency boundary; the signed receipt remains bound to the full
  authoritative binary diff digest and byte count.
- Rejected or missing pattern: the donor defines neither hosted binary-patch
  projection nor a model-packet byte policy, so its thin command is not used as
  authority for repository-controlled Git attributes or prompt admission.

### `xai-org/grok-build`

- Exact revisions: contract audit
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current-source check
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files:
  `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tasks_cancel.rs`
  and `crates/codegen/xai-grok-shell/src/leader/lock.rs`.
- Useful invariant: task ownership and the exclusive runtime lock are
  established before lifecycle operations cross their external boundary.
- Local adaptation: model-packet size and content admission are host-owned
  pre-provider fences; Grok execution keeps its existing isolated owner and
  executable identity after admission succeeds.
- Rejected or missing pattern: Grok Build supplies no hosted review-packet
  shaping, Git-attribute neutralization, or provider-safe patch projection, so
  embedded ACP and leader locking are not substitutes for this input gate.

This inspection is design evidence only. Issue #4 remains unqualified until a
real installed-App staging lifecycle reaches durable terminal receipt and
App-authored review output.

## Visible admit and honest supersession

Contract-delta reason for new tests (frozen 105-test identity unchanged): add
`tests/grok-review-visible-admit.test.mjs` that drives shipped
`runCentralReview`, `fetchAuthoritativeReviewContext`, and
`buildPrReviewPayload`. Automatic admit must create an `in_progress`
`Grok review` check before Grok runs; `automatic_head_mismatch` must complete
that check `cancelled` naming the live head and must not post COMMENT. Host
`merge-base..head` commit/file counts belong in the COMMENT preface.

### `openai/codex-plugin-cc`

- Exact revision: `db52e28f4d9ded852ab3942cea316258ae4ef346`.
- Inspected files: `plugins/codex/.claude-plugin/plugin.json`,
  `plugins/codex/commands/review.md`,
  `plugins/codex/scripts/lib/broker-lifecycle.mjs`, and
  `plugins/codex/scripts/session-lifecycle-hook.mjs`.
- Useful invariant: runtime-owned code holds launch, readiness, lifecycle, and
  durable identity; session teardown leaves explicit broker/job cleanup rather
  than dropping in-flight work without a recorded end.
- Local adaptation: the hosted runner still owns Check and COMMENT writes.
  Automatic mismatch now leaves a cancelled Check on the bound SHA instead of
  discarding the request with no GitHub-visible terminal.
- Rejected or missing pattern: the donor's local session cleanup can tolerate
  termination failure before removing state. A hosted reviewer must not drop a
  bound SHA without durable Check evidence. This donor has no GitHub Check or
  exact-head App posting model.

### `xai-org/grok-build`

- Exact revisions: contract audit
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current-source check
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files:
  `crates/codegen/xai-grok-shell/src/session/acp_session_impl/tasks_cancel.rs`
  and `crates/codegen/xai-grok-shell/src/leader/lock.rs`.
- Useful invariant: cancellation is owner-scoped and leaves a terminal on the
  cancelled work; exclusive lock/identity is established before the external
  side effect.
- Local adaptation: `automatic_head_mismatch` still refuses COMMENT on a dead
  SHA and still does not call the authorized supersession fence. It now
  completes the bound-SHA Check as `cancelled` and names the live head so the
  newer `synchronize` request remains the owner of that head.
- Rejected or missing pattern: embedded ACP cancel and leader flock are not a
  GitHub App Check/review contract. Do not rebind a stale job to the live head
  or post COMMENT on a superseded SHA.

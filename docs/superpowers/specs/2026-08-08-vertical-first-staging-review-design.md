# Vertical-first staging review design

**Status:** Approved design for the first independent staging lifecycle.
Implementation and live mutation remain gated on a separate execution plan.

## Objective

Prove that `xliberty2008x/grok-review-xliberty` can independently host one real
installed-GitHub-App review before continuing the horizontal extraction plan.
The shortest honest proof is a compatibility transport of the known working
Worker, runner, and workflow, followed by one staging lifecycle through the
actual Grok provider and an accepted terminal receipt.

The vertical passes only when all of these boundaries complete for one safe,
non-draft pull request:

```text
staging Worker healthy
→ staging App installation reconciled in D1
→ signed pull_request webhook admitted with an outbox job
→ immutable control workflow dispatched and bound
→ runner re-authorized the exact live head
→ real Grok process launched and returned valid structured output
→ staging App published the exact-head Check and COMMENT review
→ authenticated callback committed the verified terminal receipt in D1
```

A visible review without terminal receipt reconciliation, or a successful
workflow without `provider_launched=true`, is incomplete.

## Frozen identities and selected source

- Independent target repository state before transport:
  `fa18627d2b612227f22456f3555d842986aa0fa2`.
- Transport source checkout:
  `/Users/cyrildubovik/Documents/grok-plugin-e2e` at
  `aee1171c2f346948feb2864784e13abe020dcb34`.
- Previously live runtime, retained only as provenance:
  `grok-review-runtime-ea3594fb1f7cc546ede6d3dca2282860e54b8721`.
- Node: `22.17.1`.
- Wrangler: lockfile-installed `4.120.0`.
- Grok: `0.2.112`, using frozen darwin/arm64 executable SHA-256
  `5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4`.
- Model and effort: `grok-4.5` and `high`.

The current extraction snapshot is the transport source because it contains
the sanitized Wrangler template and immutable-control-ref security fence. The
older runtime's live evidence does not transfer to the new repository. The new
copy remains unqualified until this design's real vertical reaches its final
milestone.

## Selected architecture

Add a temporary compatibility lane at the original paths, beside the partial
standalone architecture already committed through Task 4C. Do not overwrite or
rewire `apps/control-plane`, `apps/review-runner`, or the new workspace
packages. They remain preserved and dormant while the compatibility lane is
qualified.

Preserving the original directory layout avoids behavioral rewrites. The
transport includes:

- all Worker and runner modules under `apps/grok-review-app/src/`;
- the App prompts, review schema, manifest template, migration, and sanitized
  Wrangler template under `apps/grok-review-app/`;
- `.github/workflows/grok-review-app-worker.yml`;
- `scripts/ci/lib/build-pr-review-payload.mjs` and
  `scripts/ci/lib/diff-right-lines.mjs`;
- the static review-runner closure
  `plugins/grok/scripts/lib/{acp-client,errors,executable-identity,grok-provider,host,process-control,profiles,provider-bootstrap,provider-executable-pin,recursion-guard,redact,state,task-contract,worker-authority,worker-context,worker-execution-binding,worker-host-actions,worker-launch-contract,worker-roles,worker-worktree,workspace}.mjs`;
- `plugins/grok/schemas/review-output.schema.json`.

The copied JavaScript receives no import-layout rewrite. The only transport
adaptations are staging names and protected configuration outside tracked
files, the target commit/tag/archive identities, an ignore rule for the
rendered staging Wrangler file, and the required donor/provenance record.

Alternatives were rejected:

1. Wiring the copy into the new packages would resume Task 4D through Task 11
   before live proof.
2. Dispatching to the old `grok-plugin` workflow would not prove independent
   repository ownership.

## Staging topology

The first vertical uses only staging resources:

| Surface                     | Staging choice                                         |
| --------------------------- | ------------------------------------------------------ |
| Control repository          | New private `xliberty2008x/grok-review-xliberty`       |
| Runtime ref                 | `grok-review-runtime-<exact-target-commit>`            |
| Installed target            | Existing private `xliberty2008x/grok-review-app-e2e`   |
| GitHub App                  | New private `grok-review-xliberty-staging`             |
| Cloudflare Worker           | New `grok-review-xliberty-staging` workers.dev service |
| D1                          | New staging-only control database                      |
| Delivery tool               | Local lockfile-installed Wrangler `4.120.0`            |
| Durable infrastructure tool | None; Terraform is deliberately deferred               |

The existing production App, Worker, D1, repository workflows, secrets, auth
watcher, and traffic remain unchanged.

The new private repository initially uses repository-level Actions secrets and
variables because it contains only the staging compatibility workflow. No
production workflow or production secret is introduced during this vertical.
Environment separation and full repository governance return only after the
vertical passes. Before any secret-bearing dispatch, the runtime tag must be
protected from update and deletion. If the host cannot enforce that minimal
protection, stop rather than run from a mutable tag.

## Configuration and secret boundaries

Tracked files contain no deployed URL, account/database/App/installation ID,
credential, key, token, or secret value. A rendered staging Wrangler file sits
beside the tracked App template, is ignored, owned by the operator, and has
mode `0600`. It binds:

- `DB` to the new staging database;
- `CONTROL_REPO_OWNER=xliberty2008x`;
- `CONTROL_REPO_NAME=grok-review-xliberty`;
- `CONTROL_WORKFLOW_FILE=grok-review-app-worker.yml`;
- `CONTROL_REF=grok-review-runtime-<exact-target-commit>`;
- the staging `GITHUB_APP_ID`.

Worker secrets remain exactly:

- `WEBHOOK_SECRET`;
- `RUNNER_CALLBACK_SECRET`;
- `CONTROL_REPO_TOKEN`;
- `RECEIPT_PUBLIC_KEYS_JSON`.

Actions secrets remain exactly:

- `GROK_REVIEW_APP_PRIVATE_KEY`;
- `GROK_AUTH_JSON`;
- `RUNNER_CALLBACK_SECRET`;
- `RECEIPT_SIGNING_PRIVATE_KEY`.

Actions variables remain the frozen workflow contract:

- `GROK_REVIEW_APP_CLIENT_ID` and `GROK_REVIEW_APP_ID`;
- `GROK_REVIEW_WORKER_URL`;
- `GROK_REVIEW_RUNTIME_COMMIT` and
  `GROK_REVIEW_RUNTIME_BUNDLE_SHA256`;
- `GROK_CLI_VERSION=0.2.112`;
- `RECEIPT_SIGNING_PUBLIC_KEY`;
- `GROK_MODEL=grok-4.5` and `GROK_EFFORT=high`.

The webhook HMAC is shared only between the staging App and Worker. The
callback HMAC is shared only between the Worker and central workflow. The App
RSA key and receipt Ed25519 key remain separate. The Worker receives only the
receipt public-key map. Grok auth remains in the central workflow and is never
installed in the target repository.

Credential generation, entry, and external mutations remain main-agent or
operator actions; they are not delegated to implementation or review workers.

## Minimal staging sequence

1. Copy the exact compatibility closure from `aee1171…`, record both donor
   inspections, and verify source and target worktrees remain within their
   declared boundaries.
2. Commit the copy, create the private GitHub repository, push `main`, derive
   the exact target archive digest, create the matching runtime tag, and make
   the tag non-updatable and non-deletable before storing runtime secrets.
3. Activate exact Node `22.17.1`; use only the lockfile-installed Wrangler.
   Stop if Cloudflare account selection is ambiguous.
4. Create the staging D1 database. Render the ignored staging config. Require
   exactly `0001_init.sql` pending, then apply it.
5. Deploy a health-only staging Worker if the workers.dev origin is not known
   before registration. No App is installed during this bootstrap state.
6. Register the new private staging App from a secure manifest copy with OAuth
   on install disabled, exact webhook URL, exact five event subscriptions, and
   only Contents read, Pull requests write, Checks write, Issues read, and
   Metadata read.
7. Provision the paired staging keys, Worker secrets, and GitHub repository
   secrets/variables without printing protected values. Redeploy the fully
   configured Worker and require `/healthz` plus unauthenticated webhook and
   callback rejection through the main workers.dev origin.
8. Install the staging App only on `grok-review-app-e2e`. Require the real
   installation/repository-selection delivery to return `2xx` and D1 to show
   active authorization. Redeliver or reinstall if ingress was not ready; do
   not fabricate installation state.
9. Open one safe non-draft PR and follow the same request through every
   lifecycle milestone. Do not execute target code, hooks, workflows,
   submodules, package managers, tests, or project configuration.
10. Accept the vertical only after App-authored exact-head output and the
    authenticated terminal callback/receipt agree with the live PR head,
    workflow, Check, and review marker.

## Lifecycle reporting

Progress is the highest completed lifecycle milestone, not test count:

1. `staging_serving`
2. `installation_authorized`
3. `request_admitted`
4. `workflow_bound`
5. `runner_authorized`
6. `provider_completed`
7. `app_output_visible`
8. `terminal_receipt_committed`

Private evidence records the exact commit/tag/archive identity, Worker
deployment identity, GitHub delivery and run locators, PR base/head, App actor,
Check/review identities, `provider_launched=true`, structured-output validity,
callback acceptance, terminal D1 status, and receipt digest. It contains no
repository content, prompt, model output, credential, or secret value and is
kept under ignored `evidence/private/`.

## Failure-driven change policy

After the first live attempt begins, every change must map to the observed
failure, an explicit acceptance condition above, or a verified safety gap.

- Configuration or harness mismatch: correct coordinates, pairing,
  installation state, tag/digest, or runner selection without changing runtime
  semantics.
- External transient: let the same durable request recover or retry; do not
  create duplicate semantic work.
- Runtime defect: make the smallest runtime-code fix and add only a regression
  for that exact defect, then rerun the same PR immediately.
- Unknown cause: add only bounded, non-sensitive diagnostics that distinguish
  the remaining hypotheses.
- Repeated failure invalidating a frozen assumption: stop and reassess the
  compatibility transport instead of accumulating patches.

Never widen App permissions, expose secrets, weaken exact-head binding, bypass
receipt verification, or repoint the production App to make staging pass.

## Verification before the first live attempt

Pre-live verification is intentionally narrow:

- source commit and copied-file hashes;
- complete static relative-import closure plus the dynamically spawned
  `provider-bootstrap.mjs` runtime entry;
- clean source and bounded target diff;
- exact Node, Wrangler, Grok, workflow action, runtime-tag, and archive pins;
- scrubbed tracked configuration and ignored private rendered configuration;
- expected migration list and key-pair consistency;
- App permissions/events and installation scope.

These checks support the vertical but do not qualify it. Only the installed
external lifecycle does.

## Deferred work

Until `terminal_receipt_committed` succeeds, do not start:

- Task 4D or any later horizontal extraction slice;
- broad deterministic, parity, or evaluation expansion;
- Terraform or durable deployment-pipeline construction;
- production cutover, production credential work, rollback, soak, monitoring,
  retention automation, or legacy cleanup;
- manual-command, Check-rerun, supersession, cancellation, fork, instruction,
  known-defect/suggestion, replay, or ambiguous-posting qualification matrices.

After the vertical passes, its exact runtime behavior becomes the live
reference for resuming the standalone package extraction. The compatibility
lane remains available until a later, separately reviewed removal proves that
the new package architecture reproduces the same real lifecycle.

## Donor record

### `openai/codex-plugin-cc`

- Revision: `db52e28f4d9ded852ab3942cea316258ae4ef346`.
- Inspected files: marketplace/plugin manifests, `commands/review.md`,
  `broker-lifecycle.mjs`, and `session-lifecycle-hook.mjs`, as already recorded
  in `docs/provenance/donors.md`.
- Useful invariant: keep the installed integration thin while the trusted
  runtime owns lifecycle, identity, and durable terminal evidence.
- Local adaptation: the selected target repository installs only the staging
  App; the independent control repository owns the Worker and runner.
- Rejected or missing pattern: the donor's local best-effort cleanup and lack
  of hosted Cloudflare deployment are not used as service infrastructure.

### `xai-org/grok-build`

- Contract-audit revision:
  `47348d13ec4508dcfe440e34c6d511bb02998fb2`; current source inspected at
  `afbc0fb710320c7add294c2106d447ecc3e3af2e`.
- Inspected files: generated Grok package/launcher, owner-scoped cancellation,
  leader lock, and authentication storage, as already recorded in
  `docs/provenance/donors.md`.
- Useful invariant: attest one exact executable, isolate its auth home, scope
  cancellation to the owner, and terminate/reap within bounded lifecycle
  control.
- Local adaptation: the copied runner retains the frozen tool-free review and
  executable-attestation behavior for the first vertical.
- Rejected or missing pattern: embedded ACP is not treated as a remote-service
  architecture, and Grok Build supplies no GitHub App, D1, or deployment model.

This donor evidence constrains the transport; it does not qualify the live
staging lifecycle.

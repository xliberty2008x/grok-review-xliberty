# Production In-Place Cutover Design

**Status:** Approved execution direction from the user’s production-ready E2E
and replacement request.

## Outcome

`xliberty2008x/grok-review-xliberty` becomes the sole active source,
release, runner, operations, and credential-watcher home for the hosted
`grok-review-xliberty` GitHub App. The existing production App identity,
webhook origin, Worker service, D1 database, and selected-repository
installations stay in place. No second App is installed across production
repositories.

The cutover is complete only after a real production-App request is admitted
by the existing Worker and D1, dispatched to an immutable standalone tag,
launches the real Grok provider, publishes an exact-head App Check and COMMENT
review, and commits a verified terminal receipt. Only then may the active
hosted-bot workflow, code, tests, operations material, auth watcher, secrets,
variables, and bot-specific mentions be removed from `grok-plugin`.

## Current evidence

- Standalone `main` is clean at
  `094f1b8f97b0e9472d9d5dca0a2b04e73f97957a` and its first immutable staging
  tag completed the real lifecycle through `terminal_receipt_committed`.
- The compatibility Worker, runner, and workflow are the frozen working
  implementation copied from `grok-plugin`; they are not redesigned during
  this cutover.
- The first standalone release contains no binary assets. Its workflow still
  installs `@xai-official/grok@0.2.112` from the registry on every run and
  labels that path prototype-only.
- The production D1 read on 2026-08-09 showed zero active bound requests, zero
  active unbound requests, and no pending or leased outbox jobs. The switch
  must repeat this read immediately before traffic changes.
- The production callback HMAC has no recoverable operator source copy.
  Overwriting it without overlap would strand any old runner callback.
- The production receipt public key is readable from the old repository
  variable, while its private key remains write-only. The Worker already
  supports a multi-key receipt map.
- The standalone repository has no GitHub environments. Staging and production
  App/callback/receipt credentials therefore need static environment
  separation before production use.

## Architecture

### 1. Preserve the working runtime

Keep `apps/grok-review-app/**`, the copied provider closure, and the exact
seven-input dispatch contract. Do not resume the horizontal control-plane
rewrite before production E2E succeeds.

The runner continues to check out the immutable runtime tag and recompute the
SHA-256 of `git archive <commit>`. This digest remains
`GROK_REVIEW_RUNTIME_BUNDLE_SHA256` and is recorded in the terminal receipt.

Replace only the registry install step. A release contains a raw executable
asset named `grok-0.2.112-darwin-arm64` with:

- platform `darwin`;
- architecture `arm64`;
- size `129363664` bytes;
- SHA-256
  `5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4`;
- package-integrity digest
  `49862ac444a3ca9db560cac29c96b5f2503b4b004a61ac9ac64a558842398143`;
- package git commit `9bbd559437aaef77f2830978da7fcc8f59b07e33`.

The workflow downloads that exact asset from its own immutable release using
the job’s read-only `GITHUB_TOKEN`, verifies one bounded regular file, exact
size, and exact SHA-256, applies mode `0500`, and then runs the existing
`attestLocalGrok()` release-identity check. It performs no npm install.

`release/grok-runtime-v1.json`, `scripts/build-release.mjs`, and
`scripts/verify-release.mjs` own the repeatable asset contract. The builder
accepts an already-obtained pinned executable; it never resolves `latest` or
downloads an executable itself. The verifier checks the manifest, asset,
runtime archive digest, and immutable tag inputs.

The root `check` command is made truthful for the compatibility lane. It runs
formatting, the existing deterministic suite, syntax/import checks, and the
release verifier. Speculative commands whose files do not exist are removed
instead of filling the repository with unrelated policy/evaluation
infrastructure.

### 2. Static staging and production runners

Create two static dispatch workflows:

- `.github/workflows/grok-review-app-worker-staging.yml`, bound to GitHub
  environment `review-staging-runtime`;
- `.github/workflows/grok-review-app-worker-production.yml`, bound to GitHub
  environment `review-production-runtime`.

Both expose the same seven required `workflow_dispatch` inputs and call the
same committed runner. Their environment names are literal, not input-driven.
Each environment accepts only immutable `grok-review-runtime-*` tags.

Environment secrets isolate the App RSA key, callback HMAC, and receipt
private key. Environment variables isolate App IDs, Worker origin, receipt
public key, runtime commit, runtime archive digest, Grok executable asset
digest, model, effort, and version. `GROK_AUTH_JSON` remains one standalone
repository secret because both environments intentionally use the same
operator-owned Grok session and the existing hardened watcher writes a
repository secret.

The staging Worker points to the staging workflow; the production Worker
points to the production workflow. The temporary control token may authorize
workflow dispatch in both old and new control repositories during the rollback
window. After standalone-only rollback is proven, replace it with a token
limited to `grok-review-xliberty`.

### 3. Cutover bridge with one additive D1 gate

Add two small runtime controls to the compatibility Worker:

1. Migration `0002_control_state.sql` adds exactly one singleton
   `control_state` row with a boolean dispatch pause and monotonically
   increasing cutover epoch. It does not alter or delete existing request,
   outbox, installation, delivery, nonce, or receipt rows. While paused,
   webhook admission may persist a request and durable outbox job, but webhook
   best-effort drain, cron drain, cancellation, and watchdog work do not lease
   or execute jobs. A leased dispatch rechecks the durable pause and epoch
   immediately before its bounded GitHub network operation. Health reports
   only the durable pause state, epoch, and configured runtime commit.
2. Callback verification accepts the existing primary
   `RUNNER_CALLBACK_SECRET` and an optional
   `RUNNER_CALLBACK_SECRET_NEXT`. A callback is authorized when its exact
   timestamp, nonce, and body verify against either valid configured secret.
   Logs never reveal which key matched. Invalid or malformed key configuration
   fails closed.

The bridge is qualified in staging with focused regression coverage for the
pause and dual-key safety gaps, followed by the same real installed-App
vertical. No other new test infrastructure is introduced.

Production bridge order:

1. Capture the exact active Worker version privately and snapshot D1 status,
   outbox state, workflow-run activity, bindings, and secret names.
2. Render ignored
   `apps/grok-review-app/wrangler.rendered.production.jsonc` from the private
   Phase-0 production config. It must retain the exact existing service name,
   account, workers.dev setting, cron, D1 binding name/database name/database
   ID, compatibility date, and non-secret bindings. Only the entry source,
   runtime identity, durable-gate support, and later explicit control-route
   values may differ. Run the pinned Wrangler `4.120.0` dry-run against this
   file and reject the all-zero tracked placeholder database ID.
3. Apply `0002_control_state.sql` to the exact existing production `DB` binding,
   prove every pre-existing table count and schema digest except for the new
   table is unchanged, and initialize `paused=0` at epoch `1`. The old Worker
   ignores this additive table and remains the rollback target.
4. Deploy the exact staging-qualified bridge with pinned local Wrangler:
   `node_modules/wrangler/bin/wrangler.js deploy --config
apps/grok-review-app/wrangler.rendered.production.jsonc --keep-vars`. The
   config names the existing Worker and D1; no `--name` or database override is
   accepted at execution time. Compare post-deploy service-name, origin,
   workers.dev, cron, D1-coordinate digest, secret-name set, and every
   non-secret binding against the snapshot, allowing only the documented
   runtime/gate additions. Keep the
   old control repository/ref/token and durable gate `paused=0` at epoch `1`.
5. Add a newly generated callback HMAC as
   `RUNNER_CALLBACK_SECRET_NEXT` and write that value only to the standalone
   production environment. Do not overwrite the old repository’s callback
   secret: old runners continue signing with the unrecoverable old primary,
   while new runners sign with the known next key and the bridge accepts both.
6. Build a receipt public-key map containing the readable old production
   public key and the newly generated standalone production public key. Keep
   the old private signer in the old repository and the new private signer
   only in the standalone production environment.
7. Create a new RSA private key for the existing production GitHub App and
   store it only in the standalone production environment. The App ID,
   installation scope, webhook secret, webhook URL, and App identity do not
   change.
8. Increment the durable cutover epoch and set `paused=1` through the fixed
   private D1 operator command. New webhook work may accumulate durably but
   cannot dispatch. Every GitHub fetch used by outbox processing has an
   explicit bounded timeout. Wait for the complete timeout budget plus longer
   than the 60-second outbox lease, then require zero active bound requests,
   zero leased jobs, zero running old control workflows, and no change in the
   old workflow-run list across a second observation interval. This fences an
   invocation that read the prior epoch before the pause.
9. Change only the Worker control owner/repository/workflow/ref/token to the
   standalone production workflow and exact immutable tag.
10. Increment the durable epoch again and set `paused=0`. Pending unbound work
    drains through the new control repository.

No destructive D1 migration, webhook repoint, App reinstall, or new production
Worker is part of this design.

### 4. Real production qualification

Use the existing production App installation on
`xliberty2008x/grok-review-app-e2e`. Create one inert text-only branch and
non-draft PR. The production milestone is complete only when all of these are
directly observed:

- the existing production App delivery is accepted by the unchanged Worker
  origin;
- the request is admitted in the existing production D1;
- the bound workflow URL belongs to
  `xliberty2008x/grok-review-xliberty` at the exact immutable release tag;
- the runner authorizes the exact live PR head and launches the real provider;
- the production App publishes the exact-head `Grok review` Check;
- the production App publishes a native COMMENT review;
- the Ed25519 receipt verifies under the new receipt key and is committed as a
  terminal D1 row;
- the old `grok-plugin` worker workflow run list has not advanced since the
  switch.

One manual `@grok-review review` trigger on the same PR provides a second real
terminal receipt before destructive cleanup. Failures are classified from the
live boundary and receive only the smallest runtime fix plus a regression for
that observed failure.

### 5. Rollback and normalization

Before callback normalization, rollback is the captured pre-cutover Worker
version plus the old immutable control tag. Because the old repository callback
secret was never overwritten, that Worker and runner pair remains compatible.
A rollback begins by setting the durable D1 gate to paused, waiting for zero
active bound runs on the new route and the bounded stale-dispatch interval,
rolling the Worker back, confirming health and unchanged D1, and then
unpausing. The additive control table may remain; D1 is never restored or
replaced.

After production automatic and manual lifecycles pass:

1. write the known new callback HMAC to primary
   `RUNNER_CALLBACK_SECRET` and remove `RUNNER_CALLBACK_SECRET_NEXT`;
2. shrink `RECEIPT_PUBLIC_KEYS_JSON` to the new public key after every old
   snapshotted request is terminal;
3. replace the dual-repository control token with a standalone-only token;
4. deploy and health-check two consecutive Worker versions whose bindings are
   standalone-only, and prove rollback between those versions;
5. run one final production canary through the normalized version.

Those two versions become the post-cleanup rollback pair. The old repository
is no longer required for a functional rollback.

### 6. Move operations ownership and remove the old host

Before the production release, copy the hardened auth sync and installer,
their test, App README, App operations runbook, and four App test suites into
the standalone repository. This is a mechanical ownership move of existing
production material, not a new test framework. Install the standalone watcher for
`xliberty2008x/grok-review-xliberty`, force one sync, and require status
`loaded` and `current`. Only then uninstall the old watcher.

After the normalized production canary and watcher proof, remove from current
`grok-plugin` main:

- `.github/workflows/grok-review-app-worker.yml`;
- the complete `apps/grok-review-app/` tree;
- the four `tests/grok-review-app-*.test.mjs` suites;
- `docs/operations/private-grok-review-app.md`;
- `scripts/sync-grok-ci-auth.mjs` and
  `scripts/install-grok-ci-auth-sync.mjs`;
- `tests/ci-auth-sync.test.mjs` and the four `grok:ci-auth:*` package scripts;
- App-only validation/shard entries and bot-specific README/CONTRIBUTING text;
- old repository Actions secrets and variables used only by the hosted App.

Also revoke the old production GitHub App RSA key in App settings after the new
key has completed the normalized canary. Deleting the old repository secret is
not treated as key revocation.

Preserve generic Grok Companion provider, review, rescue, setup, worker,
schema, and generic CI-review surfaces. In particular, keep
`plugins/grok/**`, `scripts/ci/run-trusted-review.mjs`,
`scripts/ci/post-grok-review.mjs`, and their generic tests. Replace the one
generic provider test’s App-schema fixture with a local test-only schema.

The final current-tree search in `grok-plugin` must have no hosted-bot paths,
workflow names, environment/secret names, or `grok-review-xliberty` App
operations references. Normal Git history and generic uses of the word
“review” are not rewritten.

Cleanup is not the final milestone. After the old workflow, secrets, variables,
watcher, and App key are absent, pause on the durable gate and roll from
standalone-only Worker version A to standalone-only version B. Unpause and run
a real production manual-review canary to a verified terminal receipt. Then
roll back to version A under the same gate and run a second terminal canary.
Neither run may create activity in `grok-plugin`. This is the post-cleanup proof
that both active service and rollback are independent of old-host authority.

## Failure behavior

- Release asset mismatch: runner stops before credentials or provider launch.
- Staging vertical failure: production remains unchanged.
- Production pre-switch drain failure: remain paused or restore the old
  unpaused bridge; do not switch repositories. A stale old workflow appearance
  resets the bounded observation interval.
- Production health failure after deploy: use the captured Worker version;
  D1 remains untouched.
- New workflow or callback failure: pause, drain any bound run to terminal or
  cancel it through its repository, then roll back.
- Production output or receipt mismatch: do not clean the old repository or
  normalize old trust material.
- Standalone watcher not current: keep the old watcher and old secrets.
- Cleanup validation failure: fix only the old-host removal diff; production
  remains on the already-qualified standalone path.

## Completion evidence

The goal is complete only when current evidence proves:

1. an immutable standalone release contains and verifies the pinned Grok
   executable asset;
2. staging again reaches `terminal_receipt_committed` with no npm install;
3. production D1 and Worker identity are preserved;
4. the existing production App completes automatic and manual real reviews
   through standalone workflows and verified receipts;
5. old workflow activity remains unchanged after the switch;
6. normalized Worker bindings and rollback versions require only the
   standalone repository;
7. the standalone auth watcher is loaded and current;
8. current `grok-plugin` main contains no hosted review-bot ownership or
   credentials while all generic Grok Companion and CI-review validation is
   green;
9. after old-host cleanup and old App-key revocation, both standalone-only
   Worker versions complete a real production canary without any old-repo
   workflow activity.

## Explicitly deferred

- Terraform ownership of the existing Worker or D1;
- a new production Worker, D1, custom domain, or webhook URL;
- broad dashboards, automated soak infrastructure, or retention changes;
- Task 4D+ horizontal package extraction;
- policy-evaluation scaffolding unrelated to an observed live failure.

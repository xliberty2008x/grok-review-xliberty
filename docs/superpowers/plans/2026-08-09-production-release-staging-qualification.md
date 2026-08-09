# Production Release and Staging Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the proven standalone compatibility runtime into an immutable,
prebuilt production release and complete the same real installed-App staging
lifecycle without a per-run npm install.

**Architecture:** Preserve the frozen Worker and runner behavior. Add only the
release asset boundary, static staging/production workflow wrappers, an
additive durable D1 cutover gate, and dual callback verification needed for the
later in-place cutover. Move existing App operations/tests into the standalone
repository, publish one exact release, deploy it only to staging, and require a
new terminal receipt before any production mutation.

**Tech Stack:** Node.js `22.17.1`, npm workspaces, GitHub Actions and
environments, immutable GitHub Releases, Cloudflare Worker + D1, Wrangler
`4.120.0`, JavaScript ESM, Ed25519 receipts, HMAC-SHA256 callbacks.

## Global Constraints

- Production App, Worker, D1, webhook, credentials, control route, and traffic
  remain unchanged throughout this plan.
- Preserve the compatibility runtime copied from
  `/Users/cyrildubovik/Documents/grok-plugin-e2e` at source commit
  `aee1171c2f346948feb2864784e13abe020dcb34`, except for the exact release and
  bridge changes named here.
- Preserve the source checkout’s current branch, HEAD, tracked diff, and three
  pre-existing untracked paths byte-for-byte.
- Use only project-local Wrangler `4.120.0` under exact Node `22.17.1`; never
  use `npx` for deployment.
- Stable tracked files contain no account IDs, database IDs, Worker origins,
  App IDs, installation IDs, repository IDs, tokens, private keys, callback
  HMACs, webhook HMACs, auth JSON, or rendered environment configuration.
- Use ignored mode-`0600` rendered Wrangler files and mode-`0700` evidence
  directories for live coordinates and receipts.
- Add no Terraform, dashboard, soak, policy-evaluation framework, Task 4D+
  horizontal extraction, or unrelated deterministic suite.
- Every runtime/test change maps to the release boundary, durable pause,
  callback overlap, or an observed real staging failure.
- Report progress by the highest real milestone:
  `release_asset_verified`, `staging_serving`, `request_admitted`,
  `workflow_bound`, `provider_completed`, `app_output_visible`, or
  `terminal_receipt_committed`.

### Normative fresh-shell prologue

Every later fenced `bash` fragment in this plan runs in a fresh shell. Prepend the
following prologue verbatim to every fragment before executing it; no fragment
may inherit variables or a working directory from an earlier fragment:

```bash
set -euo pipefail
umask 077
TARGET_ROOT="$(git rev-parse --show-toplevel)"
test "$TARGET_ROOT" = "/Users/cyrildubovik/Documents/grok-review-xliberty"
cd "$TARGET_ROOT"
NODE22="$TARGET_ROOT/evidence/private/vertical-staging/toolchains/node-v22.17.1-darwin-arm64/bin/node"
WRANGLER_JS="$TARGET_ROOT/node_modules/wrangler/bin/wrangler.js"
test -x "$NODE22"
test "$("$NODE22" --version)" = "v22.17.1"
test -f "$WRANGLER_JS"
test "$("$NODE22" -p 'require("./node_modules/wrangler/package.json").version')" = "4.120.0"
REPO="xliberty2008x/grok-review-xliberty"
SOURCE="/Users/cyrildubovik/Documents/grok-plugin-e2e"
test -d "$SOURCE/.git"
RUNTIME_SHA="$(git rev-parse HEAD)"
test "$(printf '%s' "$RUNTIME_SHA" | wc -c | tr -d ' ')" = "40"
TAG="grok-review-runtime-$RUNTIME_SHA"
PRIVATE_ROOT="$TARGET_ROOT/evidence/private/production-release"
```

Task-specific paths are derived again after this prologue. A command that
needs a release output creates a new mode-`0700` `mktemp` directory and uses
that path through build, verification, and upload in the same shell fragment.
It never discovers an output with `find`, reuses a previous directory, or
relies on a variable from another command invocation.

---

## File responsibility map

| Path                                                                           | Responsibility                                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `release/grok-runtime-v1.json`                                                 | Closed identity of the raw pinned Grok executable asset                                  |
| `release/THIRD_PARTY_NOTICES.md`                                               | Attribution and package notice retained with the private release                         |
| `scripts/build-release.mjs`                                                    | Copy the verified binary, license, and notice into a private release directory           |
| `scripts/verify-release.mjs`                                                   | Verify all release assets, git-archive digest, commit, and platform and emit the receipt |
| `apps/grok-review-app/migrations/0002_control_state.sql`                       | Add the singleton durable pause/epoch gate without changing existing rows                |
| `apps/grok-review-app/src/db.mjs`                                              | Read and recheck the durable gate and current outbox lease                               |
| `apps/grok-review-app/src/outbox.mjs`                                          | Refuse lease/network work while paused and recheck epoch before GitHub calls             |
| `apps/grok-review-app/src/callback.mjs`                                        | Verify callbacks against primary and optional next HMAC                                  |
| `apps/grok-review-app/src/index.mjs`                                           | Expose sanitized gate/runtime health                                                     |
| `.github/workflows/grok-review-app-worker-{staging,production}.yml`            | Static environment-bound dispatch entries using the same runner                          |
| `scripts/{sync-grok-ci-auth,install-grok-ci-auth-sync}.mjs`                    | Standalone ownership of the existing hardened auth watcher                               |
| `tests/grok-review-app-*.test.mjs`, `tests/ci-auth-sync.test.mjs`              | Existing production App and watcher regression ownership                                 |
| `apps/grok-review-app/README.md`, `docs/operations/private-grok-review-app.md` | Standalone service and recovery ownership                                                |

### Task 1: Move existing App operations and regression ownership

**Files:**

- Create from exact donor bytes: `apps/grok-review-app/README.md`
- Create from exact donor bytes: `docs/operations/private-grok-review-app.md`
- Create from exact donor bytes: `scripts/sync-grok-ci-auth.mjs`
- Create from exact donor bytes: `scripts/install-grok-ci-auth-sync.mjs`
- Create from exact donor bytes: `tests/ci-auth-sync.test.mjs`
- Create from exact donor bytes: `tests/grok-review-app-worker.test.mjs`
- Create from exact donor bytes: `tests/grok-review-app-github.test.mjs`
- Create from exact donor bytes: `tests/grok-review-app-runner.test.mjs`
- Create from exact donor bytes: `tests/grok-review-app-target-collector.test.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/provenance/donors.md`

**Interfaces:**

- Consumes: exact files from source commit
  `aee1171c2f346948feb2864784e13abe020dcb34`.
- Produces: standalone-owned App operations, auth watcher commands, and the
  four existing App regression suites without semantic rewrites.

- [ ] **Step 1: Capture source and target preservation fingerprints**

Run from the target:

```bash
SOURCE=/Users/cyrildubovik/Documents/grok-plugin-e2e
git status --porcelain=v2 > /tmp/grok-review-target-before.status
git -C "$SOURCE" rev-parse HEAD > /tmp/grok-review-source-before.head
git -C "$SOURCE" status --porcelain=v2 > /tmp/grok-review-source-before.status
git -C "$SOURCE" diff --binary > /tmp/grok-review-source-before.diff
git -C "$SOURCE" diff --cached --binary > /tmp/grok-review-source-before.cached.diff
```

Expected: target contains only the committed design; source HEAD is exact
`aee1171c2f346948feb2864784e13abe020dcb34` and its three known untracked paths
remain visible.

- [ ] **Step 2: Add exact donor-owned files**

For each path below, set `PATH_TO_COPY` to that literal path, obtain the bytes
with `git -C "$SOURCE" show
aee1171c2f346948feb2864784e13abe020dcb34:$PATH_TO_COPY`, and add those exact
bytes with `apply_patch`:

```text
apps/grok-review-app/README.md
docs/operations/private-grok-review-app.md
scripts/sync-grok-ci-auth.mjs
scripts/install-grok-ci-auth-sync.mjs
tests/ci-auth-sync.test.mjs
tests/grok-review-app-worker.test.mjs
tests/grok-review-app-github.test.mjs
tests/grok-review-app-runner.test.mjs
tests/grok-review-app-target-collector.test.mjs
```

Expected: `shasum -a 256` matches source for every copied path. Do not adapt
imports: their original relative paths already resolve in the compatibility
layout.

- [ ] **Step 3: Make package commands truthful**

Modify `package.json` scripts to the exact compatibility-lane shape:

```json
{
  "test": "node --test",
  "test:app": "node --test tests/grok-review-app-worker.test.mjs tests/grok-review-app-github.test.mjs tests/grok-review-app-runner.test.mjs tests/grok-review-app-target-collector.test.mjs tests/ci-auth-sync.test.mjs",
  "format:check": "prettier --check package.json README.md docs/superpowers",
  "grok:ci-auth:sync": "node scripts/sync-grok-ci-auth.mjs",
  "grok:ci-auth:install": "node scripts/install-grok-ci-auth-sync.mjs install",
  "grok:ci-auth:status": "node scripts/install-grok-ci-auth-sync.mjs status",
  "grok:ci-auth:uninstall": "node scripts/install-grok-ci-auth-sync.mjs uninstall",
  "check": "npm run format:check && npm test"
}
```

Keep `scripts/verify-ported-tests.mjs` available, but remove the unscoped
`check:ported-tests`, missing policy-eval, missing boundary/pin/secret, and
unimplemented release commands from the aggregate gate until their files
exist. Task 2 adds the release commands after creating them.

- [ ] **Step 4: Update standalone ownership documentation**

Add a concise README section stating:

```markdown
## Hosted review service

This private repository owns the `grok-review-xliberty` Worker, immutable
Actions runner, App operations, release assets, and Grok auth watcher. Target
repositories install the GitHub App; they do not copy this workflow or store
its provider credential.
```

Append a donor record with exact source commit, the nine copied paths, the
invariant “operations and regression ownership move before old-host removal,”
the local adaptation “repository name only,” and rejected pattern “do not keep
the watcher owned by a checkout that will be deleted.”

In `apps/grok-review-app/README.md` and
`docs/operations/private-grok-review-app.md`, replace operational checkout,
control-repository, watcher, and workflow references from
`xliberty2008x/grok-plugin` to `xliberty2008x/grok-review-xliberty`. Preserve
the existing production App identity, Worker/D1 reuse, security invariants,
and recovery procedure. Do not describe the old repository as an ongoing
runtime dependency.

- [ ] **Step 5: Run the moved suites under exact Node**

```bash
NODE22=evidence/private/vertical-staging/toolchains/node-v22.17.1-darwin-arm64/bin/node
PATH="$(dirname "$NODE22"):$PATH" npm run test:app
```

Expected: all mechanically moved suites pass. A failure caused solely by a
standalone repository-name/workflow-path expectation receives one explicit
compatibility delta; production assertions are not weakened.

- [ ] **Step 6: Verify source preservation and commit**

```bash
test "$(git -C "$SOURCE" rev-parse HEAD)" = "$(cat /tmp/grok-review-source-before.head)"
git -C "$SOURCE" diff --exit-code
git -C "$SOURCE" diff --cached --exit-code
diff -u /tmp/grok-review-source-before.status <(git -C "$SOURCE" status --porcelain=v2)
git diff --check
git add package.json README.md docs/provenance/donors.md \
  apps/grok-review-app/README.md docs/operations/private-grok-review-app.md \
  scripts/sync-grok-ci-auth.mjs scripts/install-grok-ci-auth-sync.mjs \
  tests/ci-auth-sync.test.mjs tests/grok-review-app-*.test.mjs
git commit -m "chore: move review service ownership"
```

### Task 2: Add the pinned release asset contract

**Files:**

- Create: `release/grok-runtime-v1.json`
- Create: `release/THIRD_PARTY_NOTICES.md`
- Create: `scripts/build-release.mjs`
- Create: `scripts/extract-grok-package.mjs`
- Create: `scripts/verify-release.mjs`
- Create: `tests/release/release-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: an absolute path to an already-obtained raw Grok executable and a
  clean runtime commit.
- Produces:
  - `_extractVerifiedPackage(...)` and CLI
    `extract-grok-package.mjs --package-tarball ABS --out ABS`, which verify the
    exact script-disabled platform tarball, its upstream notice, and the raw
    Brotli-decoded executable without invoking package lifecycle code;
  - `buildRelease({runtimeRoot, commit, grokBinary, outDir}) -> Promise<object>`;
  - `verifyRelease({runtimeRoot, commit, assetPath, licensePath, noticePath,
manifestPath}) -> Promise<object>`;
  - CLI `build-release.mjs --runtime-root ABS --commit SHA --grok-bin ABS
--out-dir ABS`;
  - CLI `verify-release.mjs --runtime-root ABS --commit SHA --asset ABS
--license ABS --notice ABS --manifest ABS`.
  - CLI `verify-release.mjs --manifest-only --manifest ABS` for source checks.

- [ ] **Step 1: Write RED release-contract tests**

Create tests that assert:

```js
assert.equal(manifest.schema_version, 1);
assert.equal(manifest.asset.name, "grok-0.2.112-darwin-arm64");
assert.equal(manifest.asset.size, 129363664);
assert.equal(
  manifest.asset.sha256,
  "5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4",
);
await assert.rejects(
  verifyRelease({ ...valid, assetPath: wrongBytes }),
  /release_asset_(?:size|digest)_mismatch/,
);
await assert.rejects(
  buildRelease({ ...valid, commit: "0".repeat(40) }),
  /runtime_commit_mismatch/,
);
```

Also assert that output directories must be absolute, real, owned, mode
`0700`, not symlinks, and initially empty; asset publication uses exclusive
creation and mode `0500`; output license/notice files use mode `0600`; the
release scripts never invoke npm, curl, gh, or a network URL. The extractor
must reject an untrusted tar binary, a changed package, a changed upstream
notice, and any existing output path.

- [ ] **Step 2: Run RED**

```bash
NODE22=evidence/private/vertical-staging/toolchains/node-v22.17.1-darwin-arm64/bin/node
"$NODE22" --test tests/release/release-contract.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `scripts/build-release.mjs`,
`scripts/extract-grok-package.mjs`, or `scripts/verify-release.mjs`.

- [ ] **Step 3: Add the closed manifest and notice**

Create `release/grok-runtime-v1.json` with exact keys:

```json
{
  "schema_version": 1,
  "asset": {
    "name": "grok-0.2.112-darwin-arm64",
    "version": "0.2.112",
    "platform": "darwin",
    "arch": "arm64",
    "size": 129363664,
    "sha256": "5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4",
    "package_integrity_sha256": "49862ac444a3ca9db560cac29c96b5f2503b4b004a61ac9ac64a558842398143",
    "package_git_commit": "9bbd559437aaef77f2830978da7fcc8f59b07e33",
    "platform_package_name": "@xai-official/grok-darwin-arm64",
    "platform_package_tarball_size": 37094207,
    "platform_package_tarball_sha256": "36f4aedb29affafaca63bb47be8cf3f918fc2350ff6920d43b5e473ab22b327f",
    "platform_package_integrity_sha256": "633371990f1ed70635bfd160ba56545b344d9d3c4dfa74c9afebe4513dba3086",
    "platform_package_member": "package/bin/grok.br",
    "platform_package_notice_member": "package/THIRD_PARTY_NOTICES.md",
    "platform_package_notice_size": 7995
  },
  "notice": {
    "source_path": "release/THIRD_PARTY_NOTICES.md",
    "asset_name": "THIRD_PARTY_NOTICES.md",
    "sha256": "e8785a6098a7ee780cd2db35745b8e53061cfb1b6da19147a308579466ea4e50"
  },
  "license": {
    "spdx": "Apache-2.0",
    "source_path": "LICENSE",
    "asset_name": "Apache-2.0.txt",
    "sha256": "f342b45da3700cc2a823c3843b31ce55307824fb5f7e84e1de39bf8e19deb9bf"
  }
}
```

Copy `package/THIRD_PARTY_NOTICES.md` byte-for-byte from the verified platform
tarball. It is 7,995 bytes with SHA-256
`e8785a6098a7ee780cd2db35745b8e53061cfb1b6da19147a308579466ea4e50`.
Do not replace the vendor notice with a project-authored summary.

The package tarball contains no separate LICENSE file, so the builder copies
the repository’s exact Apache-2.0 `LICENSE` bytes to output asset
`Apache-2.0.txt`. The builder also copies the notice into the output directory.
Manifest-only verification hashes the two tracked source files. Full
verification hashes the output binary, license, and notice against their
closed manifest records.

- [ ] **Step 4: Implement secure build and verification**

Implement the exported functions with `node:fs`, `node:path`, `node:crypto`,
and `spawnSync("git", ["-C", runtimeRoot, "archive", "--format=tar", commit])`.
Use the same manifest constants in both modules. Verification must:

```js
if (stat.size !== manifest.asset.size)
  throw code("release_asset_size_mismatch");
if (sha256File(assetPath) !== manifest.asset.sha256) {
  throw code("release_asset_digest_mismatch");
}
if (gitHead(runtimeRoot) !== commit) throw code("runtime_commit_mismatch");
return Object.freeze({
  commit,
  runtime_archive_sha256: sha256(gitArchive(runtimeRoot, commit)),
  asset_sha256: manifest.asset.sha256,
  asset_size: manifest.asset.size,
  asset_name: manifest.asset.name,
  license_sha256: manifest.license.sha256,
  notice_sha256: manifest.notice.sha256,
});
```

Reject extra manifest keys, noncanonical commits, wrong platform/arch/version,
symlinks, group/world-writable files, output paths outside the caller’s
absolute directory, and output overwrite.

- [ ] **Step 5: Make the root release gate executable**

Set scripts:

```json
"release:prepare": "node scripts/build-release.mjs",
"release:verify": "node scripts/verify-release.mjs",
"release:verify:manifest": "node scripts/verify-release.mjs --manifest-only --manifest release/grok-runtime-v1.json",
"format:check": "prettier --check package.json README.md release/grok-runtime-v1.json scripts/build-release.mjs scripts/extract-grok-package.mjs scripts/verify-release.mjs tests/release docs/superpowers",
"check": "npm run format:check && npm test && npm run release:verify:manifest"
```

The live asset path is intentionally passed to `release:verify`; the normal
source-only `check` does not pretend a 129-MiB private release input exists.

- [ ] **Step 6: Run GREEN and commit**

```bash
"$NODE22" --test tests/release/release-contract.test.mjs
PATH="$(dirname "$NODE22"):$PATH" npm test
./node_modules/.bin/prettier --check release/grok-runtime-v1.json \
  scripts/build-release.mjs scripts/extract-grok-package.mjs scripts/verify-release.mjs \
  tests/release/release-contract.test.mjs package.json
git diff --check
git add release scripts/build-release.mjs scripts/extract-grok-package.mjs \
  scripts/verify-release.mjs \
  tests/release/release-contract.test.mjs package.json
git commit -m "feat: define immutable Grok runtime asset"
```

The formatting command uses the lockfile-installed Prettier only; it performs
no registry install.

### Task 3: Add the durable pause epoch and callback-key overlap

**Files:**

- Create: `apps/grok-review-app/migrations/0002_control_state.sql`
- Modify: `apps/grok-review-app/src/constants.mjs`
- Modify: `apps/grok-review-app/src/db.mjs`
- Modify: `apps/grok-review-app/src/outbox.mjs`
- Modify: `apps/grok-review-app/src/callback.mjs`
- Modify: `apps/grok-review-app/src/index.mjs`
- Modify: `tests/grok-review-app-worker.test.mjs`
- Modify: `docs/provenance/donors.md`

**Interfaces:**

- Produces:
  - `getControlState(d1) -> Promise<{paused:boolean, epoch:number}>`;
  - `mayExecuteLeasedOutboxJob(d1, {jobId, leaseOwner, epoch}) ->
Promise<boolean>`;
  - `callbackSecrets(env) -> string[]` internal closed key list;
  - health JSON `{ok,service,runtime_commit,dispatch_paused,cutover_epoch}`.

- [ ] **Step 1: Write RED safety tests**

Add focused tests for:

```js
// Paused before leasing: no repair, lease, fetch, cancel, or watchdog call.
assert.deepEqual(await processOutbox(pausedEnv), zeroOutboxStats);
assert.equal(githubFetchCount, 0);

// Epoch changes after lease: the pre-network recheck rejects the stale job.
assert.equal(
  await mayExecuteLeasedOutboxJob(db, {
    jobId: "1",
    leaseOwner: "worker:a",
    epoch: 7,
  }),
  false,
);
assert.equal(githubFetchCount, 0);

// Either primary or next callback HMAC succeeds; unknown succeeds under none.
assert.equal((await signedCallback(primary)).status, 200);
assert.equal((await signedCallback(next)).status, 200);
assert.equal((await signedCallback(unknown)).status, 401);
```

Also require missing/malformed control state to fail paused, malformed optional
next secret to return `500 misconfigured`, both HMAC verifications to execute
when both keys exist, and health to expose no repository coordinate or secret
name/value.

- [ ] **Step 2: Run RED**

```bash
"$NODE22" --test tests/grok-review-app-worker.test.mjs \
  --test-name-pattern="control state|cutover epoch|callback key overlap|health gate"
```

Expected: missing migration/export/behavior failures before production edits.

- [ ] **Step 3: Add the additive migration**

Create exact SQL:

```sql
CREATE TABLE IF NOT EXISTS control_state (
  state_key TEXT PRIMARY KEY NOT NULL CHECK (state_key = 'dispatch_gate'),
  paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
  epoch INTEGER NOT NULL CHECK (epoch >= 1),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO control_state (state_key, paused, epoch, updated_at)
VALUES ('dispatch_gate', 0, 1, '1970-01-01T00:00:00.000Z');
```

No `DROP`, `DELETE`, trigger, or mutation of an existing table is allowed.

- [ ] **Step 4: Implement fail-closed D1 reads**

Add `getControlState()` using one fixed singleton query. Accept only numeric
`paused` 0/1 and safe integer epoch >=1. Missing/malformed rows return
`{paused:true,epoch:0}`.

Add `mayExecuteLeasedOutboxJob()` using one fixed query that requires all of:

```sql
o.job_id = ?
AND o.status = 'leased'
AND o.lease_owner = ?
AND c.state_key = 'dispatch_gate'
AND c.paused = 0
AND c.epoch = ?
```

- [ ] **Step 5: Fence outbox and watchdog network work**

At the start of `processOutbox`, read the gate before repair/lease. Pass the
observed epoch into each job. Immediately before `dispatchWorkflow()` or
`cancelWorkflowRun()`, require `mayExecuteLeasedOutboxJob()`. At the start of
and immediately before each `fetchWorkflowRun()` in the watchdog, re-read the
same unpaused epoch. The existing live GitHub calls remain bounded by
`FETCH_TIMEOUT_MS=10000`.

When paused, `runScheduledMaintenance()` returns zero stats and performs no
watchdog reads or network work. A stale job is rescheduled with safe code
`cutover_epoch_changed`; it is not completed or dispatched.

- [ ] **Step 6: Implement dual callback verification**

Build a closed key list:

```js
const primary = env.RUNNER_CALLBACK_SECRET;
const next = env.RUNNER_CALLBACK_SECRET_NEXT;
if (!isValidSharedSecret(primary)) return misconfigured();
if (next != null && next !== "" && !isValidSharedSecret(next))
  return misconfigured();
const secrets = next ? [primary, next] : [primary];
const matches = await Promise.all(
  secrets.map((secret) =>
    verifyCallbackSignature256(rawBody, timestamp, nonce, signature, secret),
  ),
);
if (!matches.some(Boolean)) return unauthorized();
```

Do not short-circuit or log the matching index/key.

- [ ] **Step 7: Add sanitized health**

For `/healthz` and `/health`, read `getControlState(env.DB)` and require
`RUNTIME_COMMIT` to be a lowercase 40-hex commit. Return only:

```json
{
  "ok": true,
  "service": "grok-review-app",
  "runtime_commit": "0123456789abcdef0123456789abcdef01234567",
  "dispatch_paused": false,
  "cutover_epoch": 1
}
```

Malformed runtime identity returns `500 misconfigured`.

- [ ] **Step 8: Run focused and full GREEN**

```bash
"$NODE22" --test tests/grok-review-app-worker.test.mjs \
  --test-name-pattern="control state|cutover epoch|callback key overlap|health gate"
PATH="$(dirname "$NODE22"):$PATH" npm test
./node_modules/.bin/prettier --check apps/grok-review-app/src \
  tests/grok-review-app-worker.test.mjs docs/provenance/donors.md
git diff --check
```

- [ ] **Step 9: Record donor inspection and commit**

Append both exact donor revisions/files, useful invariant, local adaptation,
and rejected pattern. The useful invariant is durable lifecycle state before
an external side effect; the rejected pattern is an in-memory/env-only pause
that cannot fence a stale invocation.

```bash
git add apps/grok-review-app/migrations/0002_control_state.sql \
  apps/grok-review-app/src/{constants,db,outbox,callback,index}.mjs \
  tests/grok-review-app-worker.test.mjs docs/provenance/donors.md
git commit -m "feat: add production cutover bridge"
```

### Task 4: Replace the prototype workflow with static release runners

**Files:**

- Delete: `.github/workflows/grok-review-app-worker.yml`
- Create: `.github/workflows/grok-review-app-worker-staging.yml`
- Create: `.github/workflows/grok-review-app-worker-production.yml`
- Modify: `tests/grok-review-app-runner.test.mjs`
- Modify: `apps/grok-review-app/README.md`

**Interfaces:**

- Consumes: immutable release tag and environment variables.
- Produces: two exact seven-input workflows whose only behavioral difference
  is literal environment name.

- [ ] **Step 1: Write RED workflow-structure assertions**

Require both files to have:

```yaml
permissions:
  contents: read
jobs:
  review:
    runs-on: macos-latest
    timeout-minutes: 30
```

Require literal `environment: review-staging-runtime` or
`environment: review-production-runtime`, seven exact inputs, pinned checkout
and setup-node SHAs, `persist-credentials: false`, no `npm install`, no
`actions/upload-artifact`, and exact asset name/size/digest references.

- [ ] **Step 2: Run RED**

```bash
"$NODE22" --test tests/grok-review-app-runner.test.mjs \
  --test-name-pattern="static staging and production workflows|prebuilt Grok asset"
```

Expected: missing static workflow files and prototype install still present.

- [ ] **Step 3: Create the static workflows**

Copy the seven-input contract, concurrency, checkout, Node setup, runner env,
and cleanup from the proven workflow. Replace the prototype step with:

```yaml
- name: Download and attest exact Grok runtime asset
  env:
    GH_TOKEN: ${{ github.token }}
    GROK_ASSET_NAME: grok-0.2.112-darwin-arm64
    GROK_ASSET_SIZE: "129363664"
    GROK_ASSET_SHA256: 5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4
  run: |
    set -euo pipefail
    test "$(uname -m)" = "arm64"
    install -d -m 700 "$RUNNER_TEMP/grok-runtime"
    gh release download "$GITHUB_REF_NAME" \
      --repo "$GITHUB_REPOSITORY" \
      --pattern "$GROK_ASSET_NAME" \
      --dir "$RUNNER_TEMP/grok-runtime"
    GROK_BIN="$RUNNER_TEMP/grok-runtime/$GROK_ASSET_NAME"
    test -f "$GROK_BIN" && test ! -L "$GROK_BIN"
    test "$(stat -f %z "$GROK_BIN")" = "$GROK_ASSET_SIZE"
    test "$(shasum -a 256 "$GROK_BIN" | awk '{print $1}')" = "$GROK_ASSET_SHA256"
    chmod 500 "$GROK_BIN"
    GROK_BIN="$GROK_BIN" node --input-type=module -e \
      'import { attestLocalGrok } from "./apps/grok-review-app/src/actions/model-review.mjs"; attestLocalGrok({ expectedVersion: "0.2.112", expectedSha256: process.env.GROK_ASSET_SHA256 });'
    echo "GROK_BIN=$GROK_BIN" >> "$GITHUB_ENV"
```

The runner step uses `$GROK_BIN` from `GITHUB_ENV` and does not export a home
installation path. Include `GROK_REVIEW_RUNTIME_COMMIT`, runtime archive
digest, App identity, callback/receipt keys, and provider auth exactly as in the
proven workflow.

- [ ] **Step 4: Run GREEN and commit**

```bash
"$NODE22" --test tests/grok-review-app-runner.test.mjs
PATH="$(dirname "$NODE22"):$PATH" npm test
./node_modules/.bin/prettier --check .github/workflows \
  tests/grok-review-app-runner.test.mjs apps/grok-review-app/README.md
git diff --check
git add .github/workflows tests/grok-review-app-runner.test.mjs \
  apps/grok-review-app/README.md
git commit -m "feat: run reviews from immutable Grok assets"
```

### Task 5: Build and verify the exact release candidate

**Files:**

- Create ignored: `evidence/private/production-release/input/**`
- Create ignored: `evidence/private/production-release/builds/<role>-<commit>/**`

**Interfaces:**

- Consumes: exact branch HEAD and the script-disabled, exact-integrity
  `@xai-official/grok-darwin-arm64@0.2.112` platform tarball under a private
  temporary HOME/cache. No package lifecycle hook executes.
- Produces: a fresh raw verified release output and receipt bound to the exact
  role and commit; no tracked binary.

- [ ] **Step 1: Run the complete source gate**

```bash
test -z "$(git status --porcelain=v1 --untracked-files=no)"
PATH="$(dirname "$NODE22"):$PATH" npm run check
git diff --check
```

Expected: clean branch and all source checks green.

- [ ] **Step 2: Obtain and extract the exact platform package without scripts**

Run Steps 2 and 3 in this single fresh shell fragment so the verified input,
fresh output path, and receipt cannot be swapped between invocations:

```bash
install -d -m 700 "$PRIVATE_ROOT/input" "$PRIVATE_ROOT/builds"
PATH="$(dirname "$NODE22"):$PATH"
NODE_ROOT="$(cd "$(dirname "$NODE22")/.." && pwd -P)"
NPM_CLI="$NODE_ROOT/lib/node_modules/npm/bin/npm-cli.js"
test "$("$NODE22" "$NPM_CLI" --version)" = "10.9.2"
EXPECTED_SRI='sha512-VfKESr9UU+DN0X892+dMjFq56vQt6QwbjETtGkMztpby43tNFoZwXvVG2x1z79ko5/qq1aMZhdMJYGc8Mljkrg=='
PACKAGE_ROOT="$PRIVATE_ROOT/input/platform-package-36f4aedb29affafaca63bb47be8cf3f918fc2350ff6920d43b5e473ab22b327f"
if test ! -e "$PACKAGE_ROOT"; then
  mkdir -m 700 "$PACKAGE_ROOT"
  mkdir -m 700 "$PACKAGE_ROOT/home" "$PACKAGE_ROOT/cache"
  PACK_JSON="$(
    env -i \
      HOME="$PACKAGE_ROOT/home" \
      LANG=C \
      PATH="$NODE_ROOT/bin:/usr/bin:/bin" \
      npm_config_cache="$PACKAGE_ROOT/cache" \
      npm_config_ignore_scripts=true \
      npm_config_update_notifier=false \
      "$NODE22" "$NPM_CLI" pack \
        '@xai-official/grok-darwin-arm64@0.2.112' \
        --ignore-scripts \
        --registry=https://registry.npmjs.org/ \
        --pack-destination "$PACKAGE_ROOT" \
        --json
  )"
  printf %s "$PACK_JSON" | "$NODE22" -e '
    const fs = require("node:fs");
    const result = JSON.parse(fs.readFileSync(0, "utf8"));
    const item = Array.isArray(result) && result.length === 1 ? result[0] : null;
    const expected = {
      id: "@xai-official/grok-darwin-arm64@0.2.112",
      name: "@xai-official/grok-darwin-arm64",
      version: "0.2.112",
      size: 37094207,
      unpackedSize: 37113280,
      shasum: "436870a7708674ca1848e4682abc9babf1380791",
      integrity: process.argv[1],
      filename: "xai-official-grok-darwin-arm64-0.2.112.tgz",
      entryCount: 4,
    };
    if (!item) process.exit(1);
    for (const [key, value] of Object.entries(expected)) {
      if (item[key] !== value) process.exit(1);
    }
    if (!Array.isArray(item.bundled) || item.bundled.length !== 0) process.exit(1);
  ' "$EXPECTED_SRI"
fi
test -d "$PACKAGE_ROOT" && test ! -L "$PACKAGE_ROOT"
test "$(stat -f %Lp "$PACKAGE_ROOT")" = "700"
TARBALL="$PACKAGE_ROOT/xai-official-grok-darwin-arm64-0.2.112.tgz"
test -f "$TARBALL" && test ! -L "$TARBALL"
test "$(stat -f %z "$TARBALL")" = "37094207"
test "$(shasum -a 256 "$TARBALL" | awk '{print $1}')" = \
  "36f4aedb29affafaca63bb47be8cf3f918fc2350ff6920d43b5e473ab22b327f"
test "$(shasum -a 512 "$TARBALL" | awk '{print $1}')" = \
  "55f2844abf5453e0cdd17f3ddbe74c8c5ab9eaf42de90c1b8c44ed1a4333b696f2e37b4d1686705ef546db1d73efd928e7faaad5a31985d30960673c3258e4ae"
INPUT_ROOT="$(mktemp -d "$PRIVATE_ROOT/input/extracted.XXXXXX")"
chmod 700 "$INPUT_ROOT"
GROK_INPUT="$INPUT_ROOT/grok-0.2.112-darwin-arm64"
"$NODE22" scripts/extract-grok-package.mjs \
  --package-tarball "$TARBALL" \
  --out "$GROK_INPUT"
"$NODE22" --input-type=module - "$GROK_INPUT" <<'NODE'
import { lstatSync } from "node:fs";
const stat = lstatSync(process.argv[2]);
if (!stat.isFile() || stat.isSymbolicLink()) process.exit(1);
if (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o500) process.exit(1);
NODE
test "$(stat -f %z "$GROK_INPUT")" = "129363664"
test "$(shasum -a 256 "$GROK_INPUT" | awk '{print $1}')" = \
  "5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4"
BUILD_ROOT="$PRIVATE_ROOT/builds/branch-$RUNTIME_SHA"
install -d -m 700 "$BUILD_ROOT"
CANDIDATE_OUTPUT="$(mktemp -d "$BUILD_ROOT/output.XXXXXX")"
chmod 700 "$CANDIDATE_OUTPUT"
CANDIDATE_RECEIPT="$BUILD_ROOT/receipt.$(basename "$CANDIDATE_OUTPUT").json"
"$NODE22" scripts/build-release.mjs \
  --runtime-root "$TARGET_ROOT" \
  --commit "$RUNTIME_SHA" \
  --grok-bin "$GROK_INPUT" \
  --out-dir "$CANDIDATE_OUTPUT"
"$NODE22" scripts/verify-release.mjs \
  --runtime-root "$TARGET_ROOT" \
  --commit "$RUNTIME_SHA" \
  --asset "$CANDIDATE_OUTPUT/grok-0.2.112-darwin-arm64" \
  --license "$CANDIDATE_OUTPUT/Apache-2.0.txt" \
  --notice "$CANDIDATE_OUTPUT/THIRD_PARTY_NOTICES.md" \
  --manifest "$TARGET_ROOT/release/grok-runtime-v1.json" \
  > "$CANDIDATE_RECEIPT"
chmod 600 "$CANDIDATE_RECEIPT"
printf 'release_asset_verified commit=%s output=%s receipt=%s\n' \
  "$RUNTIME_SHA" "$CANDIDATE_OUTPUT" "$CANDIDATE_RECEIPT"
```

Expected: one exact official binary followed by `release_asset_verified`.
This is the sole registry use; no install/postinstall/prepack hook runs, and
runtime jobs never access the registry. The extractor also binds the exact
upstream third-party notice. The receipt binds
branch HEAD, git archive, asset digest/size/name, license digest, and notice
digest. Preserve the printed private output/receipt paths only for review; the
merged release rebuild creates a different directory and is authoritative for
upload.

- [ ] **Step 3: Inspect the bound private release output**

Require the output printed by Step 2 to contain exactly the binary,
`Apache-2.0.txt`, and `THIRD_PARTY_NOTICES.md`; require the receipt path to be
outside that initially-empty output directory and mode `0600`. Rerun the same
full verifier command against those exact printed paths before accepting the
branch candidate.

- [ ] **Step 4: Review the integrated diff**

```bash
git log --oneline 094f1b8..HEAD
git diff --stat 094f1b8..HEAD
git diff --check 094f1b8..HEAD
git status --short
```

Require no tracked binary, rendered config, protected coordinate, credential,
or evidence artifact.

### Task 6: Publish the source commit, immutable tag, and release assets

**Files/remote state:**

- Push: branch `codex/production-cutover`
- Create and merge: one private pull request
- Create: tag whose shell value is `grok-review-runtime-$MERGED_SHA`
- Create: draft then immutable release with raw binary, license, and notice assets

**Interfaces:**

- Consumes: reviewed clean source commit and verified private assets.
- Produces: immutable release whose tag, source archive, and downloaded assets
  independently match the receipt.

- [ ] **Step 1: Push the implementation branch and open a PR**

```bash
git push -u origin codex/production-cutover
gh pr create -R xliberty2008x/grok-review-xliberty \
  --base main --head codex/production-cutover \
  --title "Make the standalone review runtime releasable" \
  --body "Replaces per-run Grok installation with an immutable verified asset, adds the durable cutover bridge, and moves existing service ownership. Production remains unchanged; the next gate is a real staging receipt."
```

- [ ] **Step 2: Require exact-head source and real App review before merge**

On the exact remote PR head, rerun `npm run check` under Node `22.17.1` in a
clean checkout and verify the private release candidate receipt. Require the
currently installed staging App’s exact-head `Grok review` Check and COMMENT
review on this implementation PR. Independently review the diff for credential
surfaces, release download integrity, pause/epoch fencing, and callback
overlap. Resolve every blocking finding, rerun all evidence on the exact
updated head, then merge without reusing stale evidence. This task does not add
a new generic CI framework.

- [ ] **Step 3: Rebuild from the exact merged commit**

Run Steps 3 and 4 in one fresh shell fragment. This fragment creates a new
commit-keyed output and uploads only that verified merged-commit output:

```bash
git fetch origin main
git switch main
git pull --ff-only origin main
MERGED_SHA="$(git rev-parse HEAD)"
test -z "$(git status --porcelain=v1 --untracked-files=no)"
PATH="$(dirname "$NODE22"):$PATH" npm run check
PACKAGE_ROOT="$PRIVATE_ROOT/input/platform-package-36f4aedb29affafaca63bb47be8cf3f918fc2350ff6920d43b5e473ab22b327f"
test -d "$PACKAGE_ROOT" && test ! -L "$PACKAGE_ROOT"
test "$(stat -f %Lp "$PACKAGE_ROOT")" = "700"
TARBALL="$PACKAGE_ROOT/xai-official-grok-darwin-arm64-0.2.112.tgz"
test -f "$TARBALL" && test ! -L "$TARBALL"
test "$(stat -f %z "$TARBALL")" = "37094207"
test "$(shasum -a 256 "$TARBALL" | awk '{print $1}')" = \
  "36f4aedb29affafaca63bb47be8cf3f918fc2350ff6920d43b5e473ab22b327f"
MERGED_BUILD_ROOT="$PRIVATE_ROOT/builds/merged-$MERGED_SHA"
install -d -m 700 "$MERGED_BUILD_ROOT"
MERGED_INPUT_ROOT="$(mktemp -d "$MERGED_BUILD_ROOT/input.XXXXXX")"
chmod 700 "$MERGED_INPUT_ROOT"
GROK_INPUT="$MERGED_INPUT_ROOT/grok-0.2.112-darwin-arm64"
"$NODE22" scripts/extract-grok-package.mjs \
  --package-tarball "$TARBALL" \
  --out "$GROK_INPUT"
test -f "$GROK_INPUT" && test ! -L "$GROK_INPUT"
test "$(stat -f %z "$GROK_INPUT")" = "129363664"
test "$(shasum -a 256 "$GROK_INPUT" | awk '{print $1}')" = \
  "5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4"
MERGED_OUTPUT="$(mktemp -d "$MERGED_BUILD_ROOT/output.XXXXXX")"
chmod 700 "$MERGED_OUTPUT"
MERGED_RECEIPT="$MERGED_BUILD_ROOT/receipt.$(basename "$MERGED_OUTPUT").json"
"$NODE22" scripts/build-release.mjs \
  --runtime-root "$TARGET_ROOT" \
  --commit "$MERGED_SHA" \
  --grok-bin "$GROK_INPUT" \
  --out-dir "$MERGED_OUTPUT"
"$NODE22" scripts/verify-release.mjs \
  --runtime-root "$TARGET_ROOT" \
  --commit "$MERGED_SHA" \
  --asset "$MERGED_OUTPUT/grok-0.2.112-darwin-arm64" \
  --license "$MERGED_OUTPUT/Apache-2.0.txt" \
  --notice "$MERGED_OUTPUT/THIRD_PARTY_NOTICES.md" \
  --manifest "$TARGET_ROOT/release/grok-runtime-v1.json" \
  > "$MERGED_RECEIPT"
chmod 600 "$MERGED_RECEIPT"
TAG="grok-review-runtime-$MERGED_SHA"
git tag "$TAG" "$MERGED_SHA"
git push origin "$TAG"
gh release create "$TAG" -R xliberty2008x/grok-review-xliberty \
  --draft --verify-tag --title "$TAG" \
  --notes "Immutable standalone runtime for $MERGED_SHA."
gh release upload "$TAG" -R xliberty2008x/grok-review-xliberty \
  "$MERGED_OUTPUT/grok-0.2.112-darwin-arm64" \
  "$MERGED_OUTPUT/Apache-2.0.txt" \
  "$MERGED_OUTPUT/THIRD_PARTY_NOTICES.md"
printf 'merged_release_uploaded commit=%s tag=%s output=%s receipt=%s\n' \
  "$MERGED_SHA" "$TAG" "$MERGED_OUTPUT" "$MERGED_RECEIPT"
```

- [ ] **Step 4: Verify the draft binds the merged build**

Require the printed receipt’s `commit` and runtime archive digest to match the
tag target. Require the draft’s three asset names, sizes, and downloaded
digests to match the exact files under the printed `MERGED_OUTPUT`. A
branch-head output or receipt is never an upload input.

- [ ] **Step 5: Download, verify, and publish immutably**

Download all three assets into a new mode-`0700` directory, rerun the full
verifier on the downloaded binary, license, and notice, then publish:

```bash
MERGED_SHA="$(git rev-parse HEAD)"
TAG="grok-review-runtime-$MERGED_SHA"
DOWNLOAD_ROOT="$(mktemp -d "$PRIVATE_ROOT/download.$MERGED_SHA.XXXXXX")"
chmod 700 "$DOWNLOAD_ROOT"
gh release download "$TAG" -R "$REPO" --dir "$DOWNLOAD_ROOT"
"$NODE22" --input-type=module - "$DOWNLOAD_ROOT" <<'NODE'
import { readdirSync } from "node:fs";
const names = readdirSync(process.argv[2]).sort();
const expected = [
  "Apache-2.0.txt",
  "THIRD_PARTY_NOTICES.md",
  "grok-0.2.112-darwin-arm64",
];
if (JSON.stringify(names) !== JSON.stringify(expected)) process.exit(1);
NODE
"$NODE22" scripts/verify-release.mjs \
  --runtime-root "$TARGET_ROOT" \
  --commit "$MERGED_SHA" \
  --asset "$DOWNLOAD_ROOT/grok-0.2.112-darwin-arm64" \
  --license "$DOWNLOAD_ROOT/Apache-2.0.txt" \
  --notice "$DOWNLOAD_ROOT/THIRD_PARTY_NOTICES.md" \
  --manifest "$TARGET_ROOT/release/grok-runtime-v1.json"
gh release edit "$TAG" -R xliberty2008x/grok-review-xliberty --draft=false
gh api "repos/xliberty2008x/grok-review-xliberty/releases/tags/$TAG" \
  --jq '{tag_name,target_commitish,draft,immutable,assets:[.assets[].name]}'
```

Expected: exact tag, `draft=false`, `immutable=true`, and exactly the raw Grok
asset, `Apache-2.0.txt`, and `THIRD_PARTY_NOTICES.md`.

### Task 7: Configure static staging environment and deploy the exact release

**Files/remote state:**

- Create/update GitHub environment: `review-staging-runtime`
- Create empty GitHub environment shell: `review-production-runtime`
- Modify staging Worker and D1 only
- Create ignored: `apps/grok-review-app/wrangler.rendered.staging.jsonc`
- Create ignored: `evidence/private/production-release/staging/**`

**Interfaces:**

- Consumes: immutable release/tag and existing private staging credentials.
- Produces: staging Worker on exact release code, D1 migration 0002, static
  workflow environment, and a tested Worker rollback pair.

- [ ] **Step 1: Create static environments and tag policies**

Use GitHub environment APIs to create `review-staging-runtime` and
`review-production-runtime`. For each, set deployment branch policy to custom
tags only and add pattern `grok-review-runtime-*`. Do not add production
credentials in this plan.

```bash
for ENVIRONMENT in review-staging-runtime review-production-runtime; do
  gh api --method PUT "repos/$REPO/environments/$ENVIRONMENT" \
    -F 'deployment_branch_policy[protected_branches]=false' \
    -F 'deployment_branch_policy[custom_branch_policies]=true'
  gh api --method POST \
    "repos/$REPO/environments/$ENVIRONMENT/deployment-branch-policies" \
    -f name='grok-review-runtime-*' -f type=tag
done
```

If a matching policy already exists, compare exact type/name and do not create
a duplicate. Audit that neither environment accepts branches.

- [ ] **Step 2: Move staging App secrets and variables into its environment**

Write these existing private values to `review-staging-runtime`:

```text
secrets: GROK_REVIEW_APP_PRIVATE_KEY
         RUNNER_CALLBACK_SECRET
         RECEIPT_SIGNING_PRIVATE_KEY
variables: GROK_REVIEW_APP_CLIENT_ID
           GROK_REVIEW_APP_ID
           GROK_REVIEW_RUNTIME_BUNDLE_SHA256
           GROK_REVIEW_RUNTIME_COMMIT
           GROK_REVIEW_WORKER_URL
           RECEIPT_SIGNING_PUBLIC_KEY
           GROK_CLI_VERSION
           GROK_MODEL
           GROK_EFFORT
```

Keep `GROK_AUTH_JSON` as the single repository secret. Set runtime commit and
archive digest from the exact release receipt, not the old tag. After the new
staging vertical passes, delete the three superseded repo-level secrets and
the environment-shadowed repo variables.

Use environment-scoped writes; never print values:

```bash
ENVIRONMENT=review-staging-runtime
gh secret set GROK_REVIEW_APP_PRIVATE_KEY -R "$REPO" --env "$ENVIRONMENT" \
  < evidence/private/vertical-staging/credentials/github-app-private-key.pem
gh secret set RUNNER_CALLBACK_SECRET -R "$REPO" --env "$ENVIRONMENT" \
  < evidence/private/vertical-staging/credentials/callback-secret.raw
gh secret set RECEIPT_SIGNING_PRIVATE_KEY -R "$REPO" --env "$ENVIRONMENT" \
  < evidence/private/vertical-staging/credentials/receipt-signing-private.pem
```

Set public variables with `gh variable set NAME -R "$REPO" --env
"$ENVIRONMENT" --body "$VALUE"`, taking App metadata and Worker origin from
the existing private staging evidence and runtime commit/archive digest from
the new merged release receipt. Then list names only and require the exact
three secret names and nine variable names.

- [ ] **Step 3: Render the staging config**

Starting from the existing ignored staging file, require exact service
`grok-review-xliberty-staging`, the existing staging D1 coordinate, cron
`*/1 * * * *`, `workers_dev=true`, observability enabled, and vars:

```bash
MERGED_SHA="$(git rev-parse HEAD)"
TAG="grok-review-runtime-$MERGED_SHA"
STAGING_APP_ID="$(jq -er '.app_id' \
  evidence/private/vertical-staging/app-metadata.json)"
jq --arg tag "$TAG" --arg commit "$MERGED_SHA" --arg app "$STAGING_APP_ID" '
  .vars.CONTROL_REPO_OWNER = "xliberty2008x"
  | .vars.CONTROL_REPO_NAME = "grok-review-xliberty"
  | .vars.CONTROL_WORKFLOW_FILE = "grok-review-app-worker-staging.yml"
  | .vars.CONTROL_REF = $tag
  | .vars.GITHUB_APP_ID = $app
  | .vars.RUNTIME_COMMIT = $commit
  | .observability.enabled = true
' apps/grok-review-app/wrangler.rendered.staging.jsonc > \
  apps/grok-review-app/wrangler.rendered.staging.next.jsonc
chmod 600 apps/grok-review-app/wrangler.rendered.staging.next.jsonc
mv apps/grok-review-app/wrangler.rendered.staging.next.jsonc \
  apps/grok-review-app/wrangler.rendered.staging.jsonc
```

The coordinate values remain only in the ignored mode-`0600` file.

- [ ] **Step 4: Apply migration 0002 to staging and verify preservation**

```bash
"$NODE22" "$WRANGLER_JS" d1 migrations apply DB \
  --remote --config apps/grok-review-app/wrangler.rendered.staging.jsonc
```

Query the migration ledger, singleton gate, installations, active requests,
outbox status, and receipt count. Require migration 0001 plus 0002, gate
`paused=0/epoch=1`, unchanged installation authorization, and no unexpected
active/leased rows.

- [ ] **Step 5: Deploy and health-check the candidate**

Capture current staging version ID privately, then:

```bash
"$NODE22" "$WRANGLER_JS" deploy \
  --config apps/grok-review-app/wrangler.rendered.staging.jsonc \
  --keep-vars
```

Require health `runtime_commit=$MERGED_SHA`, `dispatch_paused=false`,
`cutover_epoch=1`; unauthenticated webhook and callback requests remain
rejected.

- [ ] **Step 6: Exercise staging Worker rollback**

Roll back to the captured staging version with pinned Wrangler, verify old
health and unchanged D1, then redeploy the exact candidate and repeat candidate
health. Record both version IDs/digests privately. Do not run the provider in
this step.

### Task 8: Complete the second real installed-App staging lifecycle

**Files/remote state:**

- Create: one inert text-only canary branch and non-draft PR in
  `xliberty2008x/grok-review-xliberty`
- Create ignored: `evidence/private/production-release/staging-e2e/**`

**Interfaces:**

- Consumes: staging App installation, exact candidate Worker/D1, immutable
  release, and environment-bound staging workflow.
- Produces: real `terminal_receipt_committed` proof for the production
  candidate without a registry install.

- [ ] **Step 1: Freeze pre-trigger state**

Record latest old staging workflow run, D1 active/outbox counts, release tag,
candidate Worker version, App slug/ID, and live target main SHA. Store IDs only
in ignored mode-`0600` evidence.

- [ ] **Step 2: Create one inert non-draft PR**

After the normative prologue, set `SHORT_SHA="${RUNTIME_SHA:0:8}"` and create branch
`codex/staging-release-canary-$SHORT_SHA` from exact target main. Add one text
file containing no instruction or code, push it, and open a non-draft PR titled
`Verify immutable staging review release`.

- [ ] **Step 3: Follow the real lifecycle**

Poll bounded host evidence until these milestones occur in order:

```text
request_admitted
workflow_bound
provider_completed
app_output_visible
terminal_receipt_committed
```

Do not change code while cause is unknown. If a boundary fails, capture only
sanitized request/workflow/check/receipt metadata, classify the failure, apply
the smallest runtime correction and focused regression, cut a new immutable
release, and rerun this same PR lifecycle.

- [ ] **Step 4: Verify exact production-candidate evidence**

Require:

- bound workflow repository is `xliberty2008x/grok-review-xliberty`;
- workflow ref and head equal the immutable candidate tag/commit;
- workflow log contains the asset download/attestation step and no npm install;
- `provider_launched=true` and structured output valid;
- App-authored `Grok review` Check head equals live PR head;
- native COMMENT review is App-authored;
- receipt runtime commit/archive digest/executable release identity match the
  release receipt;
- Ed25519 envelope verifies and D1 status is terminal;
- source checkout remains byte-identical to its pre-plan state.

- [ ] **Step 5: Retire shadowed staging repository names**

Delete only the three repo-level secrets now stored in
`review-staging-runtime` and the repo-level variables shadowed by that
environment. Keep repository `GROK_AUTH_JSON`. Rerun one manual
`@grok-review review` on the same PR and require a second terminal receipt to
prove the environment owns every runtime value.

- [ ] **Step 6: Record the milestone and stop before production**

Write ignored qualification summary with exact release commit/tag/asset SHA,
Worker version, D1 migration set, automatic and manual request/receipt IDs,
App Check/review evidence, `provider_launched=true`, and
`terminal_receipt_committed=true`.

Update the main task plan to mark release/staging complete. Do not create a
production App key, production environment secret, production control token,
or production Worker deployment in this plan. The next plan starts from this
exact receipt.

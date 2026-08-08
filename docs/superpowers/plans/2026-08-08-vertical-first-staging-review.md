# Vertical-first Staging Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the independent private control repository and complete one real staging GitHub App review through Worker, D1, immutable Actions runner, actual Grok launch, App-authored output, and a committed terminal receipt.

**Architecture:** Preserve the Task 4C work and add a temporary compatibility lane copied byte-for-byte from source commit `aee1171c2f346948feb2864784e13abe020dcb34` at its original paths. Create only staging resources with pinned local Wrangler, install a new private staging App only on `xliberty2008x/grok-review-app-e2e`, and drive one request to `terminal_receipt_committed` before resuming any horizontal extraction.

**Tech Stack:** Node.js `22.17.1`; lockfile-installed Wrangler `4.120.0`; Cloudflare Workers and D1; GitHub Actions; private GitHub Apps; Ed25519 receipts; HMAC-SHA-256 webhook/callback authentication; darwin/arm64 Grok `0.2.112`; model `grok-4.5`; effort `high`.

## Global Constraints

- Target root: `/Users/cyrildubovik/Documents/grok-review-xliberty`.
- Source root: `/Users/cyrildubovik/Documents/grok-plugin-e2e` at exact commit `aee1171c2f346948feb2864784e13abe020dcb34`.
- Preserve every target commit through the commit containing this plan; that plan commit must have parent `7eb0f6c83825cc59adbaa6bc26fcfd70a779174c`. Do not overwrite `apps/control-plane`, `apps/review-runner`, or `packages/*`.
- Source remains read-only with exactly the known untracked paths `AGENTS.md`,
  `docs/issues/49-recovery-donor-evidence.md`, and
  `docs/research/2026-07-29-mcp-tasks-apps-broker-research.md`; copy tracked
  bytes with `git archive`, never from mutable working-tree reads.
- Use no Terraform, production credential, production App/Worker/D1 mutation, production traffic change, rollback, soak, cleanup, or Task 4D+ work.
- Use only the project-local Wrangler entry `node_modules/wrangler/bin/wrangler.js`; never use `npx` or a registry-installed deployment CLI.
- Tracked files contain no URL, account/database/App/installation ID, credential, token, key, or live evidence.
- Credential generation, GitHub/Cloudflare mutation, App registration, App installation, and secret writes are main-agent/operator actions and must not be delegated.
- Before any secret-bearing dispatch, protect `grok-review-runtime-*` tags against update and deletion with no bypass actor.
- Report the highest real milestone completed: `staging_serving`, `installation_authorized`, `request_admitted`, `workflow_bound`, `runner_authorized`, `provider_completed`, `app_output_visible`, or `terminal_receipt_committed`.
- After live execution begins, change runtime code only for one observed failure, explicit acceptance criterion, or verified safety gap; immediately rerun this same vertical.
- Unit counts, dry runs, successful dispatch, provider construction, or visible output without the terminal receipt never qualify the lifecycle.

#### Shell execution contract

Every `bash` fence below is a command fragment, not a stateful continuation.
For each tool invocation, physically prepend the following normative prologue
to the fence in the same shell process. Do not rely on a variable, current
directory, or shell option from a previous call:

```bash
set -euo pipefail

TARGET_ROOT=/Users/cyrildubovik/Documents/grok-review-xliberty
SOURCE_ROOT=/Users/cyrildubovik/Documents/grok-plugin-e2e
SOURCE_COMMIT=aee1171c2f346948feb2864784e13abe020dcb34
PRIVATE_ROOT="$TARGET_ROOT/evidence/private/vertical-staging"
TOOLCHAIN_BASE="$PRIVATE_ROOT/toolchains"
NODE_ARCHIVE="$TOOLCHAIN_BASE/node-v22.17.1-darwin-arm64.tar.gz"
NODE_DIR="$TOOLCHAIN_BASE/node-v22.17.1-darwin-arm64"
NODE22="$NODE_DIR/bin/node"
WRANGLER_JS="$TARGET_ROOT/node_modules/wrangler/bin/wrangler.js"
CONFIG="$TARGET_ROOT/apps/grok-review-app/wrangler.rendered.staging.jsonc"
CLOUDFLARE_PRIVATE="$PRIVATE_ROOT/cloudflare"
CREDENTIALS="$PRIVATE_ROOT/credentials"
APP_METADATA="$PRIVATE_ROOT/app-metadata.json"
PR_CONTEXT="$PRIVATE_ROOT/e2e-pr.json"
REPO=xliberty2008x/grok-review-xliberty
E2E_REPO=xliberty2008x/grok-review-app-e2e
E2E_CLONE=/private/tmp/grok-review-xliberty-e2e-vertical

RUNTIME_COMMIT="$(git -C "$TARGET_ROOT" rev-parse HEAD)"
RUNTIME_TAG="grok-review-runtime-$RUNTIME_COMMIT"
RUNTIME_ARCHIVE_SHA256="$(git -C "$TARGET_ROOT" archive --format=tar "$RUNTIME_COMMIT" \
  | shasum -a 256 | awk '{print $1}')"
BRANCH="codex/vertical-staging-review-${RUNTIME_COMMIT:0:8}"

if test -f "$APP_METADATA"; then
  STAGING_APP_ID="$(jq -r .app_id "$APP_METADATA")"
  STAGING_APP_CLIENT_ID="$(jq -r .client_id "$APP_METADATA")"
  STAGING_APP_SLUG="$(jq -r .slug "$APP_METADATA")"
  WORKER_ORIGIN="$(jq -r .worker_origin "$APP_METADATA")"
fi

if test -f "$PR_CONTEXT"; then
  PR_URL="$(jq -r .url "$PR_CONTEXT")"
  PR_NUMBER="$(jq -r .number "$PR_CONTEXT")"
  PR_HEAD="$(jq -r .headRefOid "$PR_CONTEXT")"
fi

SOURCE_PATHS=(
  .github/workflows/grok-review-app-worker.yml
  apps/grok-review-app/src
  apps/grok-review-app/prompts
  apps/grok-review-app/schemas/review-output.schema.json
  apps/grok-review-app/migrations/0001_init.sql
  apps/grok-review-app/github-app-manifest.template.json
  apps/grok-review-app/wrangler.toml
  scripts/ci/lib/build-pr-review-payload.mjs
  scripts/ci/lib/diff-right-lines.mjs
  plugins/grok/schemas/review-output.schema.json
  plugins/grok/scripts/lib/acp-client.mjs
  plugins/grok/scripts/lib/errors.mjs
  plugins/grok/scripts/lib/executable-identity.mjs
  plugins/grok/scripts/lib/grok-provider.mjs
  plugins/grok/scripts/lib/host.mjs
  plugins/grok/scripts/lib/process-control.mjs
  plugins/grok/scripts/lib/profiles.mjs
  plugins/grok/scripts/lib/provider-bootstrap.mjs
  plugins/grok/scripts/lib/provider-executable-pin.mjs
  plugins/grok/scripts/lib/recursion-guard.mjs
  plugins/grok/scripts/lib/redact.mjs
  plugins/grok/scripts/lib/state.mjs
  plugins/grok/scripts/lib/task-contract.mjs
  plugins/grok/scripts/lib/worker-authority.mjs
  plugins/grok/scripts/lib/worker-context.mjs
  plugins/grok/scripts/lib/worker-execution-binding.mjs
  plugins/grok/scripts/lib/worker-host-actions.mjs
  plugins/grok/scripts/lib/worker-launch-contract.mjs
  plugins/grok/scripts/lib/worker-roles.mjs
  plugins/grok/scripts/lib/worker-worktree.mjs
  plugins/grok/scripts/lib/workspace.mjs
)

cd "$TARGET_ROOT"
```

The prologue intentionally assigns paths that may not exist yet; each task
creates and validates them before use. With `set -u`, App- and PR-derived
variables remain unavailable until their private metadata files exist. Any
pipeline or push failure stops the current fragment before a later mutation.

---

### Task 1: Install the Exact Local Node Runtime and Transport the Compatibility Lane

**Files:**

- Create: `.github/workflows/grok-review-app-worker.yml`
- Create: `apps/grok-review-app/src/**/*.mjs`
- Create: `apps/grok-review-app/prompts/review.md`
- Create: `apps/grok-review-app/prompts/report-repair.md`
- Create: `apps/grok-review-app/schemas/review-output.schema.json`
- Create: `apps/grok-review-app/migrations/0001_init.sql`
- Create: `apps/grok-review-app/github-app-manifest.template.json`
- Create: `apps/grok-review-app/wrangler.toml`
- Create: `scripts/ci/lib/build-pr-review-payload.mjs`
- Create: `scripts/ci/lib/diff-right-lines.mjs`
- Create: `plugins/grok/schemas/review-output.schema.json`
- Create: `plugins/grok/scripts/lib/{acp-client,errors,executable-identity,grok-provider,host,process-control,profiles,provider-bootstrap,provider-executable-pin,recursion-guard,redact,state,task-contract,worker-authority,worker-context,worker-execution-binding,worker-host-actions,worker-launch-contract,worker-roles,worker-worktree,workspace}.mjs`
- Modify: `docs/provenance/donors.md`
- Verify unchanged: `.gitignore` already ignores `wrangler.rendered.*` and `evidence/private/`

**Interfaces:**

- Consumes: exact source commit `aee1171c2f346948feb2864784e13abe020dcb34` and the clean target plan commit whose parent is `7eb0f6c83825cc59adbaa6bc26fcfd70a779174c`.
- Produces: `apps/grok-review-app/src/index.mjs` as the staging Worker entry, `apps/grok-review-app/src/actions/runner-cli.mjs` as the Actions entry, and the unchanged workflow dispatch contract with inputs `request_id`, `installation_id`, `repository_id`, `pull_number`, `trigger_kind`, `trigger_id`, and `actor_id`.

- [ ] **Step 1: Capture clean target and source identities before writing**

Run:

```bash
git -C /Users/cyrildubovik/Documents/grok-review-xliberty status --short --branch
git -C /Users/cyrildubovik/Documents/grok-review-xliberty rev-parse HEAD
git -C /Users/cyrildubovik/Documents/grok-review-xliberty rev-parse HEAD^
git -C /Users/cyrildubovik/Documents/grok-plugin-e2e status --porcelain=v2 --branch
git -C /Users/cyrildubovik/Documents/grok-plugin-e2e rev-parse HEAD
```

Expected: target is clean `main`, its HEAD contains this plan, and its parent is
`7eb0f6c83825cc59adbaa6bc26fcfd70a779174c`; source is `aee1171…`, has no
tracked/staged diff, and has only the three already-recorded untracked paths.

- [ ] **Step 2: Materialize exact Node 22.17.1 without changing the system installation**

Use the official Apple Silicon archive and its published SHA-256:

```bash
TARGET_ROOT=/Users/cyrildubovik/Documents/grok-review-xliberty
TOOLCHAIN_BASE="$TARGET_ROOT/evidence/private/vertical-staging/toolchains"
NODE_ARCHIVE="$TOOLCHAIN_BASE/node-v22.17.1-darwin-arm64.tar.gz"
NODE_DIR="$TOOLCHAIN_BASE/node-v22.17.1-darwin-arm64"
NODE22="$NODE_DIR/bin/node"

install -d -m 700 "$TARGET_ROOT/evidence/private/vertical-staging" "$TOOLCHAIN_BASE"
test "$(uname -m)" = "arm64"

if test ! -x "$NODE22"; then
  test ! -e "$NODE_DIR"
  curl --fail --location --proto '=https' --output "$NODE_ARCHIVE" \
    https://nodejs.org/dist/v22.17.1/node-v22.17.1-darwin-arm64.tar.gz
  test "$(shasum -a 256 "$NODE_ARCHIVE" | awk '{print $1}')" = \
    "a983f4f2a7b71512b78d7935b9ccf6b72120a255810070afd635c4146bca7b31"
  install -d -m 700 "$NODE_DIR"
  tar -xzf "$NODE_ARCHIVE" -C "$NODE_DIR" --strip-components=1
fi

test "$("$NODE22" --version)" = "v22.17.1"
```

Expected: exact Node is available only under ignored private evidence; the tracked tree remains clean.

- [ ] **Step 3: Extract the exact compatibility closure from the source commit**

Run this mechanical archive extraction from the target root:

```bash
SOURCE_ROOT=/Users/cyrildubovik/Documents/grok-plugin-e2e
TARGET_ROOT=/Users/cyrildubovik/Documents/grok-review-xliberty
SOURCE_COMMIT=aee1171c2f346948feb2864784e13abe020dcb34

SOURCE_PATHS=(
  .github/workflows/grok-review-app-worker.yml
  apps/grok-review-app/src
  apps/grok-review-app/prompts
  apps/grok-review-app/schemas/review-output.schema.json
  apps/grok-review-app/migrations/0001_init.sql
  apps/grok-review-app/github-app-manifest.template.json
  apps/grok-review-app/wrangler.toml
  scripts/ci/lib/build-pr-review-payload.mjs
  scripts/ci/lib/diff-right-lines.mjs
  plugins/grok/schemas/review-output.schema.json
  plugins/grok/scripts/lib/acp-client.mjs
  plugins/grok/scripts/lib/errors.mjs
  plugins/grok/scripts/lib/executable-identity.mjs
  plugins/grok/scripts/lib/grok-provider.mjs
  plugins/grok/scripts/lib/host.mjs
  plugins/grok/scripts/lib/process-control.mjs
  plugins/grok/scripts/lib/profiles.mjs
  plugins/grok/scripts/lib/provider-bootstrap.mjs
  plugins/grok/scripts/lib/provider-executable-pin.mjs
  plugins/grok/scripts/lib/recursion-guard.mjs
  plugins/grok/scripts/lib/redact.mjs
  plugins/grok/scripts/lib/state.mjs
  plugins/grok/scripts/lib/task-contract.mjs
  plugins/grok/scripts/lib/worker-authority.mjs
  plugins/grok/scripts/lib/worker-context.mjs
  plugins/grok/scripts/lib/worker-execution-binding.mjs
  plugins/grok/scripts/lib/worker-host-actions.mjs
  plugins/grok/scripts/lib/worker-launch-contract.mjs
  plugins/grok/scripts/lib/worker-roles.mjs
  plugins/grok/scripts/lib/worker-worktree.mjs
  plugins/grok/scripts/lib/workspace.mjs
)

git -C "$SOURCE_ROOT" archive --format=tar "$SOURCE_COMMIT" "${SOURCE_PATHS[@]}" \
  | tar -xf - -C "$TARGET_ROOT"
```

Expected: the compatibility paths appear; existing Task 4C paths do not change.

- [ ] **Step 4: Record the transport-specific donor decision**

Append this exact section to `docs/provenance/donors.md` with `apply_patch`:

```markdown
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
```

- [ ] **Step 5: Prove byte equality, complete runtime closure, and narrow executability**

Run:

```bash
VERIFY_ROOT="$(mktemp -d /private/tmp/grok-review-transport-verify.XXXXXX)"
git -C "$SOURCE_ROOT" archive --format=tar "$SOURCE_COMMIT" "${SOURCE_PATHS[@]}" \
  | tar -xf - -C "$VERIFY_ROOT"

for path in "${SOURCE_PATHS[@]}"; do
  diff -r "$VERIFY_ROOT/$path" "$TARGET_ROOT/$path"
done

test -f "$TARGET_ROOT/plugins/grok/scripts/lib/provider-bootstrap.mjs"
find "$TARGET_ROOT/apps/grok-review-app/src" \
  "$TARGET_ROOT/scripts/ci/lib" \
  "$TARGET_ROOT/plugins/grok/scripts/lib" \
  -type f -name '*.mjs' -print0 \
  | xargs -0 -n 1 "$NODE22" --check

cd "$TARGET_ROOT"
"$NODE22" --input-type=module -e \
  'await import("./apps/grok-review-app/src/actions/model-review.mjs")'
test "$("$NODE22" -e 'console.log(require("./node_modules/wrangler/package.json").version)')" = "4.120.0"
"$NODE22" node_modules/wrangler/bin/wrangler.js deploy \
  --dry-run \
  --config apps/grok-review-app/wrangler.toml \
  --outdir evidence/private/vertical-staging/worker-dry-run
```

Expected: every copied byte matches the source commit; `provider-bootstrap.mjs` exists; syntax, model-review import, and Worker bundle all succeed. Remove no source file and do not run the broad horizontal suite.

- [ ] **Step 6: Inspect the bounded diff and commit the compatibility lane**

Run:

```bash
git status --short
git diff --check
git diff --stat
git diff -- docs/provenance/donors.md
git status --short -- apps/control-plane apps/review-runner packages
```

Expected: only the listed compatibility/provenance paths are new or modified; the final command prints nothing.

Commit:

```bash
git add .github/workflows/grok-review-app-worker.yml \
  apps/grok-review-app \
  scripts/ci/lib/build-pr-review-payload.mjs \
  scripts/ci/lib/diff-right-lines.mjs \
  plugins/grok/schemas/review-output.schema.json \
  plugins/grok/scripts/lib \
  docs/provenance/donors.md
git commit -m "feat: add staging compatibility runtime"
```

- [ ] **Step 7: Recheck source preservation and target cleanliness**

Run:

```bash
git status --short --branch
git -C /Users/cyrildubovik/Documents/grok-plugin-e2e status --porcelain=v2 --branch
git -C /Users/cyrildubovik/Documents/grok-plugin-e2e rev-parse HEAD
```

Expected: target is clean at the new commit; source is still `aee1171…` with only the three known untracked paths.

---

### Task 2: Publish the Private Control Repository and Freeze Its Runtime Ref

**Files:**

- No tracked file changes.
- Remote create: `xliberty2008x/grok-review-xliberty` (private).
- Remote ruleset create: `immutable grok review runtime tags`.
- Remote tag create: the `grok-review-runtime-` prefix followed by the exact 40-character compatibility commit derived in Step 4.

**Interfaces:**

- Consumes: clean compatibility commit from Task 1.
- Produces: private `origin`, exact `RUNTIME_COMMIT`, `RUNTIME_TAG`, and `RUNTIME_ARCHIVE_SHA256` used by Worker and Actions configuration.

- [ ] **Step 1: Verify the destination is still absent and local state is publishable**

Run:

```bash
cd /Users/cyrildubovik/Documents/grok-review-xliberty
test -z "$(git status --porcelain=v1 --untracked-files=all)"
test "$(git branch --show-current)" = "main"
test -z "$(git remote)"
if gh repo view xliberty2008x/grok-review-xliberty --json nameWithOwner \
  >"$PRIVATE_ROOT/repository-before.json" \
  2>"$PRIVATE_ROOT/repository-before.err"; then
  echo "destination repository already exists" >&2
  exit 1
fi
chmod 600 "$PRIVATE_ROOT/repository-before.json" \
  "$PRIVATE_ROOT/repository-before.err"
```

Expected: the private error is specifically repository-not-found, not an
authentication or network failure. If the repository exists, stop and compare
its visibility, default branch, HEAD, and remotes; never overwrite an unrelated
repository.

- [ ] **Step 2: Create and push the private repository**

Run:

```bash
gh repo create xliberty2008x/grok-review-xliberty \
  --private \
  --source=/Users/cyrildubovik/Documents/grok-review-xliberty \
  --remote=origin \
  --push
```

Expected: `origin` points to the new private repository and remote `main` equals local HEAD.

- [ ] **Step 3: Set the minimum Actions default and create the immutable-tag ruleset**

Run:

```bash
REPO=xliberty2008x/grok-review-xliberty

gh api --method PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false

jq -n '{
  name: "immutable grok review runtime tags",
  target: "tag",
  enforcement: "active",
  bypass_actors: [],
  conditions: {
    ref_name: {
      include: ["refs/tags/grok-review-runtime-*"],
      exclude: []
    }
  },
  rules: [
    {type: "update", parameters: {update_allows_fetch_and_merge: false}},
    {type: "deletion"}
  ]
}' | gh api --method POST "repos/$REPO/rulesets" --input -
```

Expected: GitHub returns one active tag ruleset with no bypass actors. If the account plan cannot enforce it on this private repository, stop before any secret is written.

- [ ] **Step 4: Create and push the exact immutable runtime tag**

Run:

```bash
RUNTIME_COMMIT="$(git rev-parse HEAD)"
RUNTIME_TAG="grok-review-runtime-$RUNTIME_COMMIT"
RUNTIME_ARCHIVE_SHA256="$(git archive --format=tar "$RUNTIME_COMMIT" | shasum -a 256 | awk '{print $1}')"

test "${#RUNTIME_COMMIT}" -eq 40
test "${#RUNTIME_ARCHIVE_SHA256}" -eq 64
git tag "$RUNTIME_TAG" "$RUNTIME_COMMIT"
git push origin "refs/tags/$RUNTIME_TAG"
```

Expected: one new lightweight tag resolves to the compatibility commit. Never move this tag; a runtime fix receives a new commit and tag.

- [ ] **Step 5: Read back repository, tag, and ruleset state**

Run:

```bash
test "$(gh repo view "$REPO" --json visibility --jq .visibility)" = "PRIVATE"
test "$(gh api "repos/$REPO/git/ref/tags/$RUNTIME_TAG" --jq .object.sha)" = "$RUNTIME_COMMIT"
gh api "repos/$REPO/actions/permissions/workflow" \
  --jq '.default_workflow_permissions == "read"
    and .can_approve_pull_request_reviews == false' | grep -qx true

RULESET_ID="$(gh api "repos/$REPO/rulesets" \
  --jq '.[] | select(.name == "immutable grok review runtime tags") | .id')"
test -n "$RULESET_ID"
gh api "repos/$REPO/rulesets/$RULESET_ID" \
  --jq '{name,target,enforcement,bypass_actors,conditions,rules}'
```

Expected: private repository, exact tag SHA, `target=tag`, `enforcement=active`, empty bypass list, exact tag pattern, and update/deletion rules. This task changes only remote staging-control state; create no source commit.

---

### Task 3: Create Staging D1 and a Health-only Worker

**Files:**

- Create ignored: `apps/grok-review-app/wrangler.rendered.staging.jsonc`
- Create ignored: `evidence/private/vertical-staging/cloudflare/*`
- Remote create: staging D1 `grok-review-control-staging`
- Remote create: Worker `grok-review-xliberty-staging`

**Interfaces:**

- Consumes: `RUNTIME_COMMIT` and `RUNTIME_TAG` from Task 2, exact Node/locally installed Wrangler from Task 1.
- Produces: migrated D1 binding `DB` and a workers.dev origin that serves `/healthz`; the App remains uninstalled and no lifecycle milestone is claimed yet.

- [ ] **Step 1: Create private evidence directories and verify Wrangler identity**

Run:

```bash
TARGET_ROOT=/Users/cyrildubovik/Documents/grok-review-xliberty
PRIVATE_ROOT="$TARGET_ROOT/evidence/private/vertical-staging"
CLOUDFLARE_PRIVATE="$PRIVATE_ROOT/cloudflare"
NODE22="$PRIVATE_ROOT/toolchains/node-v22.17.1-darwin-arm64/bin/node"
WRANGLER_JS="$TARGET_ROOT/node_modules/wrangler/bin/wrangler.js"

install -d -m 700 "$PRIVATE_ROOT" "$CLOUDFLARE_PRIVATE"
test "$("$NODE22" --version)" = "v22.17.1"
test "$("$NODE22" "$WRANGLER_JS" --version)" = "4.120.0"
```

- [ ] **Step 2: Create the ignored staging config with no protected values**

Use `apply_patch` to create `apps/grok-review-app/wrangler.rendered.staging.jsonc` with exactly:

```json
{
  "name": "grok-review-xliberty-staging",
  "main": "src/index.mjs",
  "compatibility_date": "2026-03-10",
  "workers_dev": true,
  "preview_urls": false,
  "triggers": {
    "crons": ["*/1 * * * *"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "grok-review-control-staging",
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations"
    }
  ],
  "vars": {
    "CONTROL_REPO_OWNER": "",
    "CONTROL_REPO_NAME": "",
    "CONTROL_WORKFLOW_FILE": "",
    "CONTROL_REF": "",
    "GITHUB_APP_ID": ""
  },
  "observability": {
    "enabled": false
  }
}
```

Then run:

```bash
CONFIG="$TARGET_ROOT/apps/grok-review-app/wrangler.rendered.staging.jsonc"
chmod 600 "$CONFIG"
test "$(stat -f '%Lp' "$CONFIG")" = "600"
git check-ignore -q "$CONFIG"
```

- [ ] **Step 3: Verify Cloudflare identity without exposing coordinates**

Run with raw output redirected to the private directory:

```bash
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" whoami \
  >"$CLOUDFLARE_PRIVATE/whoami.log" 2>&1
chmod 600 "$CLOUDFLARE_PRIVATE/whoami.log"

set +e
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" deployments status \
  --name grok-review-xliberty-staging \
  --json \
  >"$CLOUDFLARE_PRIVATE/worker-before.json" \
  2>"$CLOUDFLARE_PRIVATE/worker-before.err"
WORKER_STATUS_EXIT=$?
set -e
chmod 600 "$CLOUDFLARE_PRIVATE/worker-before.json" \
  "$CLOUDFLARE_PRIVATE/worker-before.err"
test "$WORKER_STATUS_EXIT" -ne 0
```

Main-agent check: exactly one intended Cloudflare account is active. If
authentication is absent, run Wrangler's browser login once and repeat. In the
same account's Workers dashboard, require that
`grok-review-xliberty-staging` is absent; the failing status command alone does
not distinguish absence from an auth/network failure. If account choice is
ambiguous or the Worker exists, stop before creation. Do not quote the account
coordinate in commentary.

- [ ] **Step 4: Prove the staging D1 name is unused, then create and bind it**

Run:

```bash
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" d1 list --json \
  >"$CLOUDFLARE_PRIVATE/d1-before.json" 2>"$CLOUDFLARE_PRIVATE/d1-before.err"
chmod 600 "$CLOUDFLARE_PRIVATE/d1-before.json" "$CLOUDFLARE_PRIVATE/d1-before.err"
jq -e 'all(.[]; .name != "grok-review-control-staging")' \
  "$CLOUDFLARE_PRIVATE/d1-before.json"

NO_COLOR=1 "$NODE22" "$WRANGLER_JS" d1 create grok-review-control-staging \
  --binding DB \
  --update-config \
  --config "$CONFIG" \
  >"$CLOUDFLARE_PRIVATE/d1-create.log" 2>&1
chmod 600 "$CLOUDFLARE_PRIVATE/d1-create.log" "$CONFIG"
```

Expected: Wrangler replaces the placeholder `DB` binding inside the ignored JSONC file. Verify without printing its ID:

```bash
"$NODE22" --input-type=module -e '
  import fs from "node:fs";
  const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const db = cfg.d1_databases?.find((entry) => entry.binding === "DB");
  if (!db || db.database_name !== "grok-review-control-staging"
      || !/^[0-9a-f-]{36}$/.test(db.database_id)
      || db.database_id === "00000000-0000-0000-0000-000000000000"
      || db.migrations_dir !== "migrations") process.exit(1);
' "$CONFIG"
```

- [ ] **Step 5: Require and apply exactly the initial migration**

Run the list with private output:

```bash
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" d1 migrations list DB \
  --remote \
  --config "$CONFIG" \
  >"$CLOUDFLARE_PRIVATE/migrations-before.log" 2>&1
chmod 600 "$CLOUDFLARE_PRIVATE/migrations-before.log"
```

Main-agent check: the only unapplied file shown is `0001_init.sql`. Then run the apply command in a PTY and confirm only that exact migration:

```bash
"$NODE22" "$WRANGLER_JS" d1 migrations apply DB --remote --config "$CONFIG"
```

Read back the ledger without printing coordinates:

```bash
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" d1 execute DB \
  --remote --json --config "$CONFIG" \
  --command 'SELECT id, name FROM d1_migrations ORDER BY id' \
  >"$CLOUDFLARE_PRIVATE/migration-ledger.json" 2>"$CLOUDFLARE_PRIVATE/migration-ledger.err"
chmod 600 "$CLOUDFLARE_PRIVATE/migration-ledger.json" "$CLOUDFLARE_PRIVATE/migration-ledger.err"
jq -e '.[0].success == true and .[0].results == [{"id":1,"name":"0001_init.sql"}]' \
  "$CLOUDFLARE_PRIVATE/migration-ledger.json"
```

- [ ] **Step 6: Deploy the health-only Worker and verify fixed public boundaries**

Run:

```bash
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" deploy \
  --config "$CONFIG" \
  >"$CLOUDFLARE_PRIVATE/health-deploy.log" 2>&1
chmod 600 "$CLOUDFLARE_PRIVATE/health-deploy.log"

WORKER_ORIGIN="$(rg -o 'https://[^[:space:]]+\.workers\.dev' \
  "$CLOUDFLARE_PRIVATE/health-deploy.log" | tail -1)"
test -n "$WORKER_ORIGIN"

curl --fail --silent --show-error "$WORKER_ORIGIN/healthz" \
  >"$CLOUDFLARE_PRIVATE/health.json"
jq -e '.ok == true and .service == "grok-review-app"' \
  "$CLOUDFLARE_PRIVATE/health.json"

test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST "$WORKER_ORIGIN/github/webhooks")" != "200"
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST "$WORKER_ORIGIN/internal/callback")" != "200"
```

Expected: health is live; unauthenticated webhook and callback requests fail. Do not install the App or claim `staging_serving` until Task 4 completes full configuration.

---

### Task 4: Register the Staging App, Provision Paired Credentials, and Finish Worker Configuration

**Files:**

- Create private: `evidence/private/vertical-staging/credentials/*`
- Create private: `evidence/private/vertical-staging/app-metadata.json`
- Create private: `evidence/private/vertical-staging/github-app-manifest.staging.json`
- Remote create: private GitHub App `grok-review-xliberty-staging` (not installed yet)
- Remote modify: target repository Actions secrets and variables
- Remote modify: staging Worker secrets and fully configured deployment

**Interfaces:**

- Consumes: Worker origin from Task 3, exact runtime commit/tag/archive from Task 2, local refreshable Grok auth, and an operator-created fine-grained control token.
- Produces: paired webhook/callback/receipt/App credentials, final Worker vars, complete repository secrets/variables, and milestone `staging_serving`.

- [ ] **Step 1: Generate separated staging HMAC and receipt material**

Run:

```bash
CREDENTIALS="$PRIVATE_ROOT/credentials"
install -d -m 700 "$CREDENTIALS"
umask 077

openssl rand -out "$CREDENTIALS/webhook-secret.raw" 48
openssl rand -out "$CREDENTIALS/callback-secret.raw" 48
openssl genpkey -algorithm Ed25519 \
  -out "$CREDENTIALS/receipt-signing-private.pem"
openssl pkey -in "$CREDENTIALS/receipt-signing-private.pem" \
  -pubout -out "$CREDENTIALS/receipt-signing-public.pem"
chmod 600 "$CREDENTIALS"/*

test "$(stat -f '%z' "$CREDENTIALS/webhook-secret.raw")" = "48"
test "$(stat -f '%z' "$CREDENTIALS/callback-secret.raw")" = "48"
openssl pkey -in "$CREDENTIALS/receipt-signing-private.pem" -pubout \
  | cmp - "$CREDENTIALS/receipt-signing-public.pem"
```

The Worker/App and Worker/runner HMAC values are the lowercase hex encoding of their corresponding 48-byte raw files; the raw files themselves are never uploaded.

- [ ] **Step 2: Render the secure manifest copy and register without installing**

Derive `WORKER_ORIGIN` again from the private Task 3 deployment log. Using
`apply_patch`, create mode-0600 ignored
`evidence/private/vertical-staging/github-app-manifest.staging.json` from the
copied `apps/grok-review-app/github-app-manifest.template.json`. Change only:

- `name` to exact `grok-review-xliberty-staging`;
- `url` to the exact Task 3 Worker origin;
- `hook_attributes.url` to that origin followed by `/github/webhooks`.

Keep every other manifest field and list exact. Verify the secure copy before
opening GitHub Developer Settings:

```bash
WORKER_ORIGIN="$(rg -o 'https://[^[:space:]]+\.workers\.dev' \
  "$CLOUDFLARE_PRIVATE/health-deploy.log" | tail -1)"
STAGING_MANIFEST="$PRIVATE_ROOT/github-app-manifest.staging.json"
chmod 600 "$STAGING_MANIFEST"
git check-ignore -q "$STAGING_MANIFEST"
"$NODE22" --input-type=module -e '
  import fs from "node:fs";
  const [file, origin] = process.argv.slice(1);
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  const expected = {
    name: "grok-review-xliberty-staging",
    url: origin,
    description: "Private, single-tenant Grok pull request reviews.",
    public: false,
    request_oauth_on_install: false,
    hook_attributes: {url: `${origin}/github/webhooks`, active: true},
    default_permissions: {
      contents: "read", pull_requests: "write", checks: "write",
      issues: "read", metadata: "read"
    },
    default_events: ["pull_request", "issue_comment", "check_run",
      "installation", "installation_repositories"]
  };
  if (JSON.stringify(value) !== JSON.stringify(expected)) process.exit(1);
' "$STAGING_MANIFEST" "$WORKER_ORIGIN"
```

Main-agent UI action only. Use this verified secure manifest in GitHub's App
manifest flow, or transcribe this exact copy into the registration UI as the
source of truth. Before saving, require:

```text
App name:                     grok-review-xliberty-staging
Homepage URL:                 exact secure-manifest url
Webhook URL:                  exact secure-manifest hook_attributes.url
Webhook active:               true
Webhook secret:               lowercase hex of webhook-secret.raw
OAuth during installation:    false
Public App:                    false
Contents:                      read
Pull requests:                 read and write
Checks:                        read and write
Issues:                        read
Metadata:                      read
Organization/user permissions: none
Events: pull_request, issue_comment, check_run,
        installation, installation_repositories
```

Use the clipboard only for immediate webhook-secret entry:

```bash
xxd -p -c 256 "$CREDENTIALS/webhook-secret.raw" | tr -d '\n' | pbcopy
# Paste once into the GitHub App webhook-secret field and save.
pbcopy </dev/null
```

Do not install the App. Record only root keys `app_id`, `client_id`, `slug`, and
`worker_origin` in mode-0600 ignored
`evidence/private/vertical-staging/app-metadata.json` using `apply_patch`.
Require the saved slug to be exactly `grok-review-xliberty-staging`; stop on a
collision or suffix. Generate one App RSA private key, move the downloaded PEM
immediately to
`evidence/private/vertical-staging/credentials/github-app-private-key.pem`, and
set mode `0600`.

- [ ] **Step 3: Create the bounded control-repository dispatch token**

Main-agent/operator UI action only. Create one fine-grained token with:

```text
Resource owner:        xliberty2008x
Repository access:    only grok-review-xliberty
Repository permission: Actions read and write
All other writable permissions: none
Expiration:            7 days
```

Save it once in mode-0600 ignored `evidence/private/vertical-staging/credentials/control-repo-token.txt`. Do not reuse the broad interactive `gh` token and do not print the new token.

- [ ] **Step 4: Validate private metadata and derive exact runtime identities**

Run:

```bash
APP_METADATA="$PRIVATE_ROOT/app-metadata.json"
chmod 600 "$APP_METADATA"

STAGING_APP_ID="$(jq -r .app_id "$APP_METADATA")"
STAGING_APP_CLIENT_ID="$(jq -r .client_id "$APP_METADATA")"
STAGING_APP_SLUG="$(jq -r .slug "$APP_METADATA")"
WORKER_ORIGIN="$(jq -r .worker_origin "$APP_METADATA")"
EXPECTED_WORKER_ORIGIN="$(rg -o 'https://[^[:space:]]+\.workers\.dev' \
  "$CLOUDFLARE_PRIVATE/health-deploy.log" | tail -1)"
RUNTIME_COMMIT="$(git rev-parse HEAD)"
RUNTIME_TAG="grok-review-runtime-$RUNTIME_COMMIT"
RUNTIME_ARCHIVE_SHA256="$(git archive --format=tar "$RUNTIME_COMMIT" | shasum -a 256 | awk '{print $1}')"

test "$(git rev-list -n 1 "$RUNTIME_TAG")" = "$RUNTIME_COMMIT"
test "$(gh api "repos/xliberty2008x/grok-review-xliberty/git/ref/tags/$RUNTIME_TAG" --jq .object.sha)" = "$RUNTIME_COMMIT"
test "$(gh variable list -R xliberty2008x/grok-review-xliberty --json name --jq length)" = "0"
test "$(gh secret list -R xliberty2008x/grok-review-xliberty --json name --jq length)" = "0"
test "${#STAGING_APP_ID}" -ge 1
test "$STAGING_APP_SLUG" = "grok-review-xliberty-staging"
test "$WORKER_ORIGIN" = "$EXPECTED_WORKER_ORIGIN"
test "${#RUNTIME_ARCHIVE_SHA256}" -eq 64
"$NODE22" --input-type=module -e '
  import fs from "node:fs";
  const [file, origin] = process.argv.slice(1);
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  const keys = ["app_id", "client_id", "slug", "worker_origin"];
  if (Object.keys(value).length !== keys.length
      || !keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
      || !/^[1-9][0-9]*$/.test(String(value.app_id))
      || typeof value.client_id !== "string" || value.client_id.length < 1
      || value.client_id.length > 256
      || value.slug !== "grok-review-xliberty-staging"
      || value.worker_origin !== origin) process.exit(1);
' "$APP_METADATA" "$EXPECTED_WORKER_ORIGIN"
```

If the repository already contains a secret or variable, stop and inventory it; do not overwrite unexpected state.

- [ ] **Step 5: Configure the four repository secrets**

Run:

```bash
REPO=xliberty2008x/grok-review-xliberty

gh secret set GROK_REVIEW_APP_PRIVATE_KEY -R "$REPO" \
  <"$CREDENTIALS/github-app-private-key.pem"
xxd -p -c 256 "$CREDENTIALS/callback-secret.raw" | tr -d '\n' \
  | gh secret set RUNNER_CALLBACK_SECRET -R "$REPO"
gh secret set RECEIPT_SIGNING_PRIVATE_KEY -R "$REPO" \
  <"$CREDENTIALS/receipt-signing-private.pem"

install -d -m 700 "$PRIVATE_ROOT/auth-sync"
"$NODE22" /Users/cyrildubovik/Documents/grok-plugin-e2e/scripts/sync-grok-ci-auth.mjs \
  --repo "$REPO" \
  --gh-bin "$(realpath "$(command -v gh)")" \
  --state-dir "$PRIVATE_ROOT/auth-sync" \
  --force
```

Expected: the sync script reports a fresh valid auth upload without printing auth content.

- [ ] **Step 6: Configure the nine repository variables**

Run:

```bash
gh variable set GROK_REVIEW_APP_CLIENT_ID -R "$REPO" --body "$STAGING_APP_CLIENT_ID"
gh variable set GROK_REVIEW_APP_ID -R "$REPO" --body "$STAGING_APP_ID"
gh variable set GROK_REVIEW_WORKER_URL -R "$REPO" --body "$WORKER_ORIGIN"
gh variable set GROK_REVIEW_RUNTIME_COMMIT -R "$REPO" --body "$RUNTIME_COMMIT"
gh variable set GROK_REVIEW_RUNTIME_BUNDLE_SHA256 -R "$REPO" --body "$RUNTIME_ARCHIVE_SHA256"
gh variable set GROK_CLI_VERSION -R "$REPO" --body "0.2.112"
gh variable set RECEIPT_SIGNING_PUBLIC_KEY -R "$REPO" \
  <"$CREDENTIALS/receipt-signing-public.pem"
gh variable set GROK_MODEL -R "$REPO" --body "grok-4.5"
gh variable set GROK_EFFORT -R "$REPO" --body "high"
```

- [ ] **Step 7: Configure the four Worker secrets without logging their values**

Run:

```bash
RECEIPT_KID="$("$NODE22" --input-type=module -e '
  import fs from "node:fs";
  import { receiptKeyId } from "./apps/grok-review-app/src/receipt-contract.mjs";
  console.log(await receiptKeyId(fs.readFileSync(process.argv[1], "utf8")));
' "$CREDENTIALS/receipt-signing-public.pem")"

RECEIPT_PUBLIC_KEYS_JSON="$(jq -cn \
  --arg kid "$RECEIPT_KID" \
  --rawfile pem "$CREDENTIALS/receipt-signing-public.pem" \
  '{($kid): $pem}')"

xxd -p -c 256 "$CREDENTIALS/webhook-secret.raw" | tr -d '\n' \
  | NO_COLOR=1 "$NODE22" "$WRANGLER_JS" secret put WEBHOOK_SECRET --config "$CONFIG" \
    >"$CLOUDFLARE_PRIVATE/secret-webhook.log" 2>&1
xxd -p -c 256 "$CREDENTIALS/callback-secret.raw" | tr -d '\n' \
  | NO_COLOR=1 "$NODE22" "$WRANGLER_JS" secret put RUNNER_CALLBACK_SECRET --config "$CONFIG" \
    >"$CLOUDFLARE_PRIVATE/secret-callback.log" 2>&1
tr -d '\n' <"$CREDENTIALS/control-repo-token.txt" \
  | NO_COLOR=1 "$NODE22" "$WRANGLER_JS" secret put CONTROL_REPO_TOKEN --config "$CONFIG" \
    >"$CLOUDFLARE_PRIVATE/secret-control-token.log" 2>&1
printf '%s' "$RECEIPT_PUBLIC_KEYS_JSON" \
  | NO_COLOR=1 "$NODE22" "$WRANGLER_JS" secret put RECEIPT_PUBLIC_KEYS_JSON --config "$CONFIG" \
    >"$CLOUDFLARE_PRIVATE/secret-receipt-map.log" 2>&1
chmod 600 "$CLOUDFLARE_PRIVATE"/secret-*.log
```

Redirect any Wrangler output containing coordinates into `$CLOUDFLARE_PRIVATE`; never include it in commentary.

- [ ] **Step 8: Deploy the fully configured Worker with exact immutable vars**

Run with raw output private:

```bash
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" deploy \
  --config "$CONFIG" \
  --var "CONTROL_REPO_OWNER:xliberty2008x" \
  --var "CONTROL_REPO_NAME:grok-review-xliberty" \
  --var "CONTROL_WORKFLOW_FILE:grok-review-app-worker.yml" \
  --var "CONTROL_REF:$RUNTIME_TAG" \
  --var "GITHUB_APP_ID:$STAGING_APP_ID" \
  >"$CLOUDFLARE_PRIVATE/final-deploy.log" 2>&1
chmod 600 "$CLOUDFLARE_PRIVATE/final-deploy.log"

curl --fail --silent --show-error "$WORKER_ORIGIN/healthz" \
  >"$CLOUDFLARE_PRIVATE/final-health.json"
jq -e '.ok == true and .service == "grok-review-app"' \
  "$CLOUDFLARE_PRIVATE/final-health.json"

test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST "$WORKER_ORIGIN/github/webhooks")" != "200"
test "$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST "$WORKER_ORIGIN/internal/callback")" != "200"
```

- [ ] **Step 9: Audit required-name presence and mark `staging_serving`**

Run:

```bash
gh secret list -R "$REPO" --json name --jq 'map(.name) | sort'
gh variable list -R "$REPO" --json name --jq 'map(.name) | sort'
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" secret list --format json --config "$CONFIG" \
  >"$CLOUDFLARE_PRIVATE/worker-secret-names.json" 2>"$CLOUDFLARE_PRIVATE/worker-secret-names.err"
chmod 600 "$CLOUDFLARE_PRIVATE/worker-secret-names.json" "$CLOUDFLARE_PRIVATE/worker-secret-names.err"
```

Expected exact names: four Actions secrets, nine variables, and four Worker secrets listed above; no extra secret-bearing workflow exists. Report milestone `staging_serving`. This task creates no tracked commit.

---

### Task 5: Install the Staging App and Reconcile Installation Authority

**Files:**

- Create private: `evidence/private/vertical-staging/installation-*.json`
- Remote modify: install `grok-review-xliberty-staging` only on `xliberty2008x/grok-review-app-e2e`

**Interfaces:**

- Consumes: fully configured staging App/Worker/D1 from Task 4.
- Produces: one active selected-repository authorization in D1 and milestone `installation_authorized`.

- [ ] **Step 1: Re-audit App authority immediately before installation**

In the GitHub App UI verify:

```text
private=true
request_oauth_on_install=false
webhook active at the exact staging workers.dev /github/webhooks URL
permissions: contents read, pull_requests write, checks write, issues read, metadata read
events: pull_request, issue_comment, check_run, installation, installation_repositories
no organization/user permissions
```

Also inspect the E2E repository's installed-App list without changing it. Stop
on any widening or URL mismatch. If another automatic review App is installed
and opening the fixture PR would cause unapproved provider work or ambiguous
App output, stop for a target-repository decision; never uninstall, suspend, or
reconfigure that existing App as part of this vertical.

- [ ] **Step 2: Install only on the E2E repository**

Main-agent UI action: select **Only select repositories**, choose only `grok-review-app-e2e`, and complete installation. Do not select `grok-plugin`, `grok-review-xliberty`, or all repositories.

- [ ] **Step 3: Verify the real delivery before opening a PR**

In the App delivery UI require a real `installation` delivery with a `2xx` response. If it arrived before ingress was ready, redeliver it once or reinstall; never insert D1 authority manually.

- [ ] **Step 4: Compare installed repository identity with D1 privately**

Run:

```bash
E2E_REPO=xliberty2008x/grok-review-app-e2e
gh repo view "$E2E_REPO" --json databaseId \
  >"$PRIVATE_ROOT/e2e-repository.json"
chmod 600 "$PRIVATE_ROOT/e2e-repository.json"

NO_COLOR=1 "$NODE22" "$WRANGLER_JS" d1 execute DB \
  --remote --json --config "$CONFIG" \
  --command "SELECT i.installation_id, i.repository_selection, i.suspended,
                    ir.repository_id
             FROM installations i
             JOIN installation_repositories ir
               ON ir.installation_id = i.installation_id
             ORDER BY i.updated_at DESC" \
  >"$PRIVATE_ROOT/installation-state.json" 2>"$PRIVATE_ROOT/installation-state.err"
chmod 600 "$PRIVATE_ROOT/installation-state.json" "$PRIVATE_ROOT/installation-state.err"

"$NODE22" --input-type=module -e '
  import fs from "node:fs";
  const repo = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const d1 = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const rows = d1?.[0]?.results;
  if (!Array.isArray(rows) || rows.length !== 1) process.exit(1);
  const row = rows[0];
  if (String(repo.databaseId) !== String(row.repository_id)
      || row.repository_selection !== "selected"
      || Number(row.suspended) !== 0) process.exit(1);
' "$PRIVATE_ROOT/e2e-repository.json" "$PRIVATE_ROOT/installation-state.json"
```

Expected: exactly one authorized installation/repository row for the E2E repository. Report milestone `installation_authorized`. This task creates no tracked commit.

---

### Task 6: Open the Safe E2E Pull Request and Drive the Real Lifecycle

**Files:**

- Create in temporary E2E clone: `vertical-staging-review.txt`
- Create private: `evidence/private/vertical-staging/request-*.json`
- Remote create: one E2E branch and pull request

**Interfaces:**

- Consumes: `installation_authorized`, exact runtime tag, final Worker, and configured Actions runner.
- Produces: milestones `request_admitted` through `terminal_receipt_committed`, or one exact observed failure handed to Task 7.

- [ ] **Step 1: Create a safe, non-executable PR fixture**

Run:

```bash
test ! -e "$E2E_CLONE"
gh repo clone xliberty2008x/grok-review-app-e2e "$E2E_CLONE"
cd "$E2E_CLONE"
git switch -c "$BRANCH"
```

Use `apply_patch` to create the exact absolute path
`/private/tmp/grok-review-xliberty-e2e-vertical/vertical-staging-review.txt`
with exactly:

```text
Vertical staging review fixture.

This is inert text. The hosted reviewer must inspect it without executing
repository code, hooks, workflows, submodules, package managers, or tests.
```

Then run:

```bash
cd "$E2E_CLONE"
git add vertical-staging-review.txt
git commit -m "test: add inert staging review fixture"
git push -u origin "$BRANCH"
PR_URL="$(gh pr create \
  --repo xliberty2008x/grok-review-app-e2e \
  --base main \
  --head "$BRANCH" \
  --title "Test vertical staging Grok review" \
  --body "Exercises the new independent staging App path with inert text only.")"
gh pr view "$PR_URL" \
  --json number,url,headRefOid,headRefName \
  >"$PR_CONTEXT"
chmod 600 "$PR_CONTEXT"
jq -e --arg branch "$BRANCH" '
  (.number | tostring | test("^[1-9][0-9]*$"))
  and (.url | type == "string")
  and (.headRefOid | test("^[0-9a-f]{40}$"))
  and (.headRefName == $branch)' "$PR_CONTEXT"
```

- [ ] **Step 2: Observe signed admission and report `request_admitted`**

Use the App delivery UI to require a `pull_request`/`opened` delivery with `2xx`. Query only safe D1 metadata into private evidence:

```bash
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" d1 execute DB \
  --remote --json --config "$CONFIG" \
  --command "SELECT request_id, receipt_id, pull_number, trigger_kind,
                    status, expected_head_sha,
                    workflow_run_id, workflow_html_url, check_run_id,
                    authorized_at, created_at, updated_at
             FROM review_requests
             WHERE expected_head_sha = '$PR_HEAD'
               AND pull_number = '$PR_NUMBER'
               AND trigger_kind = 'automatic'
             ORDER BY request_id DESC;
             SELECT job_id, job_type, request_id, status, attempt_count,
                    last_error_code
             FROM outbox_jobs
             WHERE request_id = (
               SELECT request_id FROM review_requests
               WHERE expected_head_sha = '$PR_HEAD'
                 AND pull_number = '$PR_NUMBER'
                 AND trigger_kind = 'automatic'
               ORDER BY request_id DESC LIMIT 1
             )
             ORDER BY job_id" \
  >"$PRIVATE_ROOT/request-admission.json" 2>"$PRIVATE_ROOT/request-admission.err"
chmod 600 "$PRIVATE_ROOT/request-admission.json" "$PRIVATE_ROOT/request-admission.err"

jq -e --arg head "$PR_HEAD" --arg pull "$PR_NUMBER" '
  (.[0].results[0]) as $request
  | length == 2
  and (.[0].success == true) and (.[0].results | length == 1)
  and (($request.request_id | tostring) | test("^[1-9][0-9]*$"))
  and ($request.expected_head_sha == $head)
  and (($request.pull_number | tostring) == $pull)
  and ($request.trigger_kind == "automatic")
  and (.[1].success == true)
  and ([.[1].results[] | select(
    .job_type == "dispatch"
    and ((.request_id | tostring) == ($request.request_id | tostring))
  )] | length == 1)' \
  "$PRIVATE_ROOT/request-admission.json"
```

Require the one request to be bound to `PR_HEAD` and its one dispatch outbox
job. The request ID in this file is the sole request identity used by every
remaining step. Report milestone `request_admitted`; do not report test totals.

- [ ] **Step 3: Observe the immutable central run and report `workflow_bound`**

Poll at bounded intervals while continuing concise commentary updates. On each
poll run the same read-only query, replacing the private file atomically only
after a successful command:

```bash
REQUEST_ID="$(jq -r '.[0].results[0].request_id' \
  "$PRIVATE_ROOT/request-admission.json")"
test "$REQUEST_ID" != "null"
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" d1 execute DB \
  --remote --json --config "$CONFIG" \
  --command "SELECT request_id, receipt_id, status, workflow_run_id,
                    workflow_run_url, workflow_html_url
             FROM review_requests
             WHERE request_id = '$REQUEST_ID'" \
  >"$PRIVATE_ROOT/request-bound.json.next" \
  2>"$PRIVATE_ROOT/request-bound.err"
mv "$PRIVATE_ROOT/request-bound.json.next" "$PRIVATE_ROOT/request-bound.json"
chmod 600 "$PRIVATE_ROOT/request-bound.json" "$PRIVATE_ROOT/request-bound.err"
jq -e --arg request "$REQUEST_ID" '
  .[0].success == true
  and (.[0].results | length == 1)
  and ((.[0].results[0].request_id | tostring) == $request)
  and ((.[0].results[0].workflow_run_id | tostring) | test("^[1-9][0-9]*$"))
  and (.[0].results[0].workflow_run_url | type == "string")
  and (.[0].results[0].workflow_html_url | type == "string")' \
  "$PRIVATE_ROOT/request-bound.json"
```

Require non-null D1 `workflow_run_id`, `workflow_run_url`, and
`workflow_html_url`, then compare them to:

```bash
gh run list \
  --repo xliberty2008x/grok-review-xliberty \
  --workflow "Grok Review App worker" \
  --event workflow_dispatch \
  --limit 10 \
  --json databaseId,status,conclusion,headBranch,headSha,url,createdAt \
  >"$PRIVATE_ROOT/workflow-runs.json"
chmod 600 "$PRIVATE_ROOT/workflow-runs.json"

WORKFLOW_RUN_ID="$(jq -r '.[0].results[0].workflow_run_id' \
  "$PRIVATE_ROOT/request-bound.json")"
WORKFLOW_HTML_URL="$(jq -r '.[0].results[0].workflow_html_url' \
  "$PRIVATE_ROOT/request-bound.json")"
jq -e \
  --arg run "$WORKFLOW_RUN_ID" \
  --arg url "$WORKFLOW_HTML_URL" \
  --arg commit "$RUNTIME_COMMIT" \
  --arg tag "$RUNTIME_TAG" '
    [.[] | select(
      ((.databaseId | tostring) == $run)
      and (.url == $url)
      and (.headSha == $commit)
      and (.headBranch == $tag)
    )] | length == 1' \
  "$PRIVATE_ROOT/workflow-runs.json"
```

Require exactly one matching run whose `headSha` equals `RUNTIME_COMMIT`,
`headBranch` equals `RUNTIME_TAG`, and URL/run ID equal D1. Report
`workflow_bound`.

- [ ] **Step 4: Observe live authority and report `runner_authorized`**

Requery only the admitted request. Require non-null `authorized_at` and
`check_run_id`, then fetch exact-head Checks privately:

```bash
REQUEST_ID="$(jq -r '.[0].results[0].request_id' \
  "$PRIVATE_ROOT/request-admission.json")"
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" d1 execute DB \
  --remote --json --config "$CONFIG" \
  --command "SELECT request_id, authorized_at, check_run_id, status
             FROM review_requests
             WHERE request_id = '$REQUEST_ID'" \
  >"$PRIVATE_ROOT/request-authorized.json" \
  2>"$PRIVATE_ROOT/request-authorized.err"
chmod 600 "$PRIVATE_ROOT/request-authorized.json" \
  "$PRIVATE_ROOT/request-authorized.err"
jq -e --arg request "$REQUEST_ID" '
  .[0].success == true
  and (.[0].results | length == 1)
  and ((.[0].results[0].request_id | tostring) == $request)
  and (.[0].results[0].authorized_at | type == "string")
  and ((.[0].results[0].check_run_id | tostring) | test("^[1-9][0-9]*$"))' \
  "$PRIVATE_ROOT/request-authorized.json"

gh api \
  -H 'Accept: application/vnd.github+json' \
  "repos/xliberty2008x/grok-review-app-e2e/commits/$PR_HEAD/check-runs" \
  >"$PRIVATE_ROOT/check-runs.json"
chmod 600 "$PRIVATE_ROOT/check-runs.json"

AUTHORIZED_CHECK_ID="$(jq -r '.[0].results[0].check_run_id' \
  "$PRIVATE_ROOT/request-authorized.json")"
jq -e \
  --arg check "$AUTHORIZED_CHECK_ID" \
  --arg head "$PR_HEAD" \
  --arg app "$STAGING_APP_ID" '
    [.check_runs[] | select(
      .name == "Grok review"
      and ((.id | tostring) == $check)
      and (.head_sha == $head)
      and ((.app.id | tostring) == $app)
    )] | length == 1' \
  "$PRIVATE_ROOT/check-runs.json"
```

Require one `Grok review` Check on `PR_HEAD` owned by the staging App. Report `runner_authorized`.

- [ ] **Step 5: Wait for the same workflow to finish without starting duplicate work**

Extract the D1-bound run ID into `WORKFLOW_RUN_ID` without printing it, then
watch only that run:

```bash
WORKFLOW_RUN_ID="$(jq -r '.[0].results[0].workflow_run_id' \
  "$PRIVATE_ROOT/request-bound.json")"
test "$WORKFLOW_RUN_ID" != "null"
gh run watch "$WORKFLOW_RUN_ID" \
  --repo xliberty2008x/grok-review-xliberty \
  --exit-status \
  >"$PRIVATE_ROOT/workflow-watch.log" 2>&1
chmod 600 "$PRIVATE_ROOT/workflow-watch.log"
```

If the process yields a running session, poll it rather than launching another
watcher. Continue reporting only milestone changes or a concrete blocking
boundary.

Expected: workflow concludes success. A timeout, failure, or cancellation is one observed vertical failure for Task 7; do not start unrelated fixes.

- [ ] **Step 6: Observe App-visible exact-head output without declaring terminal success**

Fetch reviews and Checks into private evidence:

```bash
gh api "repos/xliberty2008x/grok-review-app-e2e/pulls/$PR_NUMBER/reviews" \
  >"$PRIVATE_ROOT/reviews.json"
gh api \
  -H 'Accept: application/vnd.github+json' \
  "repos/xliberty2008x/grok-review-app-e2e/commits/$PR_HEAD/check-runs" \
  >"$PRIVATE_ROOT/check-runs-final.json"
chmod 600 "$PRIVATE_ROOT/reviews.json" "$PRIVATE_ROOT/check-runs-final.json"
```

Require a completed App-owned `Grok review` Check and one native `COMMENT`
review whose login is the exact verified `STAGING_APP_SLUG` followed by
`[bot]`, both on `PR_HEAD`. Do not quote model prose in logs or commentary.

- [ ] **Step 7: Read the terminal receipt projection from D1**

Run:

```bash
REQUEST_ID="$(jq -r '.[0].results[0].request_id' \
  "$PRIVATE_ROOT/request-admission.json")"
NO_COLOR=1 "$NODE22" "$WRANGLER_JS" d1 execute DB \
  --remote --json --config "$CONFIG" \
  --command "SELECT r.receipt_id, r.request_id, r.workflow_run_id, r.event,
                    r.status, r.check_id, r.algorithm, r.key_id, r.signature,
                    r.receipt_digest, r.finding_count, r.receipt_json,
                    json_extract(r.receipt_json, '$.source.head_sha') AS head_sha,
                    json_extract(r.receipt_json, '$.runtime.plugin_commit') AS plugin_commit,
                    json_extract(r.receipt_json, '$.runtime.bundle_sha256') AS bundle_sha256,
                    json_extract(r.receipt_json, '$.execution.provider_launched') AS provider_launched,
                    json_extract(r.receipt_json, '$.execution.structured_output_valid') AS structured_output_valid,
                    json_extract(r.receipt_json, '$.posting.event') AS posting_event
             FROM sanitized_receipts r
             WHERE r.request_id = '$REQUEST_ID'" \
  >"$PRIVATE_ROOT/terminal-receipt.json" 2>"$PRIVATE_ROOT/terminal-receipt.err"
chmod 600 "$PRIVATE_ROOT/terminal-receipt.json" "$PRIVATE_ROOT/terminal-receipt.err"
```

Require `status=completed`, `event=COMMENT`, `posting_event=COMMENT`,
`head_sha=PR_HEAD`, `plugin_commit=RUNTIME_COMMIT`, matching archive digest,
`provider_launched=1`, and `structured_output_valid=1`. Hold the milestone until
Step 8 independently verifies the signature and live bindings.

- [ ] **Step 8: Reconstruct the exact receipt marker and commit the final milestone**

Run this fixed verifier from the target root. It independently verifies the
stored Ed25519 envelope, binds the D1 request/run to GitHub, and prints only
safe status:

```bash
cd /Users/cyrildubovik/Documents/grok-review-xliberty
"$NODE22" --input-type=module -e '
  import fs from "node:fs";
  import {
    buildReceiptMarker,
    verifyReceiptEnvelope
  } from "./apps/grok-review-app/src/receipt-contract.mjs";
  const [receiptFile, boundFile, reviewFile, checksFile, publicKeyFile,
    head, runtime, bundle, appId, appSlug] = process.argv.slice(1);
  const receiptDoc = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  const receipt = receiptDoc?.[0]?.results?.[0];
  const bound = JSON.parse(fs.readFileSync(boundFile, "utf8"))?.[0]?.results?.[0];
  const reviews = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
  const checks = JSON.parse(fs.readFileSync(checksFile, "utf8"));
  if (!receipt || !bound || receipt.status !== "completed" || receipt.event !== "COMMENT"
      || receipt.posting_event !== "COMMENT" || receipt.head_sha !== head
      || receipt.plugin_commit !== runtime || receipt.bundle_sha256 !== bundle
      || receipt.receipt_id !== bound.receipt_id
      || String(receipt.request_id) !== String(bound.request_id)
      || String(receipt.workflow_run_id) !== String(bound.workflow_run_id)
      || Number(receipt.provider_launched) !== 1
      || Number(receipt.structured_output_valid) !== 1) process.exit(1);
  const envelope = {alg: receipt.algorithm, kid: receipt.key_id,
    receipt_sha256: receipt.receipt_digest, signature: receipt.signature};
  const publicKey = fs.readFileSync(publicKeyFile, "utf8");
  const verified = await verifyReceiptEnvelope(
    JSON.parse(receipt.receipt_json), envelope,
    JSON.stringify({[receipt.key_id]: publicKey})
  );
  if (!verified.ok
      || verified.receipt.receipt_id !== receipt.receipt_id
      || verified.receipt.receipt_id !== bound.receipt_id
      || verified.receipt.request.request_id !== String(bound.request_id)
      || verified.receipt.request.workflow_run_id !== String(bound.workflow_run_id)
      || verified.receipt.request.check_id !== String(receipt.check_id)
      || verified.receipt.source.head_sha !== head
      || verified.receipt.runtime.plugin_commit !== runtime
      || verified.receipt.runtime.bundle_sha256 !== bundle
      || verified.receipt.execution.provider_launched !== true
      || verified.receipt.execution.structured_output_valid !== true
      || verified.receipt.posting.event !== "COMMENT") process.exit(1);
  const marker = buildReceiptMarker(verified.receipt, verified.envelope);
  const review = reviews.find((item) => item?.user?.login === `${appSlug}[bot]`
    && item.state === "COMMENTED" && item.commit_id === head
    && typeof item.body === "string" && item.body.includes(marker));
  const check = checks?.check_runs?.find((item) => item.name === "Grok review"
    && item.head_sha === head && String(item.app?.id) === String(appId)
    && item.status === "completed" && item.conclusion === "neutral"
    && typeof item.output?.summary === "string" && item.output.summary.includes(marker));
  if (!review || !check || String(check.id) !== String(receipt.check_id)) process.exit(1);
  console.log(JSON.stringify({ok:true, provider_launched:true,
    structured_output_valid:true, event:"COMMENT", terminal:"completed"}));
' "$PRIVATE_ROOT/terminal-receipt.json" \
  "$PRIVATE_ROOT/request-bound.json" \
  "$PRIVATE_ROOT/reviews.json" \
  "$PRIVATE_ROOT/check-runs-final.json" \
  "$CREDENTIALS/receipt-signing-public.pem" \
  "$PR_HEAD" "$RUNTIME_COMMIT" "$RUNTIME_ARCHIVE_SHA256" \
  "$STAGING_APP_ID" "$STAGING_APP_SLUG"
```

Expected: the verifier prints only the safe success object. Report
`provider_completed`, then `app_output_visible`, then
`terminal_receipt_committed`. The vertical is now qualified.

---

### Task 7: Repair Only an Observed Vertical Failure

**Files:**

- Conditional modify: only the runtime/config file directly implicated by Task 6 evidence
- Conditional create: one focused regression only when production runtime behavior is defective
- Conditional create ignored: `evidence/private/vertical-staging/failure-amendment.md`
- Conditional create: a new immutable runtime tag; never move an existing tag

**Interfaces:**

- Consumes: one concrete failed milestone with private D1/GitHub/Worker evidence.
- Produces: either the same vertical rerun, or an explicit architectural stop. Skip this task entirely if Task 6 reaches `terminal_receipt_committed`.

- [ ] **Step 1: Freeze one failure before changing anything**

Record privately: highest completed milestone, exact request/run/check IDs, safe status/error codes, runtime commit/tag, and the boundary that failed. Do not store webhook bodies, repository content, prompts, model output, or credentials.

- [ ] **Step 2: Classify the failure and choose exactly one response**

Use this closed decision table:

| Evidence                                                                                           | Response                                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Wrong coordinate, secret pairing, App setting, installation state, tag/digest, or runner selection | Correct configuration only; no source commit                                  |
| GitHub/Cloudflare transient with durable pending/leased work                                       | Let the same request recover; do not create duplicate semantic work           |
| Terminal external failure after retry budget                                                       | Push one harmless new E2E commit to trigger a new exact-head request          |
| Runtime contract defect                                                                            | Add one regression for that defect, make the smallest runtime fix, and commit |
| Unknown cause                                                                                      | Add only bounded metadata diagnostics that separate the remaining hypotheses  |
| Repeated failure disproving the compatibility assumption                                           | Stop and return to design; do not accumulate patches                          |

- [ ] **Step 3: For a runtime defect, stop and write one exact repair amendment**

Do not improvise a generic commit from this plan. Before any runtime edit, use
`apply_patch` to create mode-0600 ignored
`evidence/private/vertical-staging/failure-amendment.md`. It must name:

- the one observed failure and safe evidence code;
- every runtime and regression-test path permitted to change;
- the exact focused RED command and expected failure;
- the smallest intended behavior change;
- the exact focused GREEN command;
- the independent reviewer and acceptance criterion.

Only after those concrete paths and commands are reviewed may the main agent
implement, stage those named paths individually, commit with message
`fix: repair observed staging vertical failure`, and push `main`. Never use
`git add -A`, `git add .`, or move an existing runtime tag.

- [ ] **Step 4: Publish the reviewed repair as a new immutable runtime**

After the repair commit and focused review are green, run:

```bash
RUNTIME_COMMIT="$(git rev-parse HEAD)"
RUNTIME_TAG="grok-review-runtime-$RUNTIME_COMMIT"
RUNTIME_ARCHIVE_SHA256="$(git archive --format=tar "$RUNTIME_COMMIT" | shasum -a 256 | awk '{print $1}')"
git tag "$RUNTIME_TAG" "$RUNTIME_COMMIT"
git push origin main
git push origin "refs/tags/$RUNTIME_TAG"
test "$(gh api "repos/$REPO/git/ref/tags/$RUNTIME_TAG" --jq .object.sha)" = \
  "$RUNTIME_COMMIT"

gh variable set GROK_REVIEW_RUNTIME_COMMIT -R "$REPO" --body "$RUNTIME_COMMIT"
gh variable set GROK_REVIEW_RUNTIME_BUNDLE_SHA256 -R "$REPO" --body "$RUNTIME_ARCHIVE_SHA256"

NO_COLOR=1 "$NODE22" "$WRANGLER_JS" deploy \
  --config "$CONFIG" \
  --var "CONTROL_REPO_OWNER:xliberty2008x" \
  --var "CONTROL_REPO_NAME:grok-review-xliberty" \
  --var "CONTROL_WORKFLOW_FILE:grok-review-app-worker.yml" \
  --var "CONTROL_REF:$RUNTIME_TAG" \
  --var "GITHUB_APP_ID:$STAGING_APP_ID" \
  >"$CLOUDFLARE_PRIVATE/failure-fix-deploy-$RUNTIME_COMMIT.log" 2>&1
```

- [ ] **Step 5: Rerun the same vertical immediately**

If the existing request can recover, retain it. If a new exact-head request is required, add one empty E2E commit and push it:

```bash
cd "$E2E_CLONE"
git commit --allow-empty -m "test: retry staging review vertical"
git push
gh pr view "$PR_URL" \
  --json number,url,headRefOid,headRefName \
  >"$PR_CONTEXT.next"
mv "$PR_CONTEXT.next" "$PR_CONTEXT"
chmod 600 "$PR_CONTEXT"
```

Return directly to Task 6 Step 2. Do not start any deferred matrix or horizontal work.

---

### Task 8: Seal the Private Receipt and Pause Before Horizontal Work

**Files:**

- Create ignored: `evidence/private/vertical-staging/qualification-summary.json`
- No tracked target change unless Task 7 produced a focused runtime fix

**Interfaces:**

- Consumes: successful fixed verifier from Task 6 and all eight completed milestones.
- Produces: private staging qualification receipt and an explicit pause before Task 4D.

- [ ] **Step 1: Write the bounded private qualification summary**

Using `apply_patch`, create mode-0600 ignored
`evidence/private/vertical-staging/qualification-summary.json`. Its root must
contain exactly these fields and no others:

| Field                     | Required value contract                                                         |
| ------------------------- | ------------------------------------------------------------------------------- |
| `schema_version`          | integer `1`                                                                     |
| `repository`              | exact string `xliberty2008x/grok-review-xliberty`                               |
| `runtime_commit`          | verified 40-character lowercase hexadecimal runtime commit                      |
| `runtime_tag`             | exact `grok-review-runtime-` prefix plus `runtime_commit`                       |
| `runtime_archive_sha256`  | verified 64-character lowercase hexadecimal archive digest                      |
| `e2e_repository`          | exact string `xliberty2008x/grok-review-app-e2e`                                |
| `pull_number`             | canonical positive decimal string from the live PR                              |
| `head_sha`                | verified 40-character lowercase hexadecimal PR head                             |
| `request_id`              | canonical positive decimal string from D1                                       |
| `workflow_run_id`         | canonical positive decimal string matching D1 and GitHub                        |
| `check_id`                | canonical positive decimal string matching the App Check and receipt            |
| `receipt_digest`          | verified 64-character lowercase hexadecimal receipt digest                      |
| `provider_launched`       | boolean `true`                                                                  |
| `structured_output_valid` | boolean `true`                                                                  |
| `posting_event`           | exact string `COMMENT`                                                          |
| `terminal_status`         | exact string `completed`                                                        |
| `milestones`              | the eight milestone strings in the exact order defined under Global Constraints |

Copy each dynamic value only from the already-verified private evidence in Task 6. Include no URL, App/installation/account/database ID, signature, receipt
body, model prose, credential, or secret.

- [ ] **Step 2: Validate and hash the private summary**

Run:

```bash
SUMMARY="$PRIVATE_ROOT/qualification-summary.json"
chmod 600 "$SUMMARY"
"$NODE22" --input-type=module -e '
  import fs from "node:fs";
  const [summaryFile, prFile, boundFile, receiptFile,
    runtime, tag, archive] = process.argv.slice(1);
  const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
  const pr = JSON.parse(fs.readFileSync(prFile, "utf8"));
  const bound = JSON.parse(fs.readFileSync(boundFile, "utf8"))?.[0]?.results?.[0];
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"))?.[0]?.results?.[0];
  const keys = ["schema_version", "repository", "runtime_commit", "runtime_tag",
    "runtime_archive_sha256", "e2e_repository", "pull_number", "head_sha",
    "request_id", "workflow_run_id", "check_id", "receipt_digest",
    "provider_launched", "structured_output_valid", "posting_event",
    "terminal_status", "milestones"];
  const milestones = ["staging_serving", "installation_authorized",
    "request_admitted", "workflow_bound", "runner_authorized",
    "provider_completed", "app_output_visible", "terminal_receipt_committed"];
  const exactKeys = Object.keys(summary).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(summary, key));
  if (!exactKeys || !bound || !receipt || summary.schema_version !== 1
      || summary.repository !== "xliberty2008x/grok-review-xliberty"
      || summary.runtime_commit !== runtime || summary.runtime_tag !== tag
      || summary.runtime_archive_sha256 !== archive
      || summary.e2e_repository !== "xliberty2008x/grok-review-app-e2e"
      || summary.pull_number !== String(pr.number)
      || summary.head_sha !== pr.headRefOid
      || summary.request_id !== String(bound.request_id)
      || summary.workflow_run_id !== String(bound.workflow_run_id)
      || summary.check_id !== String(receipt.check_id)
      || summary.receipt_digest !== receipt.receipt_digest
      || summary.provider_launched !== true
      || summary.structured_output_valid !== true
      || summary.posting_event !== "COMMENT"
      || summary.terminal_status !== "completed"
      || JSON.stringify(summary.milestones) !== JSON.stringify(milestones)) process.exit(1);
' "$SUMMARY" "$PR_CONTEXT" "$PRIVATE_ROOT/request-bound.json" \
  "$PRIVATE_ROOT/terminal-receipt.json" "$RUNTIME_COMMIT" \
  "$RUNTIME_TAG" "$RUNTIME_ARCHIVE_SHA256"
SUMMARY_SHA256="$(shasum -a 256 "$SUMMARY" | awk '{print $1}')"
test "${#SUMMARY_SHA256}" -eq 64
```

The ignored target-repository summary and its SHA-256 are the durable local
handoff. Do not depend on or recreate a session-specific `/private/tmp`
progress ledger.

- [ ] **Step 3: Final read-only preservation checks**

Run:

```bash
git -C /Users/cyrildubovik/Documents/grok-review-xliberty status --short --branch
git -C /Users/cyrildubovik/Documents/grok-review-xliberty log -3 --oneline
git -C /Users/cyrildubovik/Documents/grok-plugin-e2e rev-parse HEAD
git -C /Users/cyrildubovik/Documents/grok-plugin-e2e status --porcelain=v2 --branch
gh repo view xliberty2008x/grok-review-xliberty --json visibility,defaultBranchRef,url
```

Expected: target and source boundaries are preserved, remote is private, production remains untouched, and no Task 4D file exists beyond its already-committed pre-pivot state.

- [ ] **Step 4: Report lifecycle completion and stop**

Report the completed real lifecycle, exact target runtime commit, App-authored exact-head output, `provider_launched=true`, and terminal receipt status. Do not report progress as a test count. Keep the staging App, Worker, D1, and E2E PR for the next improvement cycle; do not delete production or staging resources and do not resume Task 4D without a new user direction.

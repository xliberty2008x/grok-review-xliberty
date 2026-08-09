# Private Grok Review GitHub App

This package is the central implementation for a **private, single-tenant**
GitHub App that reviews pull requests as an App bot. Installing the App is the
only target-repository setup: target repositories need no Grok workflow,
secret, auth watcher, or committed integration file.

The App automatically reviews non-draft pull requests when they are opened,
reopened, made ready, or updated by `synchronize`. Drafts are not reviewed
automatically. It also supports an App-owned
`Run Grok review` / `Re-run Grok review` Check action and the exact PR command
`@grok-review review`. A manual caller is authorized against their current
repository permission and must have `write`, `maintain`, or `admin`.

Every successful run submits one native pull-request review with
`event: COMMENT`. The review always contains the Grok summary, including a
visible zero-finding result, and maps valid findings to inline review threads.
A structured suggestion becomes a GitHub suggestion block only when its full
range is on the reviewed RIGHT-side diff for the exact reviewed head.
The App does not automatically converse in replies to review threads.

## Architecture

```text
selected target repository
        │ GitHub App webhook
        ▼
Cloudflare Worker ── D1 control metadata
        │ transactional outbox + workflow_dispatch with numeric identities only
        ▼
static staging or production macos-latest GitHub Actions workflow
        ├─ download and attest the immutable same-tag Grok asset
        ├─ mint exact-repository installation token
        ├─ collect exact PR head, merge-base diff, and AGENTS.md blobs
        ├─ revoke/remove GitHub credentials
        ├─ run the pinned, tool-free Grok reviewer on a bounded packet
        ├─ mint a separate posting token and re-check the live head
        ├─ post App-authored Check + COMMENT review
        └─ sign and return a sanitized receipt
```

The Worker exposes exactly `POST /github/webhooks`. It verifies the raw webhook
HMAC before JSON parsing, applies event and payload bounds, deduplicates
`X-GitHub-Delivery`, and admits only active authorized installations. Admission
and an idempotent dispatch job are committed together in D1; scheduled and
best-effort drains lease the durable outbox before dispatching the bound
static staging or production workflow. D1 stores installation,
delivery, request, workflow/check, and sanitized receipt metadata only. It does
not store repository code, diffs, prompts, GitHub tokens, Grok credentials, or
model output.

The central runner fetches `refs/pull/<number>/head` into an isolated bare
repository and never executes target code, workflows, hooks, submodules,
package managers, or project configuration. Fork pull requests are reviewed
through GitHub data access under the installation; fork code is never executed.
The Grok child receives only the bounded review packet and Grok authentication,
not an installation token, App key, posting token, target checkout, or runner
environment.

Instructions come from the exact PR head as Git blobs, without following
symlinks. Root `AGENTS.md` applies globally; ancestor-directory files apply to
changed files below them, with deeper guidance taking precedence. Collection is
limited to 32 instruction files, 32 KiB each, and 128 KiB total. A limit or
configuration violation is visible instead of silently dropping guidance.
Receipt evidence records paths and blob digests, never instruction contents.
Each signed sanitized receipt also binds the base/head SHA, diff
digest/bytes/files, prompt/schema/runtime/model versions, actual provider
launch, structured-output validation, duration, finding count, trigger, and an
opaque receipt ID.

## GitHub App registration

Use [`github-app-manifest.template.json`](github-app-manifest.template.json) as
the registration source of truth. Replace the reserved `.invalid` host in a
secure deployment copy with the deployed Worker host; never commit an
environment URL or generated App credential.

The App is private (`public: false`), does not request OAuth during installation,
and has exactly these repository permissions:

| Permission    | Access       |
| ------------- | ------------ |
| Contents      | Read         |
| Pull requests | Read & write |
| Checks        | Read & write |
| Issues        | Read         |
| Metadata      | Read         |

It subscribes only to `pull_request`, `issue_comment`, `check_run`,
`installation`, and `installation_repositories`. It has no target-repository
Actions, Workflows, Administration, Secrets, or organization permissions.

GitHub documents the manifest fields and private/OAuth switches in
[Registering a GitHub App from a manifest](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest).
The requested-action button follows GitHub's
[Checks requested-actions contract](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks);
reviews use the
[pull-request Reviews API](https://docs.github.com/en/rest/pulls/reviews).

## Configuration

### Cloudflare Worker

Non-secret vars:

| Name                    | Meaning                                                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTROL_REPO_OWNER`    | Owner of the central control repository                                                                                                                                                                                                                                                       |
| `CONTROL_REPO_NAME`     | Central control repository name                                                                                                                                                                                                                                                               |
| `CONTROL_WORKFLOW_FILE` | Static environment-bound runner: `grok-review-app-worker-staging.yml` or `grok-review-app-worker-production.yml`                                                                                                                                                                              |
| `CONTROL_REF`           | Immutable control-repo tag `grok-review-runtime-<40 lowercase hex>`; must point to the same commit as `GROK_REVIEW_RUNTIME_COMMIT`. GitHub `workflow_dispatch.ref` accepts a branch or tag name, not a raw SHA; the runner still hard-gates `GITHUB_SHA`, checked-out HEAD, and bundle digest |
| `GITHUB_APP_ID`         | Canonical decimal App ID used for App-owned Check validation                                                                                                                                                                                                                                  |
| `RUNTIME_COMMIT`        | Exact trusted plugin commit as lowercase 40-hex; must match the immutable runtime tag target and Actions `GROK_REVIEW_RUNTIME_COMMIT`. Required by `/health` and `/healthz`                                                                                                                   |

Secrets:

| Name                          | Meaning                                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEBHOOK_SECRET`              | High-entropy GitHub App webhook secret, 32–4096 UTF-8 bytes without control characters                                                                                  |
| `RUNNER_CALLBACK_SECRET`      | HMAC key shared only with the central workflow, 32–4096 UTF-8 bytes without control characters                                                                          |
| `RUNNER_CALLBACK_SECRET_NEXT` | Optional second callback HMAC for rotation overlap; same validity rules as primary. Absent or empty means primary-only; malformed values fail closed as `misconfigured` |
| `CONTROL_REPO_TOKEN`          | Fine-grained token with Actions write on the central control repository only                                                                                            |
| `RECEIPT_PUBLIC_KEYS_JSON`    | Trusted map of Ed25519 public SPKI keys keyed by the runner-derived key ID                                                                                              |

`RECEIPT_PUBLIC_KEYS_JSON` is stored as a Worker secret because it is operational
trust configuration, even though it contains public keys. The Worker receives
no receipt private key and no GitHub App private key.

Runner callbacks use `X-Grok-Signature`, `X-Grok-Timestamp`, and
`X-Grok-Nonce`; the signature authenticates the exact timestamp, nonce, and raw
callback body before D1 accepts a state transition.

For callback rotation, publish the new value to the Worker first as
`RUNNER_CALLBACK_SECRET_NEXT`, then configure the runner's
`RUNNER_CALLBACK_SECRET` with that same value. After every old-key run is
terminal, promote the new value to the Worker's primary secret and remove the
overlap secret.

### Central GitHub Actions repository

Two static dispatch workflows own the runner entrypoints:

| Workflow file                           | GitHub environment          |
| --------------------------------------- | --------------------------- |
| `grok-review-app-worker-staging.yml`    | `review-staging-runtime`    |
| `grok-review-app-worker-production.yml` | `review-production-runtime` |

Each workflow accepts the same seven closed `workflow_dispatch` inputs, checks
out the immutable runtime tag, downloads and attests the exact release asset
`grok-0.2.112-darwin-arm64` (size `129363664`, SHA-256
`5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4`) from the
same repository and tag using the job's read-only `github.token`, and hands the
verified absolute `GROK_BIN` to the runner through `GITHUB_ENV`. There is no
per-run `npm install`, no mutable action tag, and no home-installed Grok path.

Secrets (environment-scoped except where noted):

| Name                          | Meaning                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `GROK_REVIEW_APP_PRIVATE_KEY` | GitHub-generated **RSA** App private key (PEM)                                              |
| `GROK_AUTH_JSON`              | Central dedicated Grok Build login material (repository secret shared by both environments) |
| `RUNNER_CALLBACK_SECRET`      | Same callback HMAC key configured on the Worker                                             |
| `RECEIPT_SIGNING_PRIVATE_KEY` | Separate **Ed25519** receipt-signing private key (PKCS#8 PEM)                               |

Variables (environment-scoped):

| Name                                | Meaning                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `GROK_REVIEW_APP_CLIENT_ID`         | App client ID used as the GitHub App JWT issuer                    |
| `GROK_REVIEW_APP_ID`                | Numeric App ID used for App/check identity validation              |
| `GROK_REVIEW_WORKER_URL`            | Worker origin, without the webhook path                            |
| `GROK_REVIEW_RUNTIME_COMMIT`        | Exact trusted plugin commit used by the runner                     |
| `GROK_REVIEW_RUNTIME_BUNDLE_SHA256` | SHA-256 of `git archive --format=tar <GROK_REVIEW_RUNTIME_COMMIT>` |
| `GROK_CLI_VERSION`                  | Exact supported CLI version: `0.2.112`                             |
| `RECEIPT_SIGNING_PUBLIC_KEY`        | Public Ed25519 SPKI PEM matching the receipt private key           |
| `GROK_MODEL`                        | Optional pinned model override                                     |
| `GROK_EFFORT`                       | Optional pinned effort override                                    |

The receipt key ID is derived from the Ed25519 public SPKI; it is not another
configured ID. `RECEIPT_SIGNING_PUBLIC_KEY` must match both
`RECEIPT_SIGNING_PRIVATE_KEY` and the same entry in the Worker's
`RECEIPT_PUBLIC_KEYS_JSON`. The RSA GitHub App key and Ed25519 receipt key are
separate credentials with separate purposes and must never be reused.

## Security and posting limits

- Automatic draft review is disabled; an authorized manual review remains
  available.
- Webhook admission never supersedes PR work. Every automatic, mention, and
  Check-triggered run must first re-fetch live PR authority (including the exact
  automatic head and manual caller permission), then record an authenticated
  one-shot `authorized` fence. That fence supersedes only lower request IDs, so
  a run that turns stale during its authority check cannot cancel newer work.
- A newer PR head cancels or supersedes older work. Only a current-head result
  is eligible for submission.
- Model-generated mentions and the host receipt marker are escaped or reserved
  before posting.
- The review event is always `COMMENT`, never `APPROVE` or
  `REQUEST_CHANGES`; reviews are informational and non-blocking.
- Ambiguous GitHub API responses are reconciled by the host-generated receipt
  marker before retry.
- The current GitHub Reviews API accepts a `commit_id`, but exposes no atomic
  “submit only if this remains the current head” condition or idempotency key.
  The runner therefore uses a pending review, re-fetches the live head
  immediately before submission, reconciles ambiguous responses, and marks a
  detected post-submit drift as superseded. This minimizes the final-call race;
  it does not claim the race is impossible.
- Whether the App bot appears in GitHub's Reviewers picker is a live prototype,
  not a guaranteed interface. There is no machine-user PAT fallback. The
  guaranteed manual interfaces are the Check action and exact mention command.

## Operations

The complete deployment, qualification, and guarded migration procedure is in
[`docs/operations/private-grok-review-app.md`](../../docs/operations/private-grok-review-app.md).
Do not remove a target repository's legacy workflow, secret, or watcher until
the dual-run live qualification gate in that runbook passes.

## Local checks

```bash
node --test tests/grok-review-app-worker.test.mjs
node --test tests/grok-review-app-github.test.mjs
node --test tests/grok-review-app-runner.test.mjs
node --test tests/grok-review-app-target-collector.test.mjs
node scripts/validate.mjs
```

These checks support implementation confidence but do not qualify the external
App lifecycle. Production acceptance requires an installed App, a real webhook,
the static environment-bound hosted workflow, an actual Grok provider launch
from the immutable release asset, and an App-authored review/check on the exact
current head.

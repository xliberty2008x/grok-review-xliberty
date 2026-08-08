# Frozen hosted-review runtime

The tracked record in `frozen-runtime.json` is the stable, non-secret portion of
the parity baseline. It freezes the runtime tag and commit, source archive,
Node and Grok identities, model settings, and the test-count transition from
104 frozen tests to 105 current tests. The additional current test is the
post-baseline `immutable-control-ref` security delta.

This record is not live qualification. It contains no deployed URL, account or
database coordinate, GitHub App or installation identifier, credential, key,
token, or secret value. Phase 0 is complete only after an operator creates a
fresh ignored capture and independently compares its protected-name and digest
inventory with the expected production baseline.

## Read-only capture

Create owned mode-0700 private directories beneath `evidence/private/`, prepare a private
Wrangler deployment configuration, and prepare an operator attestation JSON.
Then run:

```sh
install -d -m 700 evidence/private evidence/private/phase-0
node scripts/capture-baseline.mjs \
  --source-repo /absolute/path/to/grok-plugin-e2e \
  --out /absolute/path/to/grok-review-xliberty/evidence/private/phase-0/live.json
```

The script requires these environment inputs:

- `GROK_BASELINE_WRANGLER_CONFIG`: absolute path to the private live Wrangler
  configuration;
- `GROK_BASELINE_OPERATOR_ATTESTATION`: absolute path to the operator JSON;

The production entry resolves fixed `git`, `gh`, and `wrangler` names from
absolute `PATH` entries. It has no environment override for executables,
repository identity, expected names, or frozen values. Child processes receive
per-tool environment allowlists so Git never receives GitHub or Cloudflare
credentials and neither hosted CLI receives Grok/App/runtime secrets.

The attestation has `schema_version: 1`, canonical RFC3339 timestamps, and these
required sections:

- `app_settings_ui`: fresh observation time, private status,
  OAuth-on-install status, hook-active status, selected-repository installation
  scope, exact repository permissions/events, and SHA-256 digests of the private
  Worker origin and full `/github/webhooks` endpoint;
- `worker_settings_ui`: fresh observation time, Worker-name, active-version,
  account-coordinate SHA-256 digests, and exact `*/1 * * * *` schedule;
- `wrangler_coordinates`: fresh observation time and SHA-256 digests of the
  private account and D1 coordinates read from the exact private config;
- `callback_hmac_source`: boolean `exists` plus a fresh observation time. Both
  `true` and `false` are valid observations and are recorded exactly; `false`
  means an operator-controlled production callback-HMAC source copy was not
  established by the observation;
- `last_live_qualification`: ISO observation time, SHA-256 of its private
  locator, SHA-256 of the evidence, and `provider_launched: true` and
  `app_authored_output: true`. This receipt may be older, but never future.

This is a closed JSON contract. The root and every section above must contain
exactly its documented keys, including exactly the five named permission keys;
unknown and missing keys are rejected before evidence publication.

The locator and protected values themselves must not appear in the attestation
or output. GitHub and Cloudflare write-only secret stores do not prove that an
operator-controlled callback HMAC source copy exists.

The CLI surface is intentionally bounded and read-only. Every GitHub call is
fixed to `github.com/xliberty2008x/grok-plugin`: exact repository
variable/secret/environment names, six safe frozen-variable reads, and one
successful `grok-review-app-worker.yml` run. Wrangler 4.120.0 uses
`deployments status --json`, selects the sole 100%-serving version, reads that
version through `versions view VERSION --json`, and uses
`secret list --format json`. It does not use `versions[0]`, infer cron from
version metadata, or use `d1 migrations list` as an applied ledger.

D1 is read only through `d1 execute DB --remote --json` with the fixed queries
`SELECT id, name FROM d1_migrations ORDER BY id` and
`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN
('table','index') ORDER BY type,name`. The first must exactly match the ordered
checked-in migration names. The second projects and hashes stable result rows;
volatile Wrangler response metadata is discarded.

Output contains names, presence, approved runtime constants, safe timestamps
or their digests, and digests of configuration—not protected values or
deployed coordinates. It also contains closed attributable projections for the
root operator observation, complete Worker-settings UI observation, and
Wrangler-coordinate observation. Private account/database fields are renamed
to safe `account_sha256` and `database_sha256` fields. The operator projection
binds `exact_bytes_sha256`, computed over the exact validated attestation file
bytes rather than a reserialization.

Before and after those calls the script records the source HEAD and SHA-256 of
porcelain-v2 status, tracked diff bytes, and the untracked-path list. It refuses
to publish the capture if any byte changes, if the source HEAD/archive drifts,
or if any exact name, type, mapping, coordinate digest, active version, cron,
ledger, URL digest, or attestation drifts. Publication uses exclusive no-follow
staging, byte and directory fsync, a no-overwrite hard link, and parent identity
revalidation; failure cleans staging and any partial target.

Ordinary tests are target-only and do not require a donor checkout. A
controller may independently recompute the frozen 105 source identities with:

```sh
node scripts/verify-ported-tests.mjs \
  --source-root /absolute/path/to/grok-plugin-e2e
```

Task 2 intentionally tracks eleven paths: the original ten baseline files plus
the reviewed `NOTICE` attribution correction. No ignored live evidence is part
of the commit.

## Private handoff receipt

Immediately after a successful capture, use the same unchanged attestation file
to create the deterministic ignored handoff:

```sh
node scripts/capture-baseline.mjs handoff \
  --baseline /absolute/path/to/grok-review-xliberty/evidence/private/phase-0/live.json \
  --attestation /absolute/private/path/operator-attestation.json \
  --out /absolute/path/to/grok-review-xliberty/evidence/private/phase-0/handoff.json
```

The baseline must be below this repository's owned mode-0700 private evidence
root. Baseline and attestation inputs must be owned private regular files; the
handoff output uses the same exclusive, no-follow, no-clobber publication path
as the baseline. Replacing the attestation after capture makes handoff creation
or later `verifyHandoffReceipt` verification fail.

The receipt contains only SHA-256 locator/file bindings, the frozen runtime
commit/tag, last-live locator/evidence digests and true qualification booleans,
the callback-source boolean/timestamp, and equal source-before/source-after
identity digests with `unchanged: true`. It contains no raw locator, deployed
URL, account/database/App/installation identifier, token, key, or secret value.

The source baseline for this phase is
`aee1171c2f346948feb2864784e13abe020dcb34`; the frozen runtime within that
source repository is
`ea3594fb1f7cc546ede6d3dca2282860e54b8721` at tag
`grok-review-runtime-ea3594fb1f7cc546ede6d3dca2282860e54b8721`.

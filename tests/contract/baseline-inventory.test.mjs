import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as capture from "../../scripts/capture-baseline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STABLE = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/provenance/frozen-runtime.json"), "utf8"));
const EXPECTED_STABLE = Object.freeze({
  schema_version: 1,
  runtime_commit: "ea3594fb1f7cc546ede6d3dca2282860e54b8721",
  runtime_tag: "grok-review-runtime-ea3594fb1f7cc546ede6d3dca2282860e54b8721",
  source_archive_sha256: "964a3a18f54f433577a854c6bb2e6bdb498e983d5c53d9371d7916d4e1031fc9",
  node_version: "22.17.1",
  grok_version: "0.2.112",
  grok_binary_sha256: "5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4",
  grok_package_integrity_sha256: "49862ac444a3ca9db560cac29c96b5f2503b4b004a61ac9ac64a558842398143",
  grok_package_commit: "9bbd559437aaef77f2830978da7fcc8f59b07e33",
  model: "grok-4.6",
  effort: "high",
  frozen_app_test_count: 104,
  required_current_test_count: 105,
  post_baseline_security_deltas: ["immutable-control-ref"]
});
const FORBIDDEN_FIELD = /(?:^|_)(?:url|account_id|database_id|app_id|installation_id|token|key|secret_value)(?:$|_)/i;
const NOW = "2026-08-08T12:00:00.000Z";
const FRESH = "2026-08-08T11:30:00.000Z";
const WORKER_ID = "active-version-coordinate";
const OLD_WORKER_ID = "older-uploaded-inactive-coordinate";
const ACCOUNT_ID = "a".repeat(32);
const DATABASE_ID = "11111111-2222-4333-8444-555555555555";
const APP_ID = "1234567";
const WORKER_ORIGIN = "https://production-worker.example.test";
const WEBHOOK = `${WORKER_ORIGIN}/github/webhooks`;

const EXPECTED_REPO_VARIABLES = [
  "GROK_CLI_VERSION",
  "GROK_MODEL",
  "GROK_REVIEW_APP_CLIENT_ID",
  "GROK_REVIEW_APP_ID",
  "GROK_REVIEW_RUNTIME_BUNDLE_SHA256",
  "GROK_REVIEW_RUNTIME_COMMIT",
  "GROK_REVIEW_WORKER_URL",
  "RECEIPT_SIGNING_PUBLIC_KEY"
];
const EXPECTED_REPO_SECRETS = [
  "GROK_AUTH_JSON",
  "GROK_REVIEW_APP_PRIVATE_KEY",
  "RECEIPT_SIGNING_PRIVATE_KEY",
  "RUNNER_CALLBACK_SECRET"
];
const EXPECTED_WORKER_SECRETS = [
  "CONTROL_REPO_TOKEN",
  "RECEIPT_PUBLIC_KEYS_JSON",
  "RUNNER_CALLBACK_SECRET",
  "WEBHOOK_SECRET"
];

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertNoForbiddenFields(value, location = "$") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoForbiddenFields(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(FORBIDDEN_FIELD.test(key), false, `forbidden field ${location}.${key}`);
    assertNoForbiddenFields(child, `${location}.${key}`);
  }
}

test("committed frozen runtime contains only the approved stable baseline", () => {
  assert.deepEqual(STABLE, EXPECTED_STABLE);
  assertNoForbiddenFields(STABLE);
});

function expectedContract() {
  return {
    ...STABLE,
    source_head: "b".repeat(40),
    github_host: "github.com",
    github_repository: "xliberty2008x/grok-plugin",
    worker_name: "grok-review-app",
    control_repo_owner: "xliberty2008x",
    control_repo_name: "grok-plugin",
    control_workflow_file: "grok-review-app-worker.yml",
    repo_variable_names: EXPECTED_REPO_VARIABLES,
    repo_protected_names: EXPECTED_REPO_SECRETS,
    environment_names: [],
    worker_protected_names: EXPECTED_WORKER_SECRETS,
    worker_binding_types: {
      CONTROL_REF: "plain_text",
      CONTROL_REPO_NAME: "plain_text",
      CONTROL_REPO_OWNER: "plain_text",
      CONTROL_REPO_TOKEN: "secret_text",
      CONTROL_WORKFLOW_FILE: "plain_text",
      DB: "d1",
      GITHUB_APP_ID: "plain_text",
      RECEIPT_PUBLIC_KEYS_JSON: "secret_text",
      RUNNER_CALLBACK_SECRET: "secret_text",
      WEBHOOK_SECRET: "secret_text"
    },
    cron_schedules: ["*/1 * * * *"],
    migration_names: ["0001_init.sql"],
    source_configuration: {
      app_manifest_sha256: "1".repeat(64),
      worker_config_sha256: "2".repeat(64),
      workflow_sha256: "3".repeat(64),
      migration_set_sha256: "4".repeat(64),
      workflow_variable_names: EXPECTED_REPO_VARIABLES,
      workflow_protected_names: EXPECTED_REPO_SECRETS
    }
  };
}

function attestation() {
  return {
    schema_version: 1,
    observed_at: FRESH,
    app_settings_ui: {
      observed_at: FRESH,
      public: false,
      request_oauth_on_install: false,
      hook_active: true,
      installation_scope: "selected_repositories",
      permissions: {
        checks: "write",
        contents: "read",
        issues: "read",
        metadata: "read",
        pull_requests: "write"
      },
      events: ["check_run", "installation", "installation_repositories", "issue_comment", "pull_request"],
      worker_origin_sha256: digest(WORKER_ORIGIN),
      webhook_sha256: digest(WEBHOOK)
    },
    worker_settings_ui: {
      observed_at: FRESH,
      worker_name_sha256: digest("grok-review-app"),
      active_version_sha256: digest(WORKER_ID),
      account_id_sha256: digest(ACCOUNT_ID),
      cron_schedules: ["*/1 * * * *"]
    },
    wrangler_coordinates: {
      observed_at: FRESH,
      account_id_sha256: digest(ACCOUNT_ID),
      database_id_sha256: digest(DATABASE_ID)
    },
    callback_hmac_source: { exists: true, observed_at: FRESH },
    last_live_qualification: {
      observed_at: "2026-08-01T08:00:00.000Z",
      locator_sha256: "5".repeat(64),
      evidence_sha256: "6".repeat(64),
      provider_launched: true,
      app_authored_output: true
    }
  };
}

function deployment(overrides = {}) {
  return {
    id: "deployment-coordinate",
    source: "wrangler",
    strategy: "percentage",
    author_email: "operator@example.test",
    created_on: FRESH,
    versions: [{ version_id: WORKER_ID, percentage: 100 }],
    ...overrides
  };
}

function versionView() {
  return {
    id: WORKER_ID,
    number: 7,
    metadata: { created_on: FRESH, author_email: "operator@example.test" },
    annotations: { "workers/message": "production" },
    resources: {
      script: { handlers: ["fetch", "scheduled"] },
      script_runtime: { compatibility_date: "2026-03-10" },
      bindings: [
        { name: "DB", type: "d1", id: DATABASE_ID },
        { name: "CONTROL_REPO_OWNER", type: "plain_text", text: "xliberty2008x" },
        { name: "CONTROL_REPO_NAME", type: "plain_text", text: "grok-plugin" },
        { name: "CONTROL_WORKFLOW_FILE", type: "plain_text", text: "grok-review-app-worker.yml" },
        { name: "CONTROL_REF", type: "plain_text", text: STABLE.runtime_tag },
        { name: "GITHUB_APP_ID", type: "plain_text", text: APP_ID },
        ...EXPECTED_WORKER_SECRETS.map((name) => ({ name, type: "secret_text" }))
      ]
    }
  };
}

function d1Response(rows, metadata = {}) {
  return [{
    results: rows,
    success: true,
    meta: {
      duration: 1.25,
      served_by: "volatile-colo",
      rows_read: rows.length,
      bookmark: "volatile-bookmark",
      ...metadata
    }
  }];
}

function githubFixture() {
  const calls = [];
  const values = new Map([
    ["GROK_REVIEW_RUNTIME_COMMIT", STABLE.runtime_commit],
    ["GROK_REVIEW_RUNTIME_BUNDLE_SHA256", STABLE.source_archive_sha256],
    ["GROK_CLI_VERSION", STABLE.grok_version],
    ["GROK_MODEL", STABLE.model],
    ["GROK_REVIEW_WORKER_URL", WORKER_ORIGIN],
    ["GROK_REVIEW_APP_ID", APP_ID]
  ]);
  return {
    calls,
    run(args) {
      calls.push(args);
      const joined = args.join(" ");
      if (joined.startsWith("variable list ")) return EXPECTED_REPO_VARIABLES.map((name) => ({ name, updatedAt: FRESH }));
      if (joined.startsWith("secret list ")) return EXPECTED_REPO_SECRETS.map((name) => ({ name, updatedAt: FRESH }));
      if (joined.startsWith("variable get ")) return values.get(args[2]);
      if (joined.startsWith("api ")) return { total_count: 0, environments: [] };
      if (joined.startsWith("run list ")) return [{
        headSha: STABLE.runtime_commit,
        conclusion: "success",
        createdAt: FRESH,
        updatedAt: FRESH
      }];
      throw new Error(`unexpected gh call: ${joined}`);
    }
  };
}

function wranglerFixture(options = {}) {
  const calls = [];
  return {
    calls,
    run(args) {
      calls.push(args);
      const joined = args.join(" ");
      if (joined.startsWith("deployments status ")) return options.deployment ?? deployment();
      if (joined.startsWith(`versions view ${WORKER_ID} `)) return options.version ?? versionView();
      if (joined.startsWith(`versions view ${OLD_WORKER_ID} `)) throw new Error("inactive version selected");
      if (joined.startsWith("secret list ")) return EXPECTED_WORKER_SECRETS.map((name) => ({ name, type: "secret_text" }));
      if (joined.includes("SELECT id, name FROM d1_migrations ORDER BY id")) {
        return options.ledger ?? d1Response([{ id: 1, name: "0001_init.sql" }]);
      }
      if (joined.includes("SELECT type, name, tbl_name, sql FROM sqlite_master")) {
        return options.schema ?? d1Response([
          { type: "table", name: "d1_migrations", tbl_name: "d1_migrations", sql: "CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT UNIQUE)" },
          { type: "table", name: "review_requests", tbl_name: "review_requests", sql: "CREATE TABLE review_requests(id INTEGER PRIMARY KEY)" }
        ]);
      }
      throw new Error(`unexpected wrangler call: ${joined}`);
    }
  };
}

function collect(options = {}) {
  const gh = options.gh ?? githubFixture();
  const wrangler = options.wrangler ?? wranglerFixture();
  const result = capture.collectRemoteInventory({
    gh: gh.run.bind(gh),
    wrangler: wrangler.run.bind(wrangler),
    sourceRepo: "/fixture/source",
    privateConfigPath: "/fixture/private.toml",
    privateConfigText: `account_id = "${ACCOUNT_ID}"\ndatabase_id = "${DATABASE_ID}"\n`,
    ...(options.attestationBytes === undefined
      ? { attestation: options.attestation ?? attestation() }
      : { attestationBytes: options.attestationBytes }),
    expectations: options.expectations ?? expectedContract(),
    now: new Date(NOW)
  });
  return { result, gh, wrangler };
}

test("Wrangler 4.120.0 selects only the 100%-serving deployment and uses exact JSON surfaces", () => {
  const { result, wrangler } = collect();
  assert.equal(result.cloudflare_worker.active_version_sha256, digest(WORKER_ID));
  assert.equal(result.cloudflare_worker.worker_name_sha256, digest("grok-review-app"));
  assert.equal(wrangler.calls.some((args) => args[0] === "versions" && args[1] === "list"), false);
  assert.deepEqual(wrangler.calls[0].slice(0, 3), ["deployments", "status", "--json"]);
  assert.deepEqual(wrangler.calls[1].slice(0, 4), ["versions", "view", WORKER_ID, "--json"]);
  assert.ok(wrangler.calls.some((args) => args[0] === "secret" && args.includes("--format") && args.includes("json") && !args.includes("--json")));
  assert.equal(wrangler.calls.some((args) => args[0] === "d1" && args[1] === "migrations"), false);
  assert.equal(JSON.stringify(result).includes(WORKER_ID), false);
  assert.equal(JSON.stringify(result).includes(DATABASE_ID), false);
});

test("active deployment selection rejects split, ambiguous, and empty production state", async (t) => {
  const invalid = [
    deployment({ versions: [{ version_id: "a", percentage: 50 }, { version_id: "b", percentage: 50 }] }),
    deployment({ versions: [{ version_id: "a", percentage: 100 }, { version_id: "b", percentage: 100 }] }),
    deployment({ versions: [] })
  ];
  for (const value of invalid) {
    await t.test(JSON.stringify(value.versions), () => {
      assert.throws(() => capture.selectActiveProductionVersion(value), /active production version/i);
    });
  }
});

test("D1 projection hashes stable sorted rows only and ignores Wrangler response metadata", () => {
  const rows = [
    { type: "table", name: "z", tbl_name: "z", sql: "CREATE TABLE z(id INTEGER)" },
    { type: "index", name: "a", tbl_name: "z", sql: "CREATE INDEX a ON z(id)" }
  ];
  const first = capture.projectD1QueryRows(d1Response(rows, { duration: 1, served_by: "one", bookmark: "one" }),
    ["type", "name", "tbl_name", "sql"], ["type", "name"]);
  const second = capture.projectD1QueryRows(d1Response([...rows].reverse(), { duration: 999, served_by: "two", bookmark: "two" }),
    ["type", "name", "tbl_name", "sql"], ["type", "name"]);
  assert.deepEqual(first, second);
  assert.equal(digest(JSON.stringify(first)), digest(JSON.stringify(second)));
});

test("D1 applied ledger rejects missing, extra, duplicate, and reordered migration rows", async (t) => {
  const cases = [
    [],
    [{ id: 1, name: "0001_init.sql" }, { id: 2, name: "0002_extra.sql" }],
    [{ id: 1, name: "0001_init.sql" }, { id: 2, name: "0001_init.sql" }],
    [{ id: 2, name: "0001_init.sql" }]
  ];
  for (const rows of cases) {
    await t.test(JSON.stringify(rows), () => {
      assert.throws(() => capture.validateD1Ledger(rows, ["0001_init.sql"]), /D1 applied migration ledger/i);
    });
  }
});

test("every approved name, mapping, coordinate digest, URL digest, cron, and attestation is an exact drift gate", async (t) => {
  const cases = [
    ["repo variables", (value) => value.repo_variable_names.pop()],
    ["repo secrets", (value) => value.repo_protected_names.push("EXTRA")],
    ["environments", (value) => value.environment_names.push("unexpected")],
    ["worker secrets", (value) => value.worker_protected_names.pop()],
    ["binding types", (value) => { value.worker_binding_types.DB = "kv_namespace"; }],
    ["workflow map", (value) => { value.control_workflow_file = "other.yml"; }],
    ["cron", (value) => { value.cron_schedules = ["0 * * * *"]; }],
    ["account digest", (_value, ui) => { ui.wrangler_coordinates.account_id_sha256 = "0".repeat(64); }],
    ["database digest", (_value, ui) => { ui.wrangler_coordinates.database_id_sha256 = "0".repeat(64); }],
    ["origin digest", (_value, ui) => { ui.app_settings_ui.worker_origin_sha256 = "0".repeat(64); }],
    ["webhook digest", (_value, ui) => { ui.app_settings_ui.webhook_sha256 = "0".repeat(64); }],
    ["stale App UI", (_value, ui) => { ui.app_settings_ui.observed_at = "2026-08-06T00:00:00.000Z"; }],
    ["future Worker UI", (_value, ui) => { ui.worker_settings_ui.observed_at = "2026-08-09T00:00:00.000Z"; }],
    ["noncanonical callback time", (_value, ui) => { ui.callback_hmac_source.observed_at = "2026-08-08T11:30:00Z"; }],
    ["unlaunched qualification", (_value, ui) => { ui.last_live_qualification.provider_launched = false; }],
    ["non-App output", (_value, ui) => { ui.last_live_qualification.app_authored_output = false; }]
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const expectations = structuredClone(expectedContract());
      const ui = structuredClone(attestation());
      mutate(expectations, ui);
      assert.throws(() => collect({ expectations, attestation: ui }), /drift|attestation|timestamp|qualification/i);
    });
  }
});

test("every GitHub command is fixed to github.com/xliberty2008x/grok-plugin and the URL is never published", () => {
  const { result, gh } = collect();
  for (const args of gh.calls) {
    if (args[0] === "api") {
      assert.ok(args.includes("--hostname"));
      assert.ok(args.includes("github.com"));
      assert.match(args.join(" "), /repos\/xliberty2008x\/grok-plugin\/environments/);
    } else {
      assert.ok(args.includes("--repo"));
      assert.ok(args.includes("github.com/xliberty2008x/grok-plugin"));
    }
  }
  assert.equal(JSON.stringify(result).includes(WORKER_ORIGIN), false);
  assert.equal(JSON.stringify(result).includes(WEBHOOK), false);
  assert.equal(result.control_workflow.worker_origin_sha256, digest(WORKER_ORIGIN));
  assert.equal(result.control_workflow.webhook_sha256, digest(WEBHOOK));
});

test("callback HMAC source records fresh true and false exactly and rejects non-booleans", async (t) => {
  for (const exists of [true, false]) {
    await t.test(`exists=${exists}`, () => {
      const ui = attestation();
      ui.callback_hmac_source.exists = exists;
      assert.equal(collect({ attestation: ui }).result.callback_hmac_source.exists, exists);
    });
  }
  for (const [name, value] of [["missing", undefined], ["null", null], ["string", "false"], ["number", 0]]) {
    await t.test(name, () => {
      const ui = attestation();
      if (value === undefined) delete ui.callback_hmac_source.exists;
      else ui.callback_hmac_source.exists = value;
      assert.throws(() => collect({ attestation: ui }), /callback HMAC.*boolean|attestation/i);
    });
  }
});

test("operator attestation is a closed exact object at every level", async (t) => {
  const locations = [
    ["root", (ui) => ui, "schema_version"],
    ["app", (ui) => ui.app_settings_ui, "public"],
    ["permissions", (ui) => ui.app_settings_ui.permissions, "checks"],
    ["worker", (ui) => ui.worker_settings_ui, "observed_at"],
    ["wrangler", (ui) => ui.wrangler_coordinates, "observed_at"],
    ["callback", (ui) => ui.callback_hmac_source, "observed_at"],
    ["qualification", (ui) => ui.last_live_qualification, "observed_at"]
  ];
  for (const [name, select, required] of locations) {
    await t.test(`${name} rejects unknown`, () => {
      const ui = attestation();
      select(ui).unexpected = "must fail";
      assert.throws(() => collect({ attestation: ui }), /attestation.*(?:unknown|shape|keys)|closed contract/i);
    });
    await t.test(`${name} rejects missing`, () => {
      const ui = attestation();
      delete select(ui)[required];
      assert.throws(() => collect({ attestation: ui }), /attestation|timestamp|drift|closed contract/i);
    });
  }
});

test("capture publishes attributable root, Worker, Wrangler, and exact attestation-byte evidence", () => {
  const first = attestation();
  const second = structuredClone(first);
  second.observed_at = "2026-08-08T11:31:00.000Z";
  second.worker_settings_ui.observed_at = "2026-08-08T11:32:00.000Z";
  second.wrangler_coordinates.observed_at = "2026-08-08T11:33:00.000Z";
  const firstBytes = Buffer.from(`${JSON.stringify(first, null, 2)}\n`);
  const secondBytes = Buffer.from(`${JSON.stringify(second, null, 2)}\n`);
  const firstResult = collect({ attestationBytes: firstBytes }).result;
  const secondResult = collect({ attestationBytes: secondBytes }).result;

  assert.deepEqual(firstResult.operator_attestation, {
    observed_at: first.observed_at,
    exact_bytes_sha256: digest(firstBytes)
  });
  assert.deepEqual(firstResult.worker_settings_ui, {
    observed_at: first.worker_settings_ui.observed_at,
    worker_name_sha256: first.worker_settings_ui.worker_name_sha256,
    active_version_sha256: first.worker_settings_ui.active_version_sha256,
    account_sha256: first.worker_settings_ui.account_id_sha256,
    cron_schedules: first.worker_settings_ui.cron_schedules
  });
  assert.deepEqual(firstResult.wrangler_coordinates, {
    observed_at: first.wrangler_coordinates.observed_at,
    account_sha256: first.wrangler_coordinates.account_id_sha256,
    database_sha256: first.wrangler_coordinates.database_id_sha256
  });
  assert.equal(secondResult.operator_attestation.observed_at, second.observed_at);
  assert.equal(secondResult.worker_settings_ui.observed_at, second.worker_settings_ui.observed_at);
  assert.equal(secondResult.wrangler_coordinates.observed_at, second.wrangler_coordinates.observed_at);
  assert.notEqual(secondResult.operator_attestation.exact_bytes_sha256, firstResult.operator_attestation.exact_bytes_sha256);
  assert.equal(JSON.stringify(firstResult).includes("account_id"), false);
  assert.equal(JSON.stringify(firstResult).includes("database_id"), false);
});

function publicationFixture() {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-publication-"));
  const privateRoot = path.join(targetRoot, "evidence/private");
  const parent = path.join(privateRoot, "phase-0");
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateRoot, 0o700);
  fs.chmodSync(parent, 0o700);
  return { targetRoot, privateRoot, parent, out: path.join(parent, "live.json") };
}

function fullSourceSnapshot() {
  return {
    head: "a".repeat(40),
    porcelain_v2_sha256: "1".repeat(64),
    tracked_diff_sha256: "2".repeat(64),
    untracked_paths_sha256: "3".repeat(64)
  };
}

test("handoff binds current baseline and attestation bytes and fails after attestation replacement", () => {
  const fixture = publicationFixture();
  const baselinePath = path.join(fixture.parent, "live.json");
  const attestationPath = path.join(fixture.parent, "operator.json");
  const handoffPath = path.join(fixture.parent, "handoff.json");
  const ui = attestation();
  const attestationBytes = Buffer.from(`${JSON.stringify(ui, null, 2)}\n`);
  fs.writeFileSync(attestationPath, attestationBytes, { mode: 0o600 });
  try {
    capture.executeCapture({
      out: baselinePath,
      snapshotSource: fullSourceSnapshot,
      collect: () => collect({ attestationBytes }).result,
      publish: ({ out, bytes }) => capture.publishEvidence({ out, bytes, targetRoot: fixture.targetRoot })
    });
    const outcome = capture.publishHandoffReceipt({
      baselinePath,
      attestationPath,
      out: handoffPath,
      targetRoot: fixture.targetRoot
    });
    const handoffBytes = fs.readFileSync(handoffPath);
    assert.equal(outcome.published_sha256, digest(handoffBytes));
    assert.deepEqual(outcome.receipt, JSON.parse(handoffBytes));
    assert.deepEqual(Object.keys(outcome.receipt).sort(), [
      "attestation", "baseline", "callback_hmac_source", "frozen_runtime",
      "last_live_qualification", "schema_version", "source_worktree"
    ]);
    assert.equal(outcome.receipt.baseline.file_sha256, digest(fs.readFileSync(baselinePath)));
    assert.equal(outcome.receipt.attestation.file_sha256, digest(attestationBytes));
    assert.equal(outcome.receipt.callback_hmac_source.exists, true);
    assert.equal(outcome.receipt.source_worktree.unchanged, true);
    assertNoForbiddenFields(outcome.receipt);
    assert.throws(() => capture.publishHandoffReceipt({
      baselinePath, attestationPath, out: handoffPath, targetRoot: fixture.targetRoot
    }), /exists|publish/i);

    const replaced = structuredClone(ui);
    replaced.observed_at = "2026-08-08T11:31:00.000Z";
    fs.writeFileSync(attestationPath, `${JSON.stringify(replaced, null, 2)}\n`, { mode: 0o600 });
    assert.throws(() => capture.verifyHandoffReceipt({
      receiptBytes: handoffBytes,
      baselinePath,
      attestationPath
    }), /attestation.*(?:replaced|digest|bytes)/i);
  } finally {
    fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
  }
});

test("attributable projections and handoff receipt reject unknown and missing fields", async (t) => {
  const ui = attestation();
  const inventory = collect({ attestation: ui }).result;
  inventory.operator_attestation = { observed_at: ui.observed_at, exact_bytes_sha256: digest(JSON.stringify(ui)) };
  inventory.worker_settings_ui = {
    observed_at: ui.worker_settings_ui.observed_at,
    worker_name_sha256: ui.worker_settings_ui.worker_name_sha256,
    active_version_sha256: ui.worker_settings_ui.active_version_sha256,
    account_sha256: ui.worker_settings_ui.account_id_sha256,
    cron_schedules: ui.worker_settings_ui.cron_schedules
  };
  inventory.wrangler_coordinates = {
    observed_at: ui.wrangler_coordinates.observed_at,
    account_sha256: ui.wrangler_coordinates.account_id_sha256,
    database_sha256: ui.wrangler_coordinates.database_id_sha256
  };
  for (const [name, mutate] of [
    ["projection unknown", (value) => { value.worker_settings_ui.unexpected = true; }],
    ["projection missing", (value) => { delete value.wrangler_coordinates.observed_at; }]
  ]) {
    await t.test(name, () => {
      const value = structuredClone(inventory);
      mutate(value);
      assert.throws(() => capture.validateAttributableProjections(value), /projection.*closed|unknown|missing/i);
    });
  }
  const receipt = {
    schema_version: 1,
    baseline: { locator_sha256: "1".repeat(64), file_sha256: "2".repeat(64) },
    attestation: { locator_sha256: "3".repeat(64), file_sha256: "4".repeat(64) },
    frozen_runtime: { runtime_commit: STABLE.runtime_commit, runtime_tag: STABLE.runtime_tag },
    last_live_qualification: {
      locator_sha256: "5".repeat(64), evidence_sha256: "6".repeat(64),
      provider_launched: true, app_authored_output: true
    },
    callback_hmac_source: { exists: false, observed_at: FRESH },
    source_worktree: { before_sha256: "7".repeat(64), after_sha256: "7".repeat(64), unchanged: true }
  };
  for (const [name, mutate] of [
    ["handoff unknown", (value) => { value.baseline.unexpected = true; }],
    ["handoff missing", (value) => { delete value.callback_hmac_source.exists; }]
  ]) {
    await t.test(name, () => {
      const value = structuredClone(receipt);
      mutate(value);
      assert.throws(() => capture.validateHandoffReceipt(value), /handoff.*closed|unknown|missing/i);
    });
  }
});

test("evidence publication rejects overwrite and dangling symlink without a staging residue", async (t) => {
  for (const kind of ["overwrite", "dangling-symlink"]) {
    await t.test(kind, () => {
      const fixture = publicationFixture();
      try {
        if (kind === "overwrite") fs.writeFileSync(fixture.out, "old");
        else fs.symlinkSync(path.join(fixture.parent, "missing"), fixture.out);
        assert.throws(() => capture.publishEvidence({
          out: fixture.out,
          bytes: Buffer.from("new"),
          targetRoot: fixture.targetRoot
        }), /exists|symlink|publish/i);
        assert.deepEqual(fs.readdirSync(fixture.privateRoot).sort(), ["phase-0"]);
      } finally {
        fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
      }
    });
  }
});

test("evidence publication detects parent substitution and removes all staging and target bytes", () => {
  const fixture = publicationFixture();
  const moved = `${fixture.parent}.moved`;
  try {
    assert.throws(() => capture.publishEvidence({
      out: fixture.out,
      bytes: Buffer.from("new"),
      targetRoot: fixture.targetRoot,
      hooks: {
        beforePublish() {
          fs.renameSync(fixture.parent, moved);
          fs.mkdirSync(fixture.parent, { mode: 0o700 });
        }
      }
    }), /parent.*changed|identity/i);
    assert.equal(fs.existsSync(fixture.out), false);
    assert.equal(fs.existsSync(path.join(moved, "live.json")), false);
    assert.deepEqual(fs.readdirSync(fixture.privateRoot).sort(), ["phase-0", "phase-0.moved"]);
  } finally {
    fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
  }
});

test("partial staging write is cleaned and never publishes a target", () => {
  const fixture = publicationFixture();
  const fsApi = Object.create(fs);
  fsApi.writeSync = (fd, buffer, offset, length) => {
    fs.writeSync(fd, buffer, offset, Math.min(2, length));
    throw new Error("injected partial write");
  };
  try {
    assert.throws(() => capture.publishEvidence({
      out: fixture.out,
      bytes: Buffer.from("new evidence"),
      targetRoot: fixture.targetRoot,
      fsApi
    }), /partial write/i);
    assert.equal(fs.existsSync(fixture.out), false);
    assert.deepEqual(fs.readdirSync(fixture.privateRoot).sort(), ["phase-0"]);
  } finally {
    fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
  }
});

test("CLI failure after source mutation reports drift first and leaves no capture", () => {
  const fixture = publicationFixture();
  let calls = 0;
  try {
    assert.throws(() => capture.executeCapture({
      out: fixture.out,
      snapshotSource() {
        calls += 1;
        return { head: "a".repeat(40), status_sha256: calls === 1 ? "1".repeat(64) : "2".repeat(64) };
      },
      collect() {
        throw new Error("CLI failed");
      },
      publish() {
        throw new Error("must not publish");
      }
    }), /source worktree drifted.*CLI failed/i);
    assert.equal(calls, 2);
    assert.equal(fs.existsSync(fixture.out), false);
  } finally {
    fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
  }
});

test("executeCapture reports the SHA-256 of the exact pretty published bytes", () => {
  const fixture = publicationFixture();
  try {
    const snapshot = { head: "a".repeat(40), status_sha256: "1".repeat(64) };
    const outcome = capture.executeCapture({
      out: fixture.out,
      snapshotSource: () => snapshot,
      collect: () => ({ category: { present: true } }),
      publish: ({ out, bytes }) => capture.publishEvidence({ out, bytes, targetRoot: fixture.targetRoot })
    });
    const published = fs.readFileSync(fixture.out);
    assert.equal(outcome.published_sha256, digest(published));
    assert.equal(published.toString("utf8").endsWith("\n"), true);
    assert.match(published.toString("utf8"), /\n  "inventory":/);
    assert.deepEqual(outcome.capture, JSON.parse(published));
  } finally {
    fs.rmSync(fixture.targetRoot, { recursive: true, force: true });
  }
});

test("child environments are per-tool allowlists and exclude unrelated credentials", () => {
  const poisoned = {
    PATH: "/usr/bin:/bin",
    HOME: "/private/home",
    LANG: "C.UTF-8",
    GH_TOKEN: "github-auth",
    GH_HOST: "github.com",
    GH_CONFIG_DIR: "/private/gh",
    CLOUDFLARE_API_TOKEN: "cloudflare-auth",
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
    WRANGLER_CONFIG: "/private/wrangler",
    GROK_AUTH_JSON: "must-not-cross",
    GROK_REVIEW_APP_PRIVATE_KEY: "must-not-cross",
    RUNNER_CALLBACK_SECRET: "must-not-cross"
  };
  const gitEnv = capture.buildToolEnvironment("git", poisoned);
  const ghEnv = capture.buildToolEnvironment("gh", poisoned);
  const wranglerEnv = capture.buildToolEnvironment("wrangler", poisoned);
  assert.deepEqual(Object.keys(gitEnv).sort(), ["GIT_CONFIG_NOSYSTEM", "GIT_TERMINAL_PROMPT", "HOME", "LANG", "PATH"]);
  assert.deepEqual(Object.keys(ghEnv).sort(), ["GH_CONFIG_DIR", "GH_HOST", "GH_PAGER", "GH_TOKEN", "HOME", "LANG", "NO_COLOR", "PAGER", "PATH"]);
  assert.deepEqual(Object.keys(wranglerEnv).sort(), ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "HOME", "LANG", "NO_COLOR", "PATH", "WRANGLER_CONFIG"]);
  for (const env of [gitEnv, ghEnv, wranglerEnv]) {
    assert.equal("GROK_AUTH_JSON" in env, false);
    assert.equal("GROK_REVIEW_APP_PRIVATE_KEY" in env, false);
    assert.equal("RUNNER_CALLBACK_SECRET" in env, false);
  }
});

test("NOTICE retains source attribution while naming the standalone project", () => {
  const notice = fs.readFileSync(path.join(ROOT, "NOTICE"), "utf8");
  assert.match(notice, /^Grok Review Xliberty$/m);
  assert.match(notice, /Copyright 2026 grok-plugin community contributors/);
  assert.match(notice, /software derived from OpenAI's codex-plugin-cc/);
  assert.match(notice, /db52e28f4d9ded852ab3942cea316258ae4ef346/);
  assert.match(notice, /Apache License, Version 2\.0/);
  assert.match(notice, /independent.*not affiliated with, endorsed by, or sponsored by OpenAI\s+or xAI/s);
});

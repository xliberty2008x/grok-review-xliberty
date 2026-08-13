#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE_ROOT = path.join(ROOT, "evidence/private");
const MAX_OUTPUT = 16 * 1024 * 1024;
const EXPECTED_SOURCE_HEAD = "aee1171c2f346948feb2864784e13abe020dcb34";
const APP_SETTINGS = Object.freeze({
  public: false,
  request_oauth_on_install: false,
  hook_active: true,
  installation_scope: "selected_repositories",
  permissions: Object.freeze({ checks: "write", contents: "read", issues: "read", metadata: "read", pull_requests: "write" }),
  events: Object.freeze(["check_run", "installation", "installation_repositories", "issue_comment", "pull_request"])
});
const REPO_VARIABLES = Object.freeze([
  "GROK_CLI_VERSION", "GROK_MODEL", "GROK_REVIEW_APP_CLIENT_ID", "GROK_REVIEW_APP_ID",
  "GROK_REVIEW_RUNTIME_BUNDLE_SHA256", "GROK_REVIEW_RUNTIME_COMMIT", "GROK_REVIEW_WORKER_URL",
  "RECEIPT_SIGNING_PUBLIC_KEY"
]);
const REPO_SECRETS = Object.freeze([
  "GROK_AUTH_JSON", "GROK_REVIEW_APP_PRIVATE_KEY", "RECEIPT_SIGNING_PRIVATE_KEY", "RUNNER_CALLBACK_SECRET"
]);
const WORKER_SECRETS = Object.freeze(["CONTROL_REPO_TOKEN", "RECEIPT_PUBLIC_KEYS_JSON", "RUNNER_CALLBACK_SECRET", "WEBHOOK_SECRET"]);
const BINDING_TYPES = Object.freeze({
  CONTROL_REF: "plain_text", CONTROL_REPO_NAME: "plain_text", CONTROL_REPO_OWNER: "plain_text",
  CONTROL_REPO_TOKEN: "secret_text", CONTROL_WORKFLOW_FILE: "plain_text", DB: "d1",
  GITHUB_APP_ID: "plain_text", RECEIPT_PUBLIC_KEYS_JSON: "secret_text",
  RUNNER_CALLBACK_SECRET: "secret_text", WEBHOOK_SECRET: "secret_text"
});
const FROZEN = Object.freeze({
  schema_version: 1,
  runtime_commit: "ea3594fb1f7cc546ede6d3dca2282860e54b8721",
  runtime_tag: "grok-review-runtime-ea3594fb1f7cc546ede6d3dca2282860e54b8721",
  source_archive_sha256: "964a3a18f54f433577a854c6bb2e6bdb498e983d5c53d9371d7916d4e1031fc9",
  node_version: "22.17.1", grok_version: "0.2.112", model: "grok-4.6", effort: "high",
  frozen_app_test_count: 104, required_current_test_count: 105,
  post_baseline_security_deltas: ["immutable-control-ref"]
});
const SOURCE_CONFIGURATION = Object.freeze({
  app_manifest_sha256: "a4aeb4fcfc5d870e9b56af6b1ffdc0922367579a55f285dc4b2a41c4ecd58a59",
  worker_config_sha256: "b3d28f4e525d74fdf67efd4c5b5b08882b3da07756b14160b65b8aab096d66ce",
  workflow_sha256: "5684938291bdb6277da54207c6baf1845d8d52b12d9936d5265f1d2591323ee1",
  migration_set_sha256: "c56f5a075f09b1330cc8e8509e7dcdad21a46dffdf20fd9ee0fbe3dfe1a378d5",
  workflow_variable_names: Object.freeze([...REPO_VARIABLES, "GROK_EFFORT"].sort()),
  workflow_protected_names: REPO_SECRETS
});
export const FROZEN_EXPECTATIONS = Object.freeze({
  ...FROZEN,
  source_head: EXPECTED_SOURCE_HEAD,
  github_host: "github.com", github_repository: "xliberty2008x/grok-plugin",
  worker_name: "grok-review-app", control_repo_owner: "xliberty2008x", control_repo_name: "grok-plugin",
  control_workflow_file: "grok-review-app-worker.yml",
  repo_variable_names: REPO_VARIABLES, repo_protected_names: REPO_SECRETS, environment_names: [],
  worker_protected_names: WORKER_SECRETS, worker_binding_types: BINDING_TYPES,
  cron_schedules: ["*/1 * * * *"], migration_names: ["0001_init.sql"], source_configuration: SOURCE_CONFIGURATION
});

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function sorted(values) { return [...values].sort((a, b) => String(a).localeCompare(String(b))); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function exactNames(actual, expected, label) {
  const names = sorted(actual.map((item) => typeof item === "string" ? item : item?.name));
  if (!same(names, sorted(expected))) fail(`${label} drift`);
  if (new Set(names).size !== names.length) fail(`${label} duplicate drift`);
  return names.map((name) => ({ name, present: true }));
}

export function selectActiveProductionVersion(deployment) {
  const versions = deployment?.versions;
  const active = Array.isArray(versions) ? versions.filter((version) => version?.percentage === 100 && typeof version?.version_id === "string" && version.version_id) : [];
  if (!Array.isArray(versions) || versions.length !== 1 || active.length !== 1) fail("cannot establish one active production version at 100 percent");
  return active[0].version_id;
}

export function projectD1QueryRows(response, columns, sortBy) {
  if (!Array.isArray(response) || response.length < 1 || response.some((part) => part?.success !== true || !Array.isArray(part?.results))) fail("invalid D1 query response");
  const rows = response.flatMap((part) => part.results).map((row) => {
    if (!row || typeof row !== "object" || columns.some((column) => !(column in row))) fail("D1 query row is missing a projected column");
    return Object.fromEntries(columns.map((column) => [column, row[column]]));
  });
  return rows.sort((left, right) => {
    for (const key of sortBy) {
      const order = typeof left[key] === "number" && typeof right[key] === "number"
        ? left[key] - right[key] : String(left[key]).localeCompare(String(right[key]));
      if (order) return order;
    }
    return 0;
  });
}

export function validateD1Ledger(rows, localNames) {
  const names = rows.map((row) => row?.name);
  if (rows.length !== localNames.length || new Set(names).size !== names.length
    || rows.some((row, index) => row?.id !== index + 1 || row?.name !== localNames[index])) fail("D1 applied migration ledger drift");
  return rows.map(({ id, name }) => ({ id, name }));
}

function canonicalTime(value, label, now, fresh) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`${label} timestamp is not canonical RFC3339`);
  const time = new Date(value).getTime();
  if (time > now.getTime()) fail(`${label} attestation timestamp is in the future`);
  if (fresh && now.getTime() - time > 24 * 60 * 60 * 1000) fail(`${label} attestation is stale`);
}
function digestField(value, label) { if (!/^[a-f0-9]{64}$/.test(value ?? "")) fail(`${label} attestation digest is invalid`); }
function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !same(sorted(Object.keys(value)), sorted(expected))) fail(`${label} attestation violates the closed contract keys`);
}
function validateAttestation(value, expectations, now, workerOrigin, webhook, workerId, accountId, databaseId) {
  assertExactKeys(value, ["schema_version", "observed_at", "app_settings_ui", "worker_settings_ui", "wrangler_coordinates", "callback_hmac_source", "last_live_qualification"], "root operator");
  assertExactKeys(value.app_settings_ui, ["observed_at", "public", "request_oauth_on_install", "hook_active", "installation_scope", "permissions", "events", "worker_origin_sha256", "webhook_sha256"], "App UI");
  assertExactKeys(value.app_settings_ui.permissions, ["checks", "contents", "issues", "metadata", "pull_requests"], "App permissions");
  assertExactKeys(value.worker_settings_ui, ["observed_at", "worker_name_sha256", "active_version_sha256", "account_id_sha256", "cron_schedules"], "Worker UI");
  assertExactKeys(value.wrangler_coordinates, ["observed_at", "account_id_sha256", "database_id_sha256"], "Wrangler coordinates");
  assertExactKeys(value.callback_hmac_source, ["exists", "observed_at"], "callback HMAC");
  assertExactKeys(value.last_live_qualification, ["observed_at", "locator_sha256", "evidence_sha256", "provider_launched", "app_authored_output"], "last live qualification");
  if (value.schema_version !== 1) fail("operator attestation schema drift");
  canonicalTime(value.observed_at, "operator", now, true);
  for (const [key, actual] of Object.entries(APP_SETTINGS)) {
    if (!same(key === "events" ? sorted(value.app_settings_ui?.[key] ?? []) : canonical(value.app_settings_ui?.[key]), key === "events" ? sorted(actual) : canonical(actual))) fail(`App settings UI attestation drift: ${key}`);
  }
  canonicalTime(value.app_settings_ui?.observed_at, "App UI", now, true);
  canonicalTime(value.worker_settings_ui?.observed_at, "Worker UI", now, true);
  canonicalTime(value.wrangler_coordinates?.observed_at, "Wrangler coordinates", now, true);
  canonicalTime(value.callback_hmac_source?.observed_at, "callback HMAC", now, true);
  canonicalTime(value.last_live_qualification?.observed_at, "last live qualification", now, false);
  const checks = [
    [value.app_settings_ui?.worker_origin_sha256, sha256(workerOrigin), "worker origin"],
    [value.app_settings_ui?.webhook_sha256, sha256(webhook), "webhook"],
    [value.worker_settings_ui?.worker_name_sha256, sha256(expectations.worker_name), "worker name"],
    [value.worker_settings_ui?.active_version_sha256, sha256(workerId), "active version"],
    [value.worker_settings_ui?.account_id_sha256, sha256(accountId), "Worker account coordinate"],
    [value.wrangler_coordinates?.account_id_sha256, sha256(accountId), "Wrangler account coordinate"],
    [value.wrangler_coordinates?.database_id_sha256, sha256(databaseId), "Wrangler database coordinate"]
  ];
  for (const [actual, expected, label] of checks) { digestField(actual, label); if (actual !== expected) fail(`${label} attestation drift`); }
  if (!same(sorted(value.worker_settings_ui?.cron_schedules ?? []), sorted(expectations.cron_schedules))) fail("cron attestation drift");
  if (typeof value.callback_hmac_source.exists !== "boolean") fail("callback HMAC exists attestation must be boolean");
  for (const key of ["locator_sha256", "evidence_sha256"]) digestField(value.last_live_qualification?.[key], `live qualification ${key}`);
  if (value.last_live_qualification?.provider_launched !== true || value.last_live_qualification?.app_authored_output !== true) fail("last live qualification attestation drift");
}

function privateCoordinates(text) {
  const account = [...text.matchAll(/^\s*account_id\s*=\s*"([a-f0-9]{32})"\s*$/gm)].map((match) => match[1]);
  const database = [...text.matchAll(/^\s*database_id\s*=\s*"([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})"\s*$/gmi)].map((match) => match[1]);
  if (account.length !== 1 || database.length !== 1) fail("private Wrangler config coordinate drift");
  return { accountId: account[0], databaseId: database[0] };
}

export function collectRemoteInventory({ gh, wrangler, sourceRepo, privateConfigPath, privateConfigText, attestation: injectedAttestation, attestationBytes: injectedAttestationBytes, expectations = FROZEN_EXPECTATIONS, now = new Date() }) {
  if (!path.isAbsolute(sourceRepo) || !path.isAbsolute(privateConfigPath)) fail("source and private Wrangler config paths must be absolute");
  if (injectedAttestation !== undefined && injectedAttestationBytes !== undefined) fail("operator attestation must use exactly one input surface");
  let attestationBytes;
  let attestation;
  if (injectedAttestationBytes !== undefined) {
    attestationBytes = Buffer.isBuffer(injectedAttestationBytes)
      ? Buffer.from(injectedAttestationBytes) : Buffer.from(injectedAttestationBytes);
    if (attestationBytes.length < 2 || attestationBytes.length > 1024 * 1024) fail("operator attestation bytes are outside the fixed bound");
    try { attestation = JSON.parse(attestationBytes.toString("utf8")); }
    catch { fail("operator attestation bytes are not valid JSON"); }
  } else {
    attestation = injectedAttestation;
    attestationBytes = Buffer.from(JSON.stringify(injectedAttestation));
  }
  const repo = `${expectations.github_host}/${expectations.github_repository}`;
  const repoArgs = ["--repo", repo];
  const variables = gh(["variable", "list", "--json", "name,updatedAt", ...repoArgs]);
  const secrets = gh(["secret", "list", "--json", "name,updatedAt", ...repoArgs]);
  exactNames(variables, expectations.repo_variable_names, "GitHub repository variables");
  exactNames(secrets, expectations.repo_protected_names, "GitHub repository secrets");
  if (variables.some((item) => item.name === "GROK_EFFORT")) fail("GitHub GROK_EFFORT must be absent so the frozen high default applies");
  const variable = (name) => String(gh(["variable", "get", name, ...repoArgs])).trim();
  const runtimeCommit = variable("GROK_REVIEW_RUNTIME_COMMIT");
  const bundleDigest = variable("GROK_REVIEW_RUNTIME_BUNDLE_SHA256");
  const grokVersion = variable("GROK_CLI_VERSION");
  const model = variable("GROK_MODEL");
  const workerOrigin = variable("GROK_REVIEW_WORKER_URL");
  const appId = variable("GROK_REVIEW_APP_ID");
  if (runtimeCommit !== expectations.runtime_commit || bundleDigest !== expectations.source_archive_sha256
    || grokVersion !== expectations.grok_version || model !== expectations.model || !/^\d+$/.test(appId)) fail("control workflow frozen-variable drift");
  let parsedOrigin;
  try { parsedOrigin = new URL(workerOrigin); } catch { fail("worker URL drift"); }
  if (parsedOrigin.protocol !== "https:" || parsedOrigin.username || parsedOrigin.password || parsedOrigin.search || parsedOrigin.hash || parsedOrigin.pathname !== "/") fail("worker URL must be a bare HTTPS origin");
  const normalizedOrigin = parsedOrigin.origin;
  const webhook = `${normalizedOrigin}/github/webhooks`;
  const environments = gh(["api", `repos/${expectations.github_repository}/environments`, "--hostname", expectations.github_host]);
  const environmentNames = (environments?.environments ?? []).map((item) => item?.name);
  if (environments?.total_count !== environmentNames.length || !same(sorted(environmentNames), sorted(expectations.environment_names))) fail("GitHub environment drift");
  const runs = gh(["run", "list", "--workflow", expectations.control_workflow_file, "--status", "success", "--limit", "1", "--json", "headSha,conclusion,createdAt,updatedAt", ...repoArgs]);
  if (!Array.isArray(runs) || runs.length !== 1 || runs[0]?.conclusion !== "success" || runs[0]?.headSha !== expectations.runtime_commit) fail("last successful workflow drift");

  const coordinates = privateCoordinates(privateConfigText);
  const common = ["--name", expectations.worker_name, "--config", privateConfigPath];
  const deployment = wrangler(["deployments", "status", "--json", ...common]);
  const activeVersion = selectActiveProductionVersion(deployment);
  const version = wrangler(["versions", "view", activeVersion, "--json", ...common]);
  if (version?.id !== activeVersion) fail("active Worker version view drift");
  const workerSecrets = wrangler(["secret", "list", "--format", "json", ...common]);
  exactNames(workerSecrets, expectations.worker_protected_names, "Worker protected names");
  const bindings = version?.resources?.bindings;
  if (!Array.isArray(bindings) || bindings.length !== Object.keys(expectations.worker_binding_types).length) fail("Worker binding drift");
  const bindingByName = new Map();
  for (const binding of bindings) {
    if (bindingByName.has(binding?.name)) fail("Worker binding duplicate drift");
    bindingByName.set(binding.name, binding);
  }
  const bindingStatus = [];
  const allowedPlain = {
    CONTROL_REF: expectations.runtime_tag, CONTROL_REPO_OWNER: expectations.control_repo_owner,
    CONTROL_REPO_NAME: expectations.control_repo_name, CONTROL_WORKFLOW_FILE: expectations.control_workflow_file,
    GITHUB_APP_ID: appId
  };
  for (const [name, type] of Object.entries(expectations.worker_binding_types)) {
    const binding = bindingByName.get(name);
    if (!binding || binding.type !== type) fail(`Worker binding drift: ${name}`);
    const status = { name, type, present: true };
    if (type === "plain_text") {
      if (binding.text !== allowedPlain[name]) fail(`Worker plain binding drift: ${name}`);
      status.value_sha256 = sha256(binding.text);
    }
    if (name === "DB") {
      if (binding.id !== coordinates.databaseId) fail("Worker D1 coordinate drift");
      status.coordinate_sha256 = sha256(binding.id);
    }
    bindingStatus.push(status);
  }
  const ledgerRaw = wrangler(["d1", "execute", "DB", "--remote", "--command", "SELECT id, name FROM d1_migrations ORDER BY id", "--json", "--config", privateConfigPath]);
  const ledger = validateD1Ledger(projectD1QueryRows(ledgerRaw, ["id", "name"], ["id"]), expectations.migration_names);
  const schemaRaw = wrangler(["d1", "execute", "DB", "--remote", "--command", "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY type,name", "--json", "--config", privateConfigPath]);
  const schema = projectD1QueryRows(schemaRaw, ["type", "name", "tbl_name", "sql"], ["type", "name"]);
  validateAttestation(attestation, expectations, now, normalizedOrigin, webhook, activeVersion, coordinates.accountId, coordinates.databaseId);
  const inventory = {
    github_protected_names: { variables: exactNames(variables, expectations.repo_variable_names, "GitHub repository variables"), protected_names: exactNames(secrets, expectations.repo_protected_names, "GitHub repository secrets"), environments: [] },
    control_workflow: {
      runtime_commit_sha256: sha256(runtimeCommit), runtime_bundle_sha256: bundleDigest,
      grok_version_sha256: sha256(grokVersion), model_sha256: sha256(model), frozen_effort_sha256: sha256(expectations.effort),
      worker_origin_sha256: sha256(normalizedOrigin), webhook_sha256: sha256(webhook),
      latest_success_sha256: sha256(JSON.stringify(canonical(runs[0])))
    },
    cloudflare_worker: {
      worker_name_sha256: sha256(expectations.worker_name), active_version_sha256: sha256(activeVersion),
      deployment_sha256: sha256(JSON.stringify(canonical({ versions: deployment.versions.map(({ version_id, percentage }) => ({ version_sha256: sha256(version_id), percentage })) }))),
      binding_status: bindingStatus.sort((a, b) => a.name.localeCompare(b.name)),
      protected_names: exactNames(workerSecrets, expectations.worker_protected_names, "Worker protected names"),
      cron_schedules: [...expectations.cron_schedules]
    },
    d1: {
      applied_migrations: ledger.map(({ name }) => ({ name, present: true })),
      applied_migration_ledger_sha256: sha256(JSON.stringify(ledger)), schema_sha256: sha256(JSON.stringify(schema))
    },
    operator_attestation: {
      observed_at: attestation.observed_at,
      exact_bytes_sha256: sha256(attestationBytes)
    },
    worker_settings_ui: {
      observed_at: attestation.worker_settings_ui.observed_at,
      worker_name_sha256: attestation.worker_settings_ui.worker_name_sha256,
      active_version_sha256: attestation.worker_settings_ui.active_version_sha256,
      account_sha256: attestation.worker_settings_ui.account_id_sha256,
      cron_schedules: [...attestation.worker_settings_ui.cron_schedules]
    },
    wrangler_coordinates: {
      observed_at: attestation.wrangler_coordinates.observed_at,
      account_sha256: attestation.wrangler_coordinates.account_id_sha256,
      database_sha256: attestation.wrangler_coordinates.database_id_sha256
    },
    app_settings_ui: { observed_at: attestation.app_settings_ui.observed_at, ...APP_SETTINGS, worker_origin_sha256: sha256(normalizedOrigin), webhook_sha256: sha256(webhook) },
    callback_hmac_source: {
      exists: attestation.callback_hmac_source.exists,
      observed_at: attestation.callback_hmac_source.observed_at
    },
    last_live_qualification: {
      observed_at: attestation.last_live_qualification.observed_at,
      locator_sha256: attestation.last_live_qualification.locator_sha256,
      evidence_sha256: attestation.last_live_qualification.evidence_sha256,
      provider_launched: attestation.last_live_qualification.provider_launched,
      app_authored_output: attestation.last_live_qualification.app_authored_output
    }
  };
  validateAttributableProjections(inventory);
  return inventory;
}

function canonicalTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function validateAttributableProjections(inventory) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) fail("attributable projection root is missing");
  assertExactKeys(inventory.operator_attestation, ["observed_at", "exact_bytes_sha256"], "operator projection");
  assertExactKeys(inventory.worker_settings_ui, ["observed_at", "worker_name_sha256", "active_version_sha256", "account_sha256", "cron_schedules"], "Worker projection");
  assertExactKeys(inventory.wrangler_coordinates, ["observed_at", "account_sha256", "database_sha256"], "Wrangler projection");
  for (const [label, value] of [
    ["operator projection", inventory.operator_attestation.observed_at],
    ["Worker projection", inventory.worker_settings_ui.observed_at],
    ["Wrangler projection", inventory.wrangler_coordinates.observed_at]
  ]) if (!canonicalTimestamp(value)) fail(`${label} timestamp is invalid`);
  for (const [label, value] of [
    ["attestation bytes", inventory.operator_attestation.exact_bytes_sha256],
    ["Worker name", inventory.worker_settings_ui.worker_name_sha256],
    ["active version", inventory.worker_settings_ui.active_version_sha256],
    ["Worker account", inventory.worker_settings_ui.account_sha256],
    ["Wrangler account", inventory.wrangler_coordinates.account_sha256],
    ["Wrangler database", inventory.wrangler_coordinates.database_sha256]
  ]) digestField(value, `${label} projection`);
  if (!Array.isArray(inventory.worker_settings_ui.cron_schedules)
    || inventory.worker_settings_ui.cron_schedules.some((value) => typeof value !== "string")) fail("Worker projection cron schedules are invalid");
  return inventory;
}

export function buildToolEnvironment(tool, source = process.env) {
  const output = {};
  for (const name of ["PATH", "HOME", "LANG"]) if (source[name] !== undefined) output[name] = source[name];
  if (tool === "git") return { ...output, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
  if (tool === "gh") {
    for (const name of ["GH_TOKEN", "GH_HOST", "GH_CONFIG_DIR"]) if (source[name] !== undefined) output[name] = source[name];
    return { ...output, GH_PAGER: "cat", PAGER: "cat", NO_COLOR: "1" };
  }
  if (tool === "wrangler") {
    for (const name of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "WRANGLER_CONFIG"]) if (source[name] !== undefined) output[name] = source[name];
    return { ...output, NO_COLOR: "1" };
  }
  fail(`unknown child tool ${tool}`);
}

function resolveExecutable(name) {
  for (const directory of String(process.env.PATH ?? "").split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    const file = path.join(directory, name);
    try { if (fs.statSync(file).isFile()) { fs.accessSync(file, fs.constants.X_OK); return file; } } catch { /* continue */ }
  }
  fail(`${name} executable was not found on an absolute PATH entry`);
}
function command(binary, args, cwd, tool, json = false) {
  const result = spawnSync(binary, args, { cwd, shell: false, encoding: "utf8", timeout: 30_000, maxBuffer: MAX_OUTPUT, env: buildToolEnvironment(tool) });
  if (result.error || result.status !== 0) fail(`${tool} read-only command failed`);
  if (!json) return result.stdout;
  try { return JSON.parse(result.stdout); } catch { fail(`${tool} returned invalid JSON`); }
}
function commandBytes(binary, args, cwd, tool) {
  const result = spawnSync(binary, args, { cwd, shell: false, timeout: 30_000, maxBuffer: MAX_OUTPUT, env: buildToolEnvironment(tool) });
  if (result.error || result.status !== 0) fail(`${tool} read-only command failed`);
  return result.stdout;
}
function snapshotSource(source, gitBinary) {
  const run = (args) => commandBytes(gitBinary, args, source, "git");
  const head = run(["rev-parse", "HEAD"]).toString("utf8").trim();
  const status = run(["status", "--porcelain=v2", "--untracked-files=all", "-z"]);
  const unstaged = run(["diff", "--binary", "--no-ext-diff", "--"]);
  const staged = run(["diff", "--cached", "--binary", "--no-ext-diff", "--"]);
  const untracked = run(["ls-files", "--others", "--exclude-standard", "-z"]);
  return { head, porcelain_v2_sha256: sha256(status), tracked_diff_sha256: sha256(Buffer.concat([unstaged, staged])), untracked_paths_sha256: sha256(untracked) };
}

function sourceInventory(source) {
  const read = (relative) => fs.readFileSync(path.join(source, relative));
  const manifest = JSON.parse(read("apps/grok-review-app/github-app-manifest.template.json"));
  const worker = read("apps/grok-review-app/wrangler.toml");
  const workflow = read(".github/workflows/grok-review-app-worker.yml");
  const migrationDir = path.join(source, "apps/grok-review-app/migrations");
  const migrationNames = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
  const migrationBytes = Buffer.concat(migrationNames.flatMap((name) => [Buffer.from(`${name}\0`), fs.readFileSync(path.join(migrationDir, name))]));
  const workflowText = workflow.toString("utf8");
  const actual = {
    app_manifest_sha256: sha256(JSON.stringify(canonical(manifest))),
    worker_config_sha256: sha256(worker), workflow_sha256: sha256(workflow), migration_set_sha256: sha256(migrationBytes),
    workflow_variable_names: sorted(new Set([...workflowText.matchAll(/\bvars\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]))),
    workflow_protected_names: sorted(new Set([...workflowText.matchAll(/\bsecrets\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1])))
  };
  if (!same(canonical(actual), canonical(SOURCE_CONFIGURATION)) || !same(migrationNames, FROZEN_EXPECTATIONS.migration_names)
    || !workflowText.includes("vars.GROK_EFFORT || 'high'")) fail("checked-in source configuration drift");
  return { ...actual, migration_names: migrationNames.map((name) => ({ name, present: true })), cron_schedules: [...FROZEN_EXPECTATIONS.cron_schedules] };
}

export function executeCapture({ out, snapshotSource: takeSnapshot, collect, publish }) {
  const before = takeSnapshot();
  let inventory; let primary;
  try { inventory = collect(); } catch (error) { primary = error; }
  const after = takeSnapshot();
  if (!same(before, after)) fail(`source worktree drifted during baseline capture${primary ? `; prior error: ${primary.message}` : ""}`);
  if (primary) throw primary;
  const capture = {
    schema_version: 1,
    frozen_runtime: { runtime_commit: FROZEN.runtime_commit, runtime_tag: FROZEN.runtime_tag },
    inventory,
    source_worktree: { before, after, unchanged: true }
  };
  const bytes = Buffer.from(`${JSON.stringify(canonical(capture), null, 2)}\n`);
  const expectedDigest = sha256(bytes);
  const publication = publish({ out, bytes });
  if (publication?.sha256 !== expectedDigest) fail("published evidence digest does not match the exact serialized bytes");
  return { capture, published_sha256: publication.sha256 };
}

function secureDirectory(api, directory, label) {
  const stat = api.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700) fail(`${label} must be an owned mode-0700 real directory`);
  return stat;
}
function absent(api, file) {
  try { api.lstatSync(file); fail("output exists or is a symlink; refusing to publish"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

export function publishEvidence({ out, bytes, targetRoot = ROOT, fsApi = fs, hooks = {} }) {
  const privateRoot = path.join(path.resolve(targetRoot), "evidence/private");
  const parent = path.dirname(path.resolve(out));
  if (!path.resolve(out).startsWith(`${privateRoot}${path.sep}`)) fail("output must be under evidence/private");
  const rootStat = secureDirectory(fsApi, privateRoot, "private evidence root");
  const parentStat = secureDirectory(fsApi, parent, "output parent");
  if (!fsApi.realpathSync(parent).startsWith(`${fsApi.realpathSync(privateRoot)}${path.sep}`)) fail("output parent escapes private evidence root");
  absent(fsApi, out);
  const stage = path.join(privateRoot, `.${path.basename(out)}.${process.pid}.${randomUUID()}.stage`);
  let fd; let linked = false;
  try {
    fd = fsApi.openSync(stage, fsApi.constants.O_WRONLY | fsApi.constants.O_CREAT | fsApi.constants.O_EXCL | fsApi.constants.O_NOFOLLOW, 0o600);
    const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    let offset = 0;
    while (offset < data.length) {
      let written;
      try { written = fsApi.writeSync(fd, data, offset, data.length - offset); }
      catch (error) { fail(`partial write during evidence staging: ${error.message}`); }
      if (!Number.isInteger(written) || written <= 0) fail("partial write during evidence staging");
      offset += written;
    }
    fsApi.fsyncSync(fd); fsApi.closeSync(fd); fd = undefined;
    hooks.beforePublish?.();
    const rootAfter = secureDirectory(fsApi, privateRoot, "private evidence root");
    const parentAfter = secureDirectory(fsApi, parent, "output parent");
    if (rootAfter.dev !== rootStat.dev || rootAfter.ino !== rootStat.ino || parentAfter.dev !== parentStat.dev || parentAfter.ino !== parentStat.ino) fail("output parent identity changed before publication");
    absent(fsApi, out);
    fsApi.linkSync(stage, out); linked = true;
    const parentFd = fsApi.openSync(parent, fsApi.constants.O_RDONLY);
    try { fsApi.fsyncSync(parentFd); } finally { fsApi.closeSync(parentFd); }
    fsApi.unlinkSync(stage);
    return { sha256: sha256(data) };
  } catch (error) {
    if (fd !== undefined) { try { fsApi.closeSync(fd); } catch { /* cleanup */ } }
    if (linked) { try { fsApi.unlinkSync(out); } catch { /* cleanup */ } }
    try { fsApi.unlinkSync(stage); } catch { /* cleanup */ }
    throw error;
  }
}

function readSecurePrivateFile(file, label, fsApi = fs) {
  if (!path.isAbsolute(file)) fail(`${label} must be an absolute path`);
  let fd;
  try {
    fd = fsApi.openSync(file, fsApi.constants.O_RDONLY | fsApi.constants.O_NOFOLLOW);
    const stat = fsApi.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || stat.size < 2 || stat.size > MAX_OUTPUT) {
      fail(`${label} must be an owned private regular file within the fixed bound`);
    }
    return fsApi.readFileSync(fd);
  } finally {
    if (fd !== undefined) fsApi.closeSync(fd);
  }
}

function parseJsonBytes(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${label} is not valid JSON`); }
}

function validateSourceSnapshot(value, label) {
  assertExactKeys(value, ["head", "porcelain_v2_sha256", "tracked_diff_sha256", "untracked_paths_sha256"], `${label} handoff`);
  if (!/^[a-f0-9]{40}$/.test(value.head ?? "")) fail(`${label} handoff HEAD is invalid`);
  for (const key of ["porcelain_v2_sha256", "tracked_diff_sha256", "untracked_paths_sha256"]) digestField(value[key], `${label} ${key}`);
}

function validateBaselineForHandoff(capture, attestationBytes) {
  assertExactKeys(capture, ["schema_version", "frozen_runtime", "inventory", "source_worktree"], "baseline root handoff");
  if (capture.schema_version !== 1) fail("baseline handoff schema drift");
  assertExactKeys(capture.frozen_runtime, ["runtime_commit", "runtime_tag"], "frozen runtime handoff");
  if (capture.frozen_runtime.runtime_commit !== FROZEN.runtime_commit || capture.frozen_runtime.runtime_tag !== FROZEN.runtime_tag) fail("frozen runtime handoff drift");
  validateAttributableProjections(capture.inventory);
  assertExactKeys(capture.inventory.callback_hmac_source, ["exists", "observed_at"], "callback handoff");
  if (typeof capture.inventory.callback_hmac_source.exists !== "boolean" || !canonicalTimestamp(capture.inventory.callback_hmac_source.observed_at)) fail("callback handoff evidence is invalid");
  assertExactKeys(capture.inventory.last_live_qualification, ["observed_at", "locator_sha256", "evidence_sha256", "provider_launched", "app_authored_output"], "last live handoff");
  if (!canonicalTimestamp(capture.inventory.last_live_qualification.observed_at)
    || capture.inventory.last_live_qualification.provider_launched !== true
    || capture.inventory.last_live_qualification.app_authored_output !== true) fail("last live handoff evidence is invalid");
  digestField(capture.inventory.last_live_qualification.locator_sha256, "last live locator");
  digestField(capture.inventory.last_live_qualification.evidence_sha256, "last live evidence");
  assertExactKeys(capture.source_worktree, ["before", "after", "unchanged"], "source worktree handoff");
  validateSourceSnapshot(capture.source_worktree.before, "source before");
  validateSourceSnapshot(capture.source_worktree.after, "source after");
  if (capture.source_worktree.unchanged !== true || !same(capture.source_worktree.before, capture.source_worktree.after)) fail("source worktree handoff is not unchanged");
  if (capture.inventory.operator_attestation.exact_bytes_sha256 !== sha256(attestationBytes)) fail("attestation bytes were replaced after baseline capture");
  return capture;
}

export function validateHandoffReceipt(receipt) {
  assertExactKeys(receipt, ["schema_version", "baseline", "attestation", "frozen_runtime", "last_live_qualification", "callback_hmac_source", "source_worktree"], "handoff root");
  assertExactKeys(receipt.baseline, ["locator_sha256", "file_sha256"], "handoff baseline");
  assertExactKeys(receipt.attestation, ["locator_sha256", "file_sha256"], "handoff attestation");
  assertExactKeys(receipt.frozen_runtime, ["runtime_commit", "runtime_tag"], "handoff frozen runtime");
  assertExactKeys(receipt.last_live_qualification, ["locator_sha256", "evidence_sha256", "provider_launched", "app_authored_output"], "handoff last live");
  assertExactKeys(receipt.callback_hmac_source, ["exists", "observed_at"], "handoff callback");
  assertExactKeys(receipt.source_worktree, ["before_sha256", "after_sha256", "unchanged"], "handoff source worktree");
  if (receipt.schema_version !== 1 || receipt.frozen_runtime.runtime_commit !== FROZEN.runtime_commit
    || receipt.frozen_runtime.runtime_tag !== FROZEN.runtime_tag) fail("handoff frozen contract drift");
  for (const [label, section, keys] of [
    ["baseline", receipt.baseline, ["locator_sha256", "file_sha256"]],
    ["attestation", receipt.attestation, ["locator_sha256", "file_sha256"]],
    ["last live", receipt.last_live_qualification, ["locator_sha256", "evidence_sha256"]],
    ["source worktree", receipt.source_worktree, ["before_sha256", "after_sha256"]]
  ]) for (const key of keys) digestField(section[key], `handoff ${label} ${key}`);
  if (receipt.last_live_qualification.provider_launched !== true || receipt.last_live_qualification.app_authored_output !== true
    || typeof receipt.callback_hmac_source.exists !== "boolean" || !canonicalTimestamp(receipt.callback_hmac_source.observed_at)
    || receipt.source_worktree.unchanged !== true || receipt.source_worktree.before_sha256 !== receipt.source_worktree.after_sha256) fail("handoff evidence contract drift");
  rejectUnsafeOutput(receipt);
  return receipt;
}

export function buildHandoffReceipt({ baselineBytes, baselinePath, attestationBytes, attestationPath }) {
  if (!path.isAbsolute(baselinePath) || !path.isAbsolute(attestationPath)) fail("handoff input locators must be absolute");
  const capture = validateBaselineForHandoff(parseJsonBytes(baselineBytes, "baseline evidence"), attestationBytes);
  const beforeSha256 = sha256(Buffer.from(JSON.stringify(canonical(capture.source_worktree.before))));
  const afterSha256 = sha256(Buffer.from(JSON.stringify(canonical(capture.source_worktree.after))));
  const receipt = {
    schema_version: 1,
    baseline: { locator_sha256: sha256(path.resolve(baselinePath)), file_sha256: sha256(baselineBytes) },
    attestation: { locator_sha256: sha256(path.resolve(attestationPath)), file_sha256: sha256(attestationBytes) },
    frozen_runtime: {
      runtime_commit: capture.frozen_runtime.runtime_commit,
      runtime_tag: capture.frozen_runtime.runtime_tag
    },
    last_live_qualification: {
      locator_sha256: capture.inventory.last_live_qualification.locator_sha256,
      evidence_sha256: capture.inventory.last_live_qualification.evidence_sha256,
      provider_launched: capture.inventory.last_live_qualification.provider_launched,
      app_authored_output: capture.inventory.last_live_qualification.app_authored_output
    },
    callback_hmac_source: {
      exists: capture.inventory.callback_hmac_source.exists,
      observed_at: capture.inventory.callback_hmac_source.observed_at
    },
    source_worktree: { before_sha256: beforeSha256, after_sha256: afterSha256, unchanged: true }
  };
  return validateHandoffReceipt(receipt);
}

export function verifyHandoffReceipt({ receiptBytes, baselinePath, attestationPath, fsApi = fs }) {
  const receipt = validateHandoffReceipt(parseJsonBytes(receiptBytes, "handoff receipt"));
  const baselineBytes = readSecurePrivateFile(baselinePath, "baseline evidence", fsApi);
  const attestationBytes = readSecurePrivateFile(attestationPath, "operator attestation", fsApi);
  const expected = buildHandoffReceipt({ baselineBytes, baselinePath, attestationBytes, attestationPath });
  if (!same(canonical(receipt), canonical(expected))) fail("handoff receipt digest or binding drift");
  return receipt;
}

export function publishHandoffReceipt({ baselinePath, attestationPath, out, targetRoot = ROOT, fsApi = fs }) {
  const privateRoot = path.join(path.resolve(targetRoot), "evidence/private");
  if (!path.resolve(baselinePath).startsWith(`${privateRoot}${path.sep}`)) fail("baseline evidence must be under the target private evidence root");
  const baselineBytes = readSecurePrivateFile(baselinePath, "baseline evidence", fsApi);
  const attestationBytes = readSecurePrivateFile(attestationPath, "operator attestation", fsApi);
  const receipt = buildHandoffReceipt({ baselineBytes, baselinePath, attestationBytes, attestationPath });
  const bytes = Buffer.from(`${JSON.stringify(canonical(receipt), null, 2)}\n`);
  const publication = publishEvidence({ out, bytes, targetRoot, fsApi });
  if (publication.sha256 !== sha256(bytes)) fail("handoff publication digest drift");
  return { receipt, published_sha256: publication.sha256 };
}

function rejectUnsafeOutput(value, location = "$") {
  const forbidden = /(?:^|_)(?:url|account_id|database_id|app_id|installation_id|token|key|secret_value)(?:$|_)/i;
  if (Array.isArray(value)) return value.forEach((item, index) => rejectUnsafeOutput(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") { if (typeof value === "string" && /https?:\/\//i.test(value)) fail(`unsafe URL value at ${location}`); return; }
  for (const [key, child] of Object.entries(value)) { if (forbidden.test(key)) fail(`unsafe protected field ${location}.${key}`); rejectUnsafeOutput(child, `${location}.${key}`); }
}
function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1];
    if (!["--source-repo", "--out"].includes(flag) || !value) fail("usage: capture-baseline.mjs --source-repo ABS --out ABS");
    if (flag === "--source-repo") args.source = value; else args.out = value;
  }
  if (!path.isAbsolute(args.source ?? "") || !path.isAbsolute(args.out ?? "")) fail("source repository and output must be absolute paths");
  return args;
}
function parseHandoffArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1];
    if (!["--baseline", "--attestation", "--out"].includes(flag) || !value) {
      fail("usage: capture-baseline.mjs handoff --baseline ABS --attestation ABS --out ABS");
    }
    if (flag === "--baseline") args.baselinePath = value;
    if (flag === "--attestation") args.attestationPath = value;
    if (flag === "--out") args.out = value;
  }
  if (!path.isAbsolute(args.baselinePath ?? "") || !path.isAbsolute(args.attestationPath ?? "") || !path.isAbsolute(args.out ?? "")) {
    fail("handoff baseline, attestation, and output paths must be absolute");
  }
  return args;
}
function requirePrivateFile(name) {
  const file = process.env[name];
  if (!path.isAbsolute(file ?? "") || !fs.statSync(file).isFile()) fail(`${name} must be an absolute private file`);
  return file;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = fs.realpathSync(args.source);
  const out = path.resolve(args.out);
  const attestationFile = requirePrivateFile("GROK_BASELINE_OPERATOR_ATTESTATION");
  const configFile = requirePrivateFile("GROK_BASELINE_WRANGLER_CONFIG");
  const attestationBytes = fs.readFileSync(attestationFile);
  const configText = fs.readFileSync(configFile, "utf8");
  const git = resolveExecutable("git"); const gh = resolveExecutable("gh"); const wrangler = resolveExecutable("wrangler");
  if (command(wrangler, ["--version"], ROOT, "wrangler", false).trim() !== "4.120.0") fail("Wrangler version must be exactly 4.120.0");
  if (command(git, ["check-ignore", "-q", "--", out], ROOT, "git", false) !== "") { /* check-ignore is silent */ }
  const outcome = executeCapture({
    out,
    snapshotSource: () => {
      const result = snapshotSource(source, git);
      if (result.head !== EXPECTED_SOURCE_HEAD) fail("source HEAD drift");
      return result;
    },
    collect: () => {
      const tagged = command(git, ["rev-parse", `${FROZEN.runtime_tag}^{commit}`], source, "git", false).trim();
      if (tagged !== FROZEN.runtime_commit) fail("frozen runtime tag drift");
      const archive = commandBytes(git, ["archive", "--format=tar", FROZEN.runtime_commit], source, "git");
      if (sha256(archive) !== FROZEN.source_archive_sha256) fail("frozen runtime archive digest drift");
      const local = sourceInventory(source);
      const remote = collectRemoteInventory({
        gh: (commandArgs) => command(gh, commandArgs, source, "gh", !commandArgs.includes("get")),
        wrangler: (commandArgs) => command(wrangler, commandArgs, source, "wrangler", true),
        sourceRepo: source, privateConfigPath: configFile, privateConfigText: configText,
        attestationBytes, expectations: FROZEN_EXPECTATIONS, now: new Date()
      });
      return { source_configuration: local, ...remote };
    },
    publish: ({ out: target, bytes }) => {
      rejectUnsafeOutput(JSON.parse(bytes));
      return publishEvidence({ out: target, bytes });
    }
  });
  process.stdout.write(`sanitized baseline capture written; sha256=${outcome.published_sha256}\n`);
}

function handoffMain(argv) {
  const args = parseHandoffArgs(argv);
  const git = resolveExecutable("git");
  if (command(git, ["check-ignore", "-q", "--", args.out], ROOT, "git", false) !== "") { /* check-ignore is silent */ }
  const outcome = publishHandoffReceipt(args);
  process.stdout.write(`sanitized baseline handoff written; sha256=${outcome.published_sha256}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "handoff") handoffMain(process.argv.slice(3));
    else main();
  } catch (error) {
    process.stderr.write(`baseline capture failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

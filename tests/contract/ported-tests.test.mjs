import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as verifier from "../../scripts/verify-ported-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = path.join(ROOT, "tests/fixtures/ported-app-tests.json");
const SOURCE_COMMIT = "aee1171c2f346948feb2864784e13abe020dcb34";
const HASH_ONE = "7381da16b1b7c54c198e11fcf1dc231834199c0f2886cc11f03cee3a7cb1657d";
const HASH_TWO = "00750542256670cd020ab09d429d7438840d1a48eeaf6af55bfffac863614542";

function manifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function expectedGroup(id) {
  const prefix = id[0];
  const ordinal = Number(id.slice(1));
  if (prefix === "W") {
    if (ordinal === 1) return "infrastructure";
    if ([2, 37].includes(ordinal)) return "contracts";
    if ([3, 4, 5, 6, 7, 38].includes(ordinal)) return "control-plane/webhook";
    if ([8, 9, 10, 11, 12, 13, 19].includes(ordinal)) return "control-plane/authority";
    if ([14, 15, 16, 17, 18, 20, 21, 22].includes(ordinal)) return "control-plane/admission";
    if (ordinal >= 23 && ordinal <= 29) return "control-plane/dispatch";
    return "control-plane/callback";
  }
  if (prefix === "G") {
    if (ordinal <= 2) return "github/http";
    if (ordinal <= 5) return "github/tokens";
    if (ordinal <= 8) return "github/authority";
    if (ordinal <= 11) return "github/checks";
    if (ordinal <= 15) return "github/reviews";
    return "github/receipt";
  }
  if (prefix === "C") {
    if (ordinal <= 3) return "collector/remote";
    if (ordinal <= 7) return "collector/http";
    if ([8, 9, 10, 14].includes(ordinal)) return "collector/refs";
    if ([11, 12, 13, 15, 16].includes(ordinal)) return "collector/bounds";
    if ([17, 21, 27, 28].includes(ordinal)) return "collector/lifecycle";
    if ([18, 19, 20, 23, 24, 29].includes(ordinal)) return "collector/instructions";
    return "collector/packet";
  }
  if ([1, 2].includes(ordinal)) return "runner/config";
  if ([19, 20].includes(ordinal)) return "runner/callback";
  if (ordinal === 3) return "runner/bootstrap";
  if ([4, 6, 7].includes(ordinal)) return "runner/credentials";
  if ([5, 8].includes(ordinal)) return "runner/happy-path";
  if (ordinal >= 9 && ordinal <= 13) return "runner/authority";
  if (ordinal >= 14 && ordinal <= 16) return "runner/receipt";
  if ([17, 18].includes(ordinal)) return "runner/failure";
  return "workflow";
}

function expectedMapping(id) {
  return {
    W: ["tests/grok-review-app-worker.test.mjs", "tests/unit/control-plane.test.mjs"],
    G: ["tests/grok-review-app-github.test.mjs", "tests/unit/github.test.mjs"],
    C: ["tests/grok-review-app-target-collector.test.mjs", "tests/unit/target-collector.test.mjs"],
    R: ["tests/grok-review-app-runner.test.mjs", "tests/unit/runner.test.mjs"]
  }[id[0]];
}

const APPROVED_DELTAS = new Set([
  "W01", "W03", "W04", "W05", "W06", "W07", "W28", "W37", "W38",
  "G16", "R01", "R02", "R21"
]);
const HASH_CONTRACT = "SHA-256 of the trimmed top-level test callback argument, excluding the test name and call terminator.";
const DELTA_REASONS = new Map([
  [["W01"], "Terraform-only-D1 plus Wrangler-JSONC/root-README standalone infrastructure contract replaces the source TOML/App-README artifact assertion."],
  [["W03", "W04", "W05", "W06", "W07", "W38"], "standalone `apps/control-plane` module/config locations replace source App-local request-boundary paths while preserving the reviewed behavior."],
  [["W28"], "dispatch v1 changes the legacy decimal-string/trigger-kind payload to the approved closed signed-envelope inputs."],
  [["W37"], "external ID remains, while dispatch URL/ref selection moves to fixed static wrapper configuration plus the signed envelope."],
  [["G16"], "receipt release identity changes from the whole-plugin archive/commit to standalone manifest and bundle identities while signing/tamper behavior remains."],
  [["R01"], "runner inputs change to the closed signed dispatch-v1 envelope with no environment-selected wrapper."],
  [["R02"], "runtime configuration identity changes from plugin commit/archive to standalone manifest, policy, platform, Node, Grok, and bundle gates."],
  [["R21"], "one source workflow becomes two static staging/production wrappers with fixed environments while preserving dispatch-only, least-privilege, pinned-Action, and no-artifact constraints."]
].flatMap(([ids, reason]) => ids.map((id) => [id, reason])));

test("committed manifest has exact mappings, hierarchical groups, and plan-approved pending deltas", () => {
  const value = manifest();
  assert.equal(value.source_commit, SOURCE_COMMIT);
  assert.equal(value.hash_contract, HASH_CONTRACT);
  assert.equal(value.tests.length, 105);
  assert.equal(new Set(value.tests.map((record) => record.id)).size, 105);
  for (const record of value.tests) {
    const [sourceFile, targetSuite] = expectedMapping(record.id);
    assert.equal(record.source_commit, value.source_commit, record.id);
    assert.equal(record.source_file, sourceFile, record.id);
    assert.equal(record.target_suite, targetSuite, record.id);
    assert.equal(record.responsibility_group, expectedGroup(record.id), record.id);
    if (APPROVED_DELTAS.has(record.id)) {
      assert.equal(record.assertion_mode, "approved_delta", record.id);
      assert.equal(record.approved_target_body_sha256, null, record.id);
      assert.equal(record.approved_contract_delta_reason, DELTA_REASONS.get(record.id), record.id);
    } else {
      assert.equal(record.assertion_mode, "mechanical", record.id);
      assert.equal("approved_contract_delta_reason" in record, false, record.id);
      assert.equal("approved_target_body_sha256" in record, false, record.id);
    }
  }
  assert.equal(value.tests.find((record) => record.id === "W29").assertion_mode, "mechanical");
  assert.deepEqual(value.post_baseline_security_deltas, ["immutable-control-ref"]);
});

test("manifest validator rejects source, mapping, group, and delta corruption", async (t) => {
  const cases = [
    ["source commit", (value) => { value.tests[0].source_commit = "f".repeat(40); }],
    ["source file", (value) => { value.tests[0].source_file = "tests/wrong.test.mjs"; }],
    ["target suite", (value) => { value.tests[0].target_suite = "tests/unit/wrong.test.mjs"; }],
    ["group", (value) => { value.tests[0].responsibility_group = "wrong"; }],
    ["pending delta field", (value) => { delete value.tests.find((record) => record.id === "W01").approved_target_body_sha256; }],
    ["bound delta digest", (value) => { value.tests.find((record) => record.id === "W01").approved_target_body_sha256 = "not-a-digest"; }],
    ["mechanical delta metadata", (value) => { value.tests.find((record) => record.id === "W29").approved_target_body_sha256 = null; }],
    ["immutable-ref classification", (value) => { value.tests.find((record) => record.id === "W29").assertion_mode = "approved_delta"; }],
    ["hash contract", (value) => { value.hash_contract = "generic SHA-256"; }],
    ["generic delta reason", (value) => { value.tests.find((record) => record.id === "W01").approved_contract_delta_reason = "Approved standalone adaptation required by the frozen design contract."; }],
    ["swapped delta reason", (value) => {
      const w01 = value.tests.find((record) => record.id === "W01");
      w01.approved_contract_delta_reason = DELTA_REASONS.get("R21");
    }]
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const value = manifest();
      mutate(value);
      assert.throws(() => verifier.validatePortManifest(value), /manifest|mapping|group|delta|mechanical|W29/i);
    });
  }
});

test("pending approved deltas reject a target until bound, then freeze the approved target body", () => {
  const record = structuredClone(manifest().tests.find((item) => item.id === "W01"));
  const observed = { name: record.name, body_sha256: HASH_ONE };
  assert.throws(() => verifier.verifyObservedRecord(record, observed), /pending approved target body/i);
  record.approved_target_body_sha256 = HASH_ONE;
  assert.doesNotThrow(() => verifier.verifyObservedRecord(record, observed));
  assert.throws(() => verifier.verifyObservedRecord(record, { ...observed, body_sha256: HASH_TWO }), /approved target body drift/i);
});

test("mechanical records require source body equality", () => {
  const record = structuredClone(manifest().tests.find((item) => item.id === "W29"));
  assert.doesNotThrow(() => verifier.verifyObservedRecord(record, { name: record.name, body_sha256: record.body_sha256 }));
  assert.throws(() => verifier.verifyObservedRecord(record, { name: record.name, body_sha256: HASH_ONE }), /changed body/i);
});

test("parent groups allow cumulative partial observation while leaf groups require every assigned identity", () => {
  const value = manifest();
  const parent = verifier.selectGroup(value, "control-plane");
  assert.equal(parent.strict, false);
  assert.deepEqual(parent.records.map((record) => record.id), value.tests.filter((record) => record.id.startsWith("W")).map((record) => record.id));
  const leaf = verifier.selectGroup(value, "control-plane/webhook");
  assert.equal(leaf.strict, true);
  assert.deepEqual(leaf.records.map((record) => record.id), ["W03", "W04", "W05", "W06", "W07", "W38"]);
  const workflow = verifier.selectGroup(value, "runner");
  assert.equal(workflow.records.some((record) => record.id === "R21"), true);
});

function syntheticRecord(id, ordinal, name, bodySha256) {
  return {
    id,
    source_commit: SOURCE_COMMIT,
    source_file: "tests/source.test.mjs",
    source_ordinal: ordinal,
    name,
    body_sha256: bodySha256,
    responsibility_group: "synthetic",
    target_suite: "tests/unit/target.test.mjs",
    assertion_mode: "mechanical"
  };
}

function suite(firstName = "first behavior", secondName = "second behavior", secondAssertion = "assert.equal(2, 2);") {
  return `import assert from "node:assert/strict";\nimport test from "node:test";\n\ntest(${JSON.stringify(firstName)}, () => {\n  assert.equal(1, 1);\n});\n\ntest(${JSON.stringify(secondName)}, () => {\n  ${secondAssertion}\n});\n`;
}

test("suite comparison fails closed for missing, renamed, duplicate, changed, and extra identities", async (t) => {
  const records = [
    syntheticRecord("W01", 1, "first behavior", HASH_ONE),
    syntheticRecord("W02", 2, "second behavior", HASH_TWO)
  ];
  const cases = [
    ["missing", suite().replace(/\n\ntest\("second behavior"[\s\S]*$/, "\n"), /missing.*W02/i],
    ["renamed", suite("renamed behavior"), /renamed.*W01/i],
    ["duplicate", `${suite()}\ntest("first behavior", () => {\n  assert.equal(1, 1);\n});\n`, /duplicate target identity/i],
    ["changed", suite("first behavior", "second behavior", "assert.equal(1, 2);"), /changed body.*W02/i],
    ["extra", `${suite()}\ntest("extra behavior", () => {});\n`, /extra target identity/i]
  ];
  for (const [name, source, pattern] of cases) {
    await t.test(name, () => {
      assert.throws(() => verifier.verifySuiteRecords(records, source, { strict: true }), pattern);
    });
  }
});

test("controller source-root recomputation checks supplied roots without a default donor dependency", () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ported-source-root-"));
  const sourceFile = path.join(sourceRoot, "tests/source.test.mjs");
  fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
  fs.writeFileSync(sourceFile, suite());
  const records = [
    syntheticRecord("W01", 1, "first behavior", HASH_ONE),
    syntheticRecord("W02", 2, "second behavior", HASH_TWO)
  ];
  try {
    const result = verifier.recomputeSourceIdentities(records, sourceRoot);
    assert.deepEqual(result.ids, ["W01", "W02"]);
    fs.writeFileSync(sourceFile, suite("renamed behavior"));
    assert.throws(() => verifier.recomputeSourceIdentities(records, sourceRoot), /source identity.*W01/i);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test("hash fixtures are independently fixed", () => {
  assert.equal(createHash("sha256").update("() => {\n  assert.equal(1, 1);\n}").digest("hex"), HASH_ONE);
  assert.equal(createHash("sha256").update("() => {\n  assert.equal(2, 2);\n}").digest("hex"), HASH_TWO);
});

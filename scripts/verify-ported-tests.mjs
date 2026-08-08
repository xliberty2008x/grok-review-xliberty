#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MANIFEST = path.join(
  ROOT,
  "tests/fixtures/ported-app-tests.json",
);
const SOURCE_COMMIT = "aee1171c2f346948feb2864784e13abe020dcb34";
const PREFIXES = { W: 38, G: 17, C: 29, R: 21 };
const SOURCE_FILES = {
  W: "tests/grok-review-app-worker.test.mjs",
  G: "tests/grok-review-app-github.test.mjs",
  C: "tests/grok-review-app-target-collector.test.mjs",
  R: "tests/grok-review-app-runner.test.mjs",
};
const TARGET_SUITES = {
  W: "tests/unit/control-plane.test.mjs",
  G: "tests/unit/github.test.mjs",
  C: "tests/unit/target-collector.test.mjs",
  R: "tests/unit/runner.test.mjs",
};
const APPROVED_DELTAS = new Set([
  "W01",
  "W03",
  "W04",
  "W05",
  "W06",
  "W07",
  "W28",
  "W37",
  "W38",
  "G16",
  "R01",
  "R02",
  "R21",
]);
const HASH_CONTRACT =
  "SHA-256 of the trimmed top-level test callback argument, excluding the test name and call terminator.";
const DELTA_REASONS = new Map(
  [
    [
      ["W01"],
      "Terraform-only-D1 plus Wrangler-JSONC/root-README standalone infrastructure contract replaces the source TOML/App-README artifact assertion.",
    ],
    [
      ["W03", "W04", "W05", "W06", "W07", "W38"],
      "standalone `apps/control-plane` module/config locations replace source App-local request-boundary paths while preserving the reviewed behavior.",
    ],
    [
      ["W28"],
      "dispatch v1 changes the legacy decimal-string/trigger-kind payload to the approved closed signed-envelope inputs.",
    ],
    [
      ["W37"],
      "external ID remains, while dispatch URL/ref selection moves to fixed static wrapper configuration plus the signed envelope.",
    ],
    [
      ["G16"],
      "receipt release identity changes from the whole-plugin archive/commit to standalone manifest and bundle identities while signing/tamper behavior remains.",
    ],
    [
      ["R01"],
      "runner inputs change to the closed signed dispatch-v1 envelope with no environment-selected wrapper.",
    ],
    [
      ["R02"],
      "runtime configuration identity changes from plugin commit/archive to standalone manifest, policy, platform, Node, Grok, and bundle gates.",
    ],
    [
      ["R21"],
      "one source workflow becomes two static staging/production wrappers with fixed environments while preserving dispatch-only, least-privilege, pinned-Action, and no-artifact constraints.",
    ],
  ].flatMap(([ids, reason]) => ids.map((id) => [id, reason])),
);
const PARENT_PREFIXES = {
  "control-plane": "W",
  github: "G",
  collector: "C",
  runner: "R",
};

function fail(message) {
  throw new Error(message);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function digest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function extractTopLevelTests(source, sourceFile = "suite") {
  const starts = [...source.matchAll(/^test\(("(?:[^"\\]|\\.)*"),\s*/gm)];
  return starts.map((match, index) => {
    const regionEnd = starts[index + 1]?.index ?? source.length;
    const region = source.slice(match.index, regionEnd);
    const callEnd = region.lastIndexOf(");");
    if (callEnd < match[0].length)
      fail(
        `malformed top-level test call in ${sourceFile} at ordinal ${index + 1}`,
      );
    let name;
    try {
      name = JSON.parse(match[1]);
    } catch {
      fail(`invalid test name string in ${sourceFile} at ordinal ${index + 1}`);
    }
    const body = region.slice(match[0].length, callEnd).trim();
    if (!body) fail(`empty test body in ${sourceFile} at ordinal ${index + 1}`);
    return { ordinal: index + 1, name, body_sha256: sha256(body) };
  });
}

function expectedGroup(id) {
  const prefix = id[0];
  const ordinal = Number(id.slice(1));
  if (prefix === "W") {
    if (ordinal === 1) return "infrastructure";
    if ([2, 37].includes(ordinal)) return "contracts";
    if ([5, 6, 38].includes(ordinal)) return "control-plane/webhook-boundary";
    if ([3, 4].includes(ordinal)) return "control-plane/webhook-lifecycle";
    if (ordinal === 7) return "control-plane/callback";
    if ([9, 10].includes(ordinal))
      return "control-plane/installation-authority";
    if ([8, 11, 12, 13, 19].includes(ordinal)) return "control-plane/authority";
    if ([14, 15, 16, 17, 18, 20, 21, 22].includes(ordinal))
      return "control-plane/admission";
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
    if ([18, 19, 20, 23, 24, 29].includes(ordinal))
      return "collector/instructions";
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

export function validatePortManifest(manifest) {
  if (manifest?.schema_version !== 1 || !Array.isArray(manifest.tests))
    fail("invalid ported-test manifest");
  if (
    manifest.source_commit !== SOURCE_COMMIT ||
    manifest.frozen_app_test_count !== 104 ||
    manifest.required_current_test_count !== 105 ||
    manifest.tests.length !== 105
  )
    fail("manifest baseline annotation or source commit drifted");
  if (manifest.hash_contract !== HASH_CONTRACT)
    fail("manifest hash contract drifted");
  if (
    JSON.stringify(manifest.post_baseline_security_deltas) !==
    JSON.stringify(["immutable-control-ref"])
  )
    fail("manifest security delta drifted");
  const ids = new Set();
  let offset = 0;
  for (const [prefix, count] of Object.entries(PREFIXES)) {
    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      const id = `${prefix}${String(ordinal).padStart(2, "0")}`;
      const record = manifest.tests[offset++];
      if (record?.id !== id || ids.has(id))
        fail(`manifest identity/order drift at ${id}`);
      ids.add(id);
      if (
        record.source_commit !== SOURCE_COMMIT ||
        record.source_file !== SOURCE_FILES[prefix] ||
        record.source_ordinal !== ordinal ||
        record.target_suite !== TARGET_SUITES[prefix]
      )
        fail(`manifest source or mapping drift at ${id}`);
      if (record.responsibility_group !== expectedGroup(id))
        fail(`manifest group drift at ${id}`);
      if (
        typeof record.name !== "string" ||
        !record.name ||
        !digest(record.body_sha256)
      )
        fail(`invalid manifest record ${id}`);
      if (APPROVED_DELTAS.has(id)) {
        if (
          record.assertion_mode !== "approved_delta" ||
          typeof record.approved_contract_delta_reason !== "string" ||
          record.approved_contract_delta_reason !== DELTA_REASONS.get(id) ||
          !("approved_target_body_sha256" in record) ||
          (record.approved_target_body_sha256 !== null &&
            !digest(record.approved_target_body_sha256))
        )
          fail(`invalid approved delta ${id}`);
      } else if (
        record.assertion_mode !== "mechanical" ||
        "approved_contract_delta_reason" in record ||
        "approved_target_body_sha256" in record
      )
        fail(`invalid mechanical manifest record ${id}`);
    }
  }
  if (
    manifest.tests.find((record) => record.id === "W29")?.assertion_mode !==
    "mechanical"
  )
    fail("W29 immutable-ref classification must remain mechanical");
  return manifest;
}

export function verifyObservedRecord(record, observed) {
  if (observed.name !== record.name)
    fail(`renamed target identity ${record.id}: ${observed.name}`);
  if (record.assertion_mode === "mechanical") {
    if (observed.body_sha256 !== record.body_sha256)
      fail(`changed body without approved delta ${record.id}`);
  } else if (record.approved_target_body_sha256 === null) {
    fail(`pending approved target body for ${record.id}`);
  } else if (observed.body_sha256 !== record.approved_target_body_sha256) {
    fail(`approved target body drift for ${record.id}`);
  }
}

export function selectGroup(manifest, group = null) {
  const valid = validatePortManifest(manifest);
  if (!group) return { records: valid.tests, strict: true, group: "all" };
  if (PARENT_PREFIXES[group])
    return {
      records: valid.tests.filter((record) =>
        record.id.startsWith(PARENT_PREFIXES[group]),
      ),
      strict: false,
      group,
    };
  const records = valid.tests.filter(
    (record) => record.responsibility_group === group,
  );
  if (!records.length) fail(`unknown responsibility group ${group}`);
  return { records, strict: true, group };
}

export function verifySuiteRecords(records, source, { strict = true } = {}) {
  const actual = extractTopLevelTests(source, "target suite");
  const names = new Set();
  for (const observed of actual) {
    if (names.has(observed.name))
      fail(`duplicate target identity ${observed.name}`);
    names.add(observed.name);
  }
  const expectedByName = new Map(
    records.map((record) => [record.name, record]),
  );
  const seen = new Set();
  for (let index = 0; index < actual.length; index += 1) {
    const observed = actual[index];
    const record = expectedByName.get(observed.name);
    if (!record) {
      const positional = records[index];
      if (positional && !seen.has(positional.id))
        fail(`renamed target identity ${positional.id}: ${observed.name}`);
      fail(`extra target identity ${observed.name}`);
    }
    verifyObservedRecord(record, observed);
    seen.add(record.id);
  }
  if (strict) {
    const missing = records.find((record) => !seen.has(record.id));
    if (missing) fail(`missing target identity ${missing.id}`);
  }
  return {
    ids: records
      .filter((record) => seen.has(record.id))
      .map((record) => record.id),
  };
}

function contained(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`))
    fail(`source file escapes source root: ${relative}`);
  return resolved;
}

export function recomputeSourceIdentities(records, sourceRoot) {
  if (!path.isAbsolute(sourceRoot)) fail("source root must be absolute");
  const byFile = new Map();
  for (const record of records) {
    const list = byFile.get(record.source_file) ?? [];
    list.push(record);
    byFile.set(record.source_file, list);
  }
  const ids = [];
  for (const [relative, expected] of byFile) {
    const actual = extractTopLevelTests(
      fs.readFileSync(contained(sourceRoot, relative), "utf8"),
      relative,
    );
    const ordinals = expected
      .map((record) => record.source_ordinal)
      .sort((a, b) => a - b);
    if (
      ordinals[0] === 1 &&
      ordinals.every((ordinal, index) => ordinal === index + 1) &&
      actual.length !== expected.length
    ) {
      fail(`source identity count drift in ${relative}`);
    }
    for (const record of expected) {
      const observed = actual[record.source_ordinal - 1];
      if (
        !observed ||
        observed.name !== record.name ||
        observed.body_sha256 !== record.body_sha256
      )
        fail(`source identity drift at ${record.id}`);
      ids.push(record.id);
    }
  }
  return { ids };
}

function readManifest(file) {
  try {
    return validatePortManifest(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (error) {
    fail(`cannot read manifest: ${error.message}`);
  }
}

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    suiteRoot: ROOT,
    group: null,
    sourceRoot: null,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !["--manifest", "--suite-root", "--group", "--source-root"].includes(
        flag,
      ) ||
      !value
    )
      fail(
        "usage: verify-ported-tests.mjs [--manifest ABS] [--suite-root ABS] [--group GROUP] [--source-root ABS]",
      );
    if (flag === "--manifest") args.manifest = value;
    if (flag === "--suite-root") args.suiteRoot = value;
    if (flag === "--group") args.group = value;
    if (flag === "--source-root") args.sourceRoot = value;
  }
  if (
    !path.isAbsolute(args.manifest) ||
    !path.isAbsolute(args.suiteRoot) ||
    (args.sourceRoot && !path.isAbsolute(args.sourceRoot))
  )
    fail("manifest, suite root, and source root paths must be absolute");
  return args;
}

export function verify({ manifestPath, suiteRoot, group = null }) {
  const manifest = readManifest(manifestPath);
  const selection = selectGroup(manifest, group);
  const suites = new Map();
  for (const record of selection.records) {
    const list = suites.get(record.target_suite) ?? [];
    list.push(record);
    suites.set(record.target_suite, list);
  }
  const ids = [];
  for (const [suite, records] of suites) {
    const source = fs.readFileSync(contained(suiteRoot, suite), "utf8");
    const actual = extractTopLevelTests(source, suite);
    const allSuiteRecords = manifest.tests.filter(
      (record) => record.target_suite === suite,
    );
    const allByName = new Map(
      allSuiteRecords.map((record) => [record.name, record]),
    );
    const selectedIds = new Set(records.map((record) => record.id));
    const seenNames = new Set();
    const observedIds = new Set();
    for (const observed of actual) {
      if (seenNames.has(observed.name))
        fail(`duplicate target identity ${observed.name} in ${suite}`);
      seenNames.add(observed.name);
      const record = allByName.get(observed.name);
      if (!record) fail(`extra target identity ${observed.name} in ${suite}`);
      if (selectedIds.has(record.id)) {
        verifyObservedRecord(record, observed);
        observedIds.add(record.id);
      }
    }
    if (selection.strict) {
      const missing = records.find((record) => !observedIds.has(record.id));
      if (missing) fail(`missing target identity ${missing.id}`);
    }
    ids.push(
      ...records
        .filter((record) => observedIds.has(record.id))
        .map((record) => record.id),
    );
  }
  return { count: ids.length, ids, group: selection.group };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = readManifest(args.manifest);
    const result = args.sourceRoot
      ? recomputeSourceIdentities(manifest.tests, args.sourceRoot)
      : verify({
          manifestPath: args.manifest,
          suiteRoot: args.suiteRoot,
          group: args.group,
        });
    process.stdout.write(
      `verified ${result.ids.length} identities ids=${result.ids.join(",")}\n`,
    );
  } catch (error) {
    process.stderr.write(`ported-test verification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

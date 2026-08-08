import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DISPATCH_ENVELOPE_KEYS,
  DispatchEnvelopeError,
  buildCallbackMacMessage,
  bytesToHex,
  canonicalJson,
  createDispatchEnvelope,
  dispatchEnvelopeToWorkflowInputs,
  evaluateDispatchAdmissionWindow,
  hmacSha256,
  isValidSharedSecret,
  receiptKeyId,
  signCallbackMessage,
  signDispatchEnvelope,
  validateSanitizedReceipt,
  verifyDispatchEnvelope,
  verifyCallbackSignature256,
  verifyGitHubSignature256,
  verifyReceiptEnvelope,
} from "../../packages/contracts/src/index.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CONTRACT_ROOT = path.join(ROOT, "packages", "contracts");
const CONTROL_RUNTIME_REF =
  "grok-review-runtime-ea3594fb1f7cc546ede6d3dca2282860e54b8721";
const STAGING_WORKFLOW = "review-worker-staging.yml";
const STAGING_SECRET = "0123456789abcdef0123456789abcdef";
const PRODUCTION_SECRET = "fedcba9876543210fedcba9876543210";
const ISSUED_AT_SECONDS = 1_786_175_721;
const DISPATCHED_AT_MS = ISSUED_AT_SECONDS * 1000 + 1_000;
const KNOWN_CANONICAL =
  '{"actor_id":"678","control_ref":"grok-review-runtime-ea3594fb1f7cc546ede6d3dca2282860e54b8721","installation_id":"456","issued_at":"1786175721","nonce":"0123456789abcdef0123456789abcdef","pull_number":"12","repository_id":"789","request_id":"123","trigger_id":"345","trigger_kind":"automatic","version":"grok-review-dispatch/v1","workflow_file":"review-worker-staging.yml","wrapper":"staging"}';
const KNOWN_SIGNATURE =
  "sha256=7d2a44801570ebd05f0a2cab2ca9af102825417aa71c74d35276d395019078bd";

function envelope(overrides = {}) {
  return {
    version: "grok-review-dispatch/v1",
    request_id: "123",
    installation_id: "456",
    repository_id: "789",
    pull_number: "12",
    trigger_kind: "automatic",
    trigger_id: "345",
    actor_id: "678",
    issued_at: String(ISSUED_AT_SECONDS),
    nonce: "0123456789abcdef0123456789abcdef",
    control_ref: CONTROL_RUNTIME_REF,
    workflow_file: STAGING_WORKFLOW,
    wrapper: "staging",
    ...overrides,
  };
}

function verifyInput(overrides = {}) {
  return {
    envelope: envelope(),
    signature: KNOWN_SIGNATURE,
    secret: STAGING_SECRET,
    expectedControlRef: CONTROL_RUNTIME_REF,
    expectedWorkflowFile: STAGING_WORKFLOW,
    expectedWrapper: "staging",
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    request_id: "123",
    status: "dispatched",
    workflow_run_id: "987",
    updated_at: new Date(DISPATCHED_AT_MS).toISOString(),
    ...overrides,
  };
}

function receiptFixture(overrides = {}) {
  return {
    schema_version: "grok-review-receipt/v1",
    receipt_id: "receipt_123",
    request: {
      request_id: "123",
      workflow_run_id: "987",
      check_id: "654",
      installation_id: "456",
      repository_id: "789",
      pull_number: "12",
    },
    trigger: { kind: "automatic", id: "345", actor_id: "678" },
    source: {
      base_sha: "a".repeat(40),
      head_sha: "b".repeat(40),
      merge_base_sha: "c".repeat(40),
      diff: { sha256: "d".repeat(64), bytes: 1, files: 1 },
    },
    instructions: [],
    prompt: { version: "v1", sha256: "e".repeat(64) },
    output_schema: { version: "v1", sha256: "f".repeat(64) },
    runtime: {
      plugin_commit: "1".repeat(40),
      bundle_sha256: "2".repeat(64),
      node_version: "22.17.1",
      grok_cli_version: "0.2.112",
      grok_cli_sha256: "3".repeat(64),
      grok_package_integrity_sha256: "4".repeat(64),
      grok_package_git_commit: "5".repeat(40),
    },
    model: {
      provider: "xai",
      name: "grok-4.5",
      version: "4.5",
      effort: "high",
    },
    execution: {
      provider_launched: true,
      structured_output_valid: true,
      duration_ms: 100,
      finding_count: 0,
    },
    posting: { event: "COMMENT" },
    created_at: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

test("workspace manifests expose only the planned package entry points", () => {
  const expected = new Map([
    ["apps/control-plane/package.json", "@xliberty/grok-review-control-plane"],
    ["apps/review-runner/package.json", "@xliberty/grok-review-runner"],
    ["packages/contracts/package.json", "@xliberty/grok-review-contracts"],
    ["packages/reviewer/package.json", "@xliberty/grok-reviewer"],
    ["packages/grok-executor/package.json", "@xliberty/grok-executor"],
  ]);
  const root = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  assert.deepEqual(root.workspaces, ["apps/*", "packages/*"]);
  assert.equal(root.scripts.test, "node --test");
  for (const [relative, name] of expected) {
    const value = JSON.parse(
      fs.readFileSync(path.join(ROOT, relative), "utf8"),
    );
    assert.equal(value.name, name);
    assert.equal(value.type, "module");
    assert.equal(value.engines.node, "22.17.1");
    assert.deepEqual(value.exports, { ".": "./src/index.mjs" });
  }
});

test("dispatch envelope is closed, ordered, detached, and deeply frozen", () => {
  const input = envelope();
  const created = createDispatchEnvelope(input);
  assert.deepEqual(Object.keys(created), DISPATCH_ENVELOPE_KEYS);
  assert.notEqual(created, input);
  assert.equal(Object.isFrozen(created), true);
  assert.throws(() => {
    created.request_id = "999";
  }, TypeError);
  input.request_id = "999";
  assert.equal(created.request_id, "123");
});

test("dispatch creation rejects missing and extra fields with stable errors", () => {
  const missing = envelope();
  delete missing.actor_id;
  assert.throws(
    () => createDispatchEnvelope(missing),
    (error) =>
      error instanceof DispatchEnvelopeError &&
      error.code === "invalid_dispatch_envelope_shape",
  );
  assert.throws(
    () => createDispatchEnvelope({ ...envelope(), environment: "production" }),
    (error) =>
      error instanceof DispatchEnvelopeError &&
      error.code === "invalid_dispatch_envelope_shape",
  );
  const symbolKey = envelope();
  symbolKey[Symbol("extra")] = "x";
  assert.throws(
    () => createDispatchEnvelope(symbolKey),
    (error) =>
      error instanceof DispatchEnvelopeError &&
      error.code === "invalid_dispatch_envelope_shape",
  );
});

test("dispatch creation and signing reject changing envelope accessors", async () => {
  for (const [field, valid, invalid, validReads] of [
    ["request_id", "123", "01", 1],
    ["control_ref", CONTROL_RUNTIME_REF, "main", 2],
  ]) {
    let reads = 0;
    const input = envelope();
    Object.defineProperty(input, field, {
      enumerable: true,
      get() {
        reads += 1;
        return reads <= validReads ? valid : invalid;
      },
    });
    assert.throws(
      () => createDispatchEnvelope(input),
      (error) =>
        error instanceof DispatchEnvelopeError &&
        error.code === "invalid_dispatch_envelope_shape",
      field,
    );
    await assert.rejects(
      signDispatchEnvelope(input, STAGING_SECRET),
      (error) =>
        error instanceof DispatchEnvelopeError &&
        error.code === "invalid_dispatch_envelope_shape",
      field,
    );
    assert.equal(reads, 0, field);
  }
});

test("throwing envelope getters fail through stable typed and result errors", async () => {
  let reads = 0;
  const input = envelope();
  Object.defineProperty(input, "request_id", {
    enumerable: true,
    get() {
      reads += 1;
      throw new Error("getter escaped");
    },
  });
  assert.throws(
    () => createDispatchEnvelope(input),
    (error) =>
      error instanceof DispatchEnvelopeError &&
      error.code === "invalid_dispatch_envelope_shape",
  );
  assert.deepEqual(
    await verifyDispatchEnvelope(verifyInput({ envelope: input })),
    { ok: false, reason: "invalid_dispatch_envelope_shape" },
  );
  assert.equal(reads, 0);
});

test("dispatch creation rejects noncanonical IDs and trigger kinds", () => {
  for (const [field, value] of [
    ["request_id", "01"],
    ["installation_id", 456],
    ["repository_id", "900719925474099312345678901234567"],
    ["pull_number", "0"],
    ["trigger_id", "+345"],
    ["actor_id", " 678"],
  ]) {
    assert.throws(
      () => createDispatchEnvelope(envelope({ [field]: value })),
      (error) =>
        error instanceof DispatchEnvelopeError &&
        error.code === "invalid_dispatch_identifier",
      field,
    );
  }
  assert.throws(
    () => createDispatchEnvelope(envelope({ trigger_kind: "push" })),
    (error) => error.code === "invalid_dispatch_trigger_kind",
  );
});

test("dispatch creation rejects malformed timestamp, nonce, ref, workflow, and wrapper", () => {
  const cases = [
    ["issued_at", "01786175721", "invalid_dispatch_issued_at"],
    ["nonce", "A".repeat(32), "invalid_dispatch_nonce"],
    ["control_ref", "main", "invalid_dispatch_control_ref"],
    ["workflow_file", "other.yml", "invalid_dispatch_workflow_file"],
    ["wrapper", "preview", "invalid_dispatch_wrapper"],
  ];
  for (const [field, value, code] of cases) {
    assert.throws(
      () => createDispatchEnvelope(envelope({ [field]: value })),
      (error) => error.code === code,
    );
  }
});

test("independent HMAC known answer binds sorted JSON, UTF-8, NUL domain, and lowercase encoding", async () => {
  const created = createDispatchEnvelope(envelope());
  assert.equal(canonicalJson(created), KNOWN_CANONICAL);
  assert.equal(
    await signDispatchEnvelope(created, STAGING_SECRET),
    KNOWN_SIGNATURE,
  );
  assert.equal((await verifyDispatchEnvelope(verifyInput())).ok, true);
  assert.equal(isValidSharedSecret("é".repeat(16)), true);
  for (const secret of [
    "x".repeat(31),
    "x".repeat(4097),
    `${"x".repeat(32)}\n`,
  ]) {
    await assert.rejects(
      signDispatchEnvelope(created, secret),
      (error) =>
        error instanceof DispatchEnvelopeError &&
        error.code === "invalid_dispatch_secret",
    );
  }
});

test("portable callback HMAC helpers preserve exact byte framing and signature behavior", async () => {
  const body = new TextEncoder().encode('{"request_id":"123"}');
  assert.deepEqual(
    buildCallbackMacMessage("1786175721", "nonce-123", body),
    new TextEncoder().encode('1786175721\nnonce-123\n{"request_id":"123"}'),
  );
  const callbackSignature = await signCallbackMessage(
    body,
    "1786175721",
    "nonce-123",
    STAGING_SECRET,
  );
  assert.match(callbackSignature, /^sha256=[0-9a-f]{64}$/);
  assert.equal(
    await verifyCallbackSignature256(
      body,
      "1786175721",
      "nonce-123",
      callbackSignature,
      STAGING_SECRET,
    ),
    true,
  );
  assert.equal(
    await verifyCallbackSignature256(
      body,
      "1786175721",
      "nonce-123",
      `${callbackSignature.slice(0, 7)}${callbackSignature[7] === "0" ? "1" : "0"}${callbackSignature.slice(8)}`,
      STAGING_SECRET,
    ),
    false,
  );
  const bodySignature = `sha256=${bytesToHex(await hmacSha256(body, STAGING_SECRET))}`;
  assert.equal(
    await verifyGitHubSignature256(body, bodySignature, STAGING_SECRET),
    true,
  );
});

test("structural verification fails closed on mutations and caller-fixed environment bindings", async () => {
  const cases = [
    [
      "signature mutation",
      { signature: `${KNOWN_SIGNATURE.slice(0, -1)}0` },
      "dispatch_signature_invalid",
    ],
    [
      "cross-environment key",
      { secret: PRODUCTION_SECRET },
      "dispatch_signature_invalid",
    ],
    [
      "mutable ref",
      { expectedControlRef: "main" },
      "invalid_expected_control_ref",
    ],
    [
      "wrong static workflow",
      {
        expectedWorkflowFile: "review-worker-production.yml",
        expectedWrapper: "production",
      },
      ["dispatch_workflow_mismatch", "dispatch_wrapper_mismatch"],
    ],
    [
      "wrong wrapper",
      {
        expectedWorkflowFile: "review-worker-production.yml",
        expectedWrapper: "production",
      },
      ["dispatch_workflow_mismatch", "dispatch_wrapper_mismatch"],
    ],
  ];
  for (const [name, overrides, reasons] of cases) {
    const result = await verifyDispatchEnvelope(verifyInput(overrides));
    assert.equal(result.ok, false, name);
    assert.equal(
      (Array.isArray(reasons) ? reasons : [reasons]).includes(result.reason),
      true,
      name,
    );
  }
  const future = envelope({ issued_at: "9999999999" });
  const futureSignature = await signDispatchEnvelope(future, STAGING_SECRET);
  assert.equal(
    (
      await verifyDispatchEnvelope(
        verifyInput({ envelope: future, signature: futureSignature }),
      )
    ).ok,
    true,
  );
});

test("production is a valid fixed wrapper while cross-paired static bindings fail closed", async () => {
  const production = envelope({
    workflow_file: "review-worker-production.yml",
    wrapper: "production",
  });
  const signature = await signDispatchEnvelope(production, PRODUCTION_SECRET);
  assert.equal(
    (
      await verifyDispatchEnvelope({
        envelope: production,
        signature,
        secret: PRODUCTION_SECRET,
        expectedControlRef: CONTROL_RUNTIME_REF,
        expectedWorkflowFile: "review-worker-production.yml",
        expectedWrapper: "production",
      })
    ).ok,
    true,
  );

  const crossPaired = envelope({ wrapper: "production" });
  assert.throws(
    () =>
      dispatchEnvelopeToWorkflowInputs({
        envelope: crossPaired,
        signature: KNOWN_SIGNATURE,
        expectedControlRef: CONTROL_RUNTIME_REF,
        expectedWorkflowFile: STAGING_WORKFLOW,
        expectedWrapper: "production",
      }),
    (error) =>
      error instanceof DispatchEnvelopeError &&
      [
        "dispatch_workflow_wrapper_mismatch",
        "expected_workflow_wrapper_mismatch",
      ].includes(error.code),
  );
});

test("wire inputs are exactly thirteen envelope strings plus signature", () => {
  const inputs = dispatchEnvelopeToWorkflowInputs({
    envelope: envelope(),
    signature: KNOWN_SIGNATURE,
    expectedControlRef: CONTROL_RUNTIME_REF,
    expectedWorkflowFile: STAGING_WORKFLOW,
    expectedWrapper: "staging",
  });
  assert.deepEqual(Object.keys(inputs), [
    ...DISPATCH_ENVELOPE_KEYS,
    "dispatch_signature",
  ]);
  assert.equal(
    Object.values(inputs).every((value) => typeof value === "string"),
    true,
  );
  for (const forbidden of [
    "environment",
    "repository",
    "repository_url",
    "diff",
    "prompt",
    "instructions",
    "token",
    "model_output",
    "content",
  ])
    assert.equal(forbidden in inputs, false, forbidden);
});

test("admission window accepts immediate and ten-minute delayed active starts", () => {
  for (const nowMs of [DISPATCHED_AT_MS + 1, DISPATCHED_AT_MS + 10 * 60_000]) {
    assert.deepEqual(
      evaluateDispatchAdmissionWindow({
        envelope: envelope(),
        request: request(),
        workflowRunId: "987",
        nonceConsumed: false,
        nowMs,
      }),
      { ok: true },
    );
  }
  for (const status of ["dispatched", "claimed", "started"]) {
    assert.equal(
      evaluateDispatchAdmissionWindow({
        envelope: envelope(),
        request: request({ status }),
        workflowRunId: "987",
        nonceConsumed: false,
        nowMs: DISPATCHED_AT_MS + 1,
      }).ok,
      true,
    );
  }
});

test("admission window rejects replay, terminal, mismatch, future dispatch, and exact watchdog expiry", () => {
  const cases = [
    ["dispatch_nonce_consumed", { nonceConsumed: true }],
    [
      "dispatch_request_inactive",
      { request: request({ status: "completed" }) },
    ],
    ["dispatch_request_mismatch", { request: request({ request_id: "124" }) }],
    ["dispatch_run_mismatch", { workflowRunId: "986" }],
    [
      "dispatch_updated_before_issued",
      {
        request: request({
          updated_at: new Date(ISSUED_AT_SECONDS * 1000 - 1).toISOString(),
        }),
      },
    ],
    ["dispatch_updated_in_future", { nowMs: DISPATCHED_AT_MS - 1 }],
    [
      "dispatch_signing_window_expired",
      {
        request: request({
          updated_at: new Date(
            ISSUED_AT_SECONDS * 1000 + 900_000,
          ).toISOString(),
        }),
        nowMs: ISSUED_AT_SECONDS * 1000 + 900_001,
      },
    ],
    [
      "dispatch_admission_window_expired",
      { nowMs: DISPATCHED_AT_MS + 900_000 },
    ],
  ];
  for (const [reason, overrides] of cases) {
    assert.deepEqual(
      evaluateDispatchAdmissionWindow({
        envelope: envelope(),
        request: request(),
        workflowRunId: "987",
        nonceConsumed: false,
        nowMs: DISPATCHED_AT_MS + 1,
        ...overrides,
      }),
      { ok: false, reason },
    );
  }
});

test("admission rejects a request status accessor that changes from terminal to active", () => {
  let reads = 0;
  const persisted = request();
  Object.defineProperty(persisted, "status", {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? "completed" : "dispatched";
    },
  });
  assert.deepEqual(
    evaluateDispatchAdmissionWindow({
      envelope: envelope(),
      request: persisted,
      workflowRunId: "987",
      nonceConsumed: false,
      nowMs: DISPATCHED_AT_MS + 1,
    }),
    { ok: false, reason: "invalid_dispatch_request" },
  );
  assert.equal(reads, 0);
});

test("receipt validation, canonicalization, key ID, and signature verification remain portable", async () => {
  const receipt = receiptFixture();
  assert.equal(validateSanitizedReceipt(receipt).ok, true);
  assert.equal(
    validateSanitizedReceipt({ ...receipt, body: "secret" }).reason,
    "invalid_receipt_shape",
  );
  const pair = generateKeyPairSync("ed25519");
  const privatePem = pair.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const publicPem = pair.publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  const kid = await receiptKeyId(publicPem);
  const privateDer = Buffer.from(
    privatePem.match(/\n([A-Za-z0-9+/=\n]+)\n-----END/)[1].replaceAll("\n", ""),
    "base64",
  );
  const privateKey = await globalThis.crypto.subtle.importKey(
    "pkcs8",
    privateDer,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const canonical = canonicalJson(receipt);
  const bytes = new TextEncoder().encode(canonical);
  const signature = Buffer.from(
    await globalThis.crypto.subtle.sign("Ed25519", privateKey, bytes),
  ).toString("base64url");
  const signed = {
    alg: "Ed25519",
    kid,
    receipt_sha256: createHash("sha256").update(bytes).digest("hex"),
    signature,
  };
  const verified = await verifyReceiptEnvelope(
    receipt,
    signed,
    JSON.stringify({ [kid]: publicPem }),
  );
  assert.equal(verified.ok, true);
  assert.equal(verified.canonical, canonical);
  const mutatedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  assert.equal(
    (
      await verifyReceiptEnvelope(
        receipt,
        { ...signed, signature: mutatedSignature },
        { [kid]: publicPem },
      )
    ).ok,
    false,
  );
});

test("portable contract source has no forbidden imports or nonstandard runtime globals", () => {
  const files = fs
    .readdirSync(path.join(CONTRACT_ROOT, "src"))
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => path.join(CONTRACT_ROOT, "src", name));
  assert.deepEqual(files.map((file) => path.basename(file)).sort(), [
    "constants.mjs",
    "crypto.mjs",
    "dispatch-envelope.mjs",
    "external-id.mjs",
    "ids.mjs",
    "index.mjs",
    "receipt.mjs",
  ]);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()["']node:/, file);
    assert.doesNotMatch(
      source,
      /\b(?:Buffer|process|require|Deno|Bun)\b|node:|(?:read|write)File|Cloudflare/,
      file,
    );
    for (const match of source.matchAll(
      /(?:from\s+|import\s*\()["']([^"']+)/g,
    )) {
      assert.equal(match[1].startsWith("."), true, `${file}: ${match[1]}`);
    }
  }
});

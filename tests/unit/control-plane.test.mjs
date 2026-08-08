import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryDb,
  getDelivery,
  handleRequest,
} from "../../apps/control-plane/src/index.mjs";
import {
  MAX_WEBHOOK_BYTES,
  WEBHOOK_PATH,
} from "../../packages/contracts/src/constants.mjs";
import {
  bytesToHex as toHex,
  hmacSha256,
  verifyGitHubSignature256,
} from "../../packages/contracts/src/crypto.mjs";

import {
  canonicalDecimalId,
  isCanonicalDecimalId,
  parseJsonPreservingIntegerIds,
} from "../../packages/contracts/src/ids.mjs";
import {
  encodeExternalId,
  parseExternalId,
} from "../../packages/contracts/src/external-id.mjs";
import {
  DISPATCH_ENVELOPE_KEYS,
  createDispatchEnvelope,
  dispatchEnvelopeToWorkflowInputs,
} from "../../packages/contracts/src/dispatch-envelope.mjs";

/** ID strictly above Number.MAX_SAFE_INTEGER (2^53). */
const HUGE_ID = "9007199254740993";
const HUGE_REPO = "9007199254740994";
const HUGE_INSTALL = "9007199254740995";
const CONTROL_RUNTIME_REF =
  "grok-review-runtime-ea3594fb1f7cc546ede6d3dca2282860e54b8721";
const WEBHOOK_SECRET = "test-webhook-secret-value-at-least-32-bytes";
const DISPATCH_INPUT = Object.freeze({
  version: "grok-review-dispatch/v1",
  request_id: "123",
  installation_id: "456",
  repository_id: "789",
  pull_number: "12",
  trigger_kind: "automatic",
  trigger_id: "345",
  actor_id: "678",
  issued_at: "1786175721",
  nonce: "0123456789abcdef0123456789abcdef",
  control_ref: CONTROL_RUNTIME_REF,
  workflow_file: "review-worker-staging.yml",
  wrapper: "staging",
});

function makeEnv(overrides = {}) {
  return {
    DB: createMemoryDb(),
    WEBHOOK_SECRET,
    CONTROL_REF: CONTROL_RUNTIME_REF,
    ...overrides,
  };
}

async function signBody(body, secret = WEBHOOK_SECRET) {
  const bytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  const mac = await hmacSha256(bytes, secret);
  return `sha256=${toHex(mac)}`;
}

async function webhookRequest(opts) {
  const body =
    typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  const headers = new Headers(opts.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("x-github-event") && opts.event) {
    headers.set("x-github-event", opts.event);
  }
  if (!headers.has("x-github-delivery") && opts.deliveryId) {
    headers.set("x-github-delivery", opts.deliveryId);
  }
  if (!headers.has("x-hub-signature-256")) {
    if (opts.signature === null) {
      // omit
    } else if (typeof opts.signature === "string") {
      headers.set("x-hub-signature-256", opts.signature);
    } else {
      headers.set("x-hub-signature-256", await signBody(body, opts.secret));
    }
  }
  return new Request(opts.url || `https://worker.example${WEBHOOK_PATH}`, {
    method: opts.method || "POST",
    headers,
    body,
  });
}

async function invoke(env, request, options = {}) {
  const pending = [];
  const ctx = options.ctx || {
    waitUntil(promise) {
      pending.push(Promise.resolve(promise));
    },
  };
  const response = await handleRequest(request, env, ctx, options);
  if (options.awaitWaitUntil !== false) {
    await Promise.all(pending);
  }
  return response;
}

function basePrPayload(overrides = {}) {
  return {
    action: "opened",
    number: "7",
    pull_request: {
      id: "7001",
      number: "7",
      draft: false,
      head: { sha: "a".repeat(40) },
      user: { id: "42", login: "dev", type: "User" },
    },
    repository: { id: "500" },
    installation: { id: "100" },
    sender: { id: "42", login: "dev", type: "User" },
    ...overrides,
  };
}

test("IDs above 2^53 survive JSON parse and remain unchanged", () => {
  const raw = `{"installation":{"id":${HUGE_INSTALL}},"repository":{"id":${HUGE_REPO}},"n":1.5}`;
  const parsed = parseJsonPreservingIntegerIds(raw);
  assert.equal(parsed.installation.id, HUGE_INSTALL);
  assert.equal(parsed.repository.id, HUGE_REPO);
  assert.equal(typeof parsed.installation.id, "string");
  assert.equal(parsed.n, 1.5);
  assert.equal(canonicalDecimalId(parsed.installation.id), HUGE_INSTALL);
  assert.equal(isCanonicalDecimalId(HUGE_ID), true);
  assert.equal(canonicalDecimalId(Number.MAX_SAFE_INTEGER + 1), null);
});

test("external_id and dispatch URL contracts", () => {
  const encoded = encodeExternalId({
    installationId: HUGE_INSTALL,
    repositoryId: "2",
    pullNumber: "3",
    requestId: "4",
  });
  assert.equal(encoded, `grv1:${HUGE_INSTALL}:2:3:4`);
  assert.deepEqual(parseExternalId(encoded), {
    installationId: HUGE_INSTALL,
    repositoryId: "2",
    pullNumber: "3",
    requestId: "4",
  });

  const envelope = createDispatchEnvelope(DISPATCH_INPUT);
  const inputs = dispatchEnvelopeToWorkflowInputs({
    envelope,
    signature: `sha256=${"a".repeat(64)}`,
    expectedControlRef: CONTROL_RUNTIME_REF,
    expectedWorkflowFile: "review-worker-staging.yml",
    expectedWrapper: "staging",
  });
  assert.deepEqual(Object.keys(inputs), [
    ...DISPATCH_ENVELOPE_KEYS,
    "dispatch_signature",
  ]);
  assert.equal(inputs.control_ref, CONTROL_RUNTIME_REF);
  assert.equal(inputs.workflow_file, "review-worker-staging.yml");
  assert.equal(inputs.wrapper, "staging");
});

test("webhook rejects non-JSON content-type, missing headers, invalid HMAC, oversized body", async () => {
  const env = makeEnv();

  const ct = await invoke(
    env,
    await webhookRequest({
      body: basePrPayload(),
      event: "pull_request",
      deliveryId: "d-ct",
      headers: { "content-type": "text/plain" },
    }),
  );
  assert.equal(ct.status, 415);

  const missing = await invoke(
    env,
    await webhookRequest({
      body: basePrPayload(),
      event: "pull_request",
      deliveryId: "d-nosig",
      signature: null,
    }),
  );
  assert.equal(missing.status, 400);

  const badSig = await invoke(
    env,
    await webhookRequest({
      body: basePrPayload(),
      event: "pull_request",
      deliveryId: "d-badsig",
      signature: `sha256=${"00".repeat(32)}`,
    }),
  );
  assert.equal(badSig.status, 401);
  assert.equal(await getDelivery(env.DB, "d-badsig"), null);

  const huge = "x".repeat(MAX_WEBHOOK_BYTES + 1);
  const over = await invoke(
    env,
    await webhookRequest({
      body: huge,
      event: "pull_request",
      deliveryId: "d-over",
      headers: {
        "content-type": "application/json",
        "content-length": String(huge.length),
      },
    }),
  );
  assert.equal(over.status, 413);
});

test("HMAC verifies raw body before JSON", async () => {
  const body = new TextEncoder().encode('{"ok":true}');
  const good = await signBody(body);
  assert.equal(
    await verifyGitHubSignature256(body, good, WEBHOOK_SECRET),
    true,
  );
  assert.equal(await verifyGitHubSignature256(body, good, "other"), false);
});

test("healthz and unknown routes", async () => {
  const env = makeEnv();
  const health = await invoke(
    env,
    new Request("https://worker.example/healthz"),
  );
  assert.equal(health.status, 200);
  assert.equal(
    (await invoke(env, new Request("https://worker.example/nope"))).status,
    404,
  );
});

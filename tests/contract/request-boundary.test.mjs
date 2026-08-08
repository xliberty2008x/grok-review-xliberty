import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateWebhookRequest,
  createMemoryDb,
  handleRequest,
  readBodyWithLimit,
  readWebhookIdentityHeaders,
} from "../../apps/control-plane/src/index.mjs";
import {
  MAX_WEBHOOK_BYTES,
  WEBHOOK_PATH,
} from "../../packages/contracts/src/constants.mjs";
import {
  bytesToHex,
  hmacSha256,
} from "../../packages/contracts/src/crypto.mjs";
import { parseJsonPreservingIntegerIds } from "../../packages/contracts/src/ids.mjs";

const WEBHOOK_SECRET = "test-webhook-secret-value-at-least-32-bytes";
const CONTROL_REF =
  "grok-review-runtime-ea3594fb1f7cc546ede6d3dca2282860e54b8721";

function makeEnv(overrides = {}) {
  return {
    DB: createMemoryDb(),
    WEBHOOK_SECRET,
    CONTROL_REF,
    ...overrides,
  };
}

async function signatureFor(raw, secret = WEBHOOK_SECRET) {
  const bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
  return `sha256=${bytesToHex(await hmacSha256(bytes, secret))}`;
}

async function signedWebhook({
  raw = '{"action":"opened"}',
  event = "pull_request",
  delivery = "delivery-1",
  secret = WEBHOOK_SECRET,
  signature,
  headers = {},
  method = "POST",
  url = `https://worker.example${WEBHOOK_PATH}`,
} = {}) {
  const requestHeaders = new Headers({
    "content-type": "application/json",
    "x-github-event": event,
    "x-github-delivery": delivery,
    "x-hub-signature-256": signature ?? (await signatureFor(raw, secret)),
    ...headers,
  });
  return new Request(url, { method, headers: requestHeaders, body: raw });
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.equal(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
}

function assertDbEmpty(db) {
  assert.equal(db.deliveries.size, 0);
  assert.equal(db.requestsById.size, 0);
  assert.equal(db.outboxById.size, 0);
  assert.equal(db.receipts.size, 0);
  assert.equal(db.nonces.size, 0);
}

test("request entrypoint keeps fixed health, webhook, legacy, callback, and unknown routes", async () => {
  const env = makeEnv();
  for (const path of ["/healthz", "/health", "/healthz/"]) {
    const response = await handleRequest(
      new Request(`https://worker.example${path}`),
      env,
    );
    assertJsonResponse(response, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "grok-review-app",
    });
  }

  const method = await handleRequest(
    new Request(`https://worker.example${WEBHOOK_PATH}`),
    env,
  );
  assertJsonResponse(method, 405);
  assert.deepEqual(await method.json(), {
    ok: false,
    error: "method_not_allowed",
  });

  for (const path of ["/webhook", "/internal/callback", "/unknown"]) {
    const response = await handleRequest(
      new Request(`https://worker.example${path}`),
      env,
    );
    assertJsonResponse(response, 404);
  }

  const supported = await handleRequest(
    await signedWebhook({ url: `https://worker.example${WEBHOOK_PATH}/` }),
    env,
  );
  assertJsonResponse(supported, 200);
  assert.deepEqual(await supported.json(), {
    ok: true,
    result: "malformed",
  });
});

test("webhook authenticates exact raw bytes before decoding or parsing", async () => {
  const malformed = '{"action":';
  const badSignature = await handleRequest(
    await signedWebhook({
      raw: malformed,
      signature: `sha256=${"00".repeat(32)}`,
    }),
    makeEnv(),
  );
  assertJsonResponse(badSignature, 401);
  assert.equal((await badSignature.json()).error, "invalid_signature");

  const validSignature = await handleRequest(
    await signedWebhook({ raw: malformed }),
    makeEnv(),
  );
  assertJsonResponse(validSignature, 400);
  assert.equal((await validSignature.json()).error, "invalid_json");

  const original = '{"action":"opened","value":1}';
  const mutated = '{"action":"opened","value":2}';
  const mutation = await handleRequest(
    await signedWebhook({
      raw: mutated,
      signature: await signatureFor(original),
    }),
    makeEnv(),
  );
  assertJsonResponse(mutation, 401);
});

test("strict JSON-number grammar preserves integers and rejects malformed tokens", async () => {
  assert.deepEqual(
    parseJsonPreservingIntegerIds(
      "[0,-0,1,-1,9007199254740993,-9007199254740993,1.5,-0.25,1e3,2E-2]",
    ),
    [
      "0",
      "-0",
      "1",
      "-1",
      "9007199254740993",
      "-9007199254740993",
      1.5,
      -0.25,
      1000,
      0.02,
    ],
  );
  assert.deepEqual(
    parseJsonPreservingIntegerIds('{"escaped":"\\\"-01","nested":{"id":42}}'),
    { escaped: '"-01', nested: { id: "42" } },
  );

  const invalid = ["01", "-01", "00", "1.", "1e", "1e+", "1e-", "-.1", "-"];
  for (const token of invalid) {
    assert.throws(
      () => parseJsonPreservingIntegerIds(`{"number":${token}}`),
      SyntaxError,
      token,
    );
  }

  for (const token of ["01", "1e+"]) {
    const raw = `{"action":"opened","number":${token}}`;
    const response = await handleRequest(
      await signedWebhook({ raw, delivery: `invalid-${token}` }),
      makeEnv(),
    );
    assertJsonResponse(response, 400);
    assert.equal((await response.json()).error, "invalid_json");
  }
});

test("valid HMAC cannot bypass fatal UTF-8 decoding", async () => {
  const raw = new Uint8Array([
    0x7b, 0x22, 0x61, 0x63, 0x74, 0x69, 0x6f, 0x6e, 0x22, 0x3a, 0x22, 0xff,
    0x22, 0x7d,
  ]);
  const response = await handleRequest(await signedWebhook({ raw }), makeEnv());
  assertJsonResponse(response, 400);
  assert.equal((await response.json()).error, "invalid_json");
});

test("webhook identity headers reject missing whitespace and non-whole signatures", async () => {
  const base = await signedWebhook();
  assert.equal(readWebhookIdentityHeaders(base).ok, true);

  const cases = [
    ["x-github-event", ""],
    ["x-github-event", "pull request"],
    ["x-github-delivery", ""],
    ["x-github-delivery", "delivery id"],
    ["x-github-delivery", "d".repeat(129)],
    ["x-hub-signature-256", ""],
    ["x-hub-signature-256", `sha256=${"0".repeat(63)}`],
    ["x-hub-signature-256", `sha1=${"0".repeat(64)}`],
  ];
  for (const [name, value] of cases) {
    const request = await signedWebhook({ headers: { [name]: value } });
    const response = await handleRequest(request, makeEnv());
    assertJsonResponse(response, 400);
    assert.equal((await response.json()).error, "missing_headers");
  }

  for (const signature of [
    ` sha256=${"0".repeat(64)}`,
    `sha256=${"0".repeat(64)} `,
  ]) {
    const headers = new Map([
      ["x-github-event", "pull_request"],
      ["x-github-delivery", "delivery-1"],
      ["x-hub-signature-256", signature],
    ]);
    assert.deepEqual(
      readWebhookIdentityHeaders({
        headers: { get: (name) => headers.get(name) ?? null },
      }),
      { ok: false, reason: "missing_headers" },
    );
  }
});

test("webhook configuration rejects weak secrets mutable refs objects and accessors generically", async () => {
  const invalidSecrets = [
    "x".repeat(31),
    `x\n${"y".repeat(40)}`,
    "x".repeat(4097),
    { toString: () => WEBHOOK_SECRET },
  ];
  const invalidRefs = [
    "main",
    "a".repeat(40),
    `grok-review-runtime-${"A".repeat(40)}`,
    `grok-review-runtime-${"a".repeat(39)}`,
    `grok-review-runtime-${"a".repeat(41)}`,
    { toString: () => CONTROL_REF },
  ];
  for (const WEBHOOK_SECRET of invalidSecrets) {
    const response = await handleRequest(
      await signedWebhook(),
      makeEnv({ WEBHOOK_SECRET }),
    );
    assertJsonResponse(response, 500);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "misconfigured",
    });
  }
  for (const CONTROL_REF of invalidRefs) {
    const response = await handleRequest(
      await signedWebhook(),
      makeEnv({ CONTROL_REF }),
    );
    assertJsonResponse(response, 500);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "misconfigured",
    });
  }

  const getterCalls = { WEBHOOK_SECRET: 0, CONTROL_REF: 0 };
  const accessorEnv = { DB: createMemoryDb() };
  Object.defineProperty(accessorEnv, "WEBHOOK_SECRET", {
    enumerable: true,
    get() {
      getterCalls.WEBHOOK_SECRET += 1;
      throw new Error("secret-value-diagnostic");
    },
  });
  Object.defineProperty(accessorEnv, "CONTROL_REF", {
    enumerable: true,
    get() {
      getterCalls.CONTROL_REF += 1;
      throw new Error("ref-value-diagnostic");
    },
  });
  const accessor = await handleRequest(await signedWebhook(), accessorEnv);
  assertJsonResponse(accessor, 500);
  assert.deepEqual(await accessor.json(), {
    ok: false,
    error: "misconfigured",
  });
  assert.deepEqual(getterCalls, { WEBHOOK_SECRET: 0, CONTROL_REF: 0 });

  const descriptorReads = { WEBHOOK_SECRET: 0, CONTROL_REF: 0 };
  let valueReads = 0;
  const proxiedEnv = new Proxy(makeEnv(), {
    getOwnPropertyDescriptor(target, property) {
      if (property in descriptorReads) descriptorReads[property] += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    get(target, property, receiver) {
      if (property === "WEBHOOK_SECRET" || property === "CONTROL_REF")
        valueReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  const snapshotted = await handleRequest(await signedWebhook(), proxiedEnv);
  assertJsonResponse(snapshotted, 200);
  assert.deepEqual(await snapshotted.json(), {
    ok: true,
    result: "malformed",
  });
  assert.deepEqual(descriptorReads, { WEBHOOK_SECRET: 1, CONTROL_REF: 1 });
  assert.equal(valueReads, 0);
});

test("body limits reject unsafe declarations and cancel chunked overflow", async () => {
  for (const contentLength of ["01", "-1", "+1", "1.0", "9".repeat(30)]) {
    const result = await readBodyWithLimit(
      { headers: new Headers({ "content-length": contentLength }), body: null },
      MAX_WEBHOOK_BYTES,
    );
    assert.deepEqual(result, { ok: false, reason: "invalid_content_length" });
  }

  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_WEBHOOK_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const overflow = await readBodyWithLimit(
    { headers: new Headers({ "content-length": "0" }), body: stream },
    MAX_WEBHOOK_BYTES,
  );
  assert.deepEqual(overflow, { ok: false, reason: "payload_too_large" });
  assert.equal(cancelled, true);
});

test("authentication failures and malformed authority routing never mutate D1", async () => {
  const env = makeEnv();
  const badSignature = await handleRequest(
    await signedWebhook({ signature: `sha256=${"00".repeat(32)}` }),
    env,
  );
  assertJsonResponse(badSignature, 401);
  assertDbEmpty(env.DB);

  const oversize = await handleRequest(
    await signedWebhook({
      raw: "x",
      headers: { "content-length": String(MAX_WEBHOOK_BYTES + 1) },
    }),
    env,
  );
  assertJsonResponse(oversize, 413);
  assertDbEmpty(env.DB);

  const misconfigured = await handleRequest(
    await signedWebhook(),
    makeEnv({ CONTROL_REF: "main" }),
  );
  assertJsonResponse(misconfigured, 500);

  const malformed = await handleRequest(await signedWebhook(), env);
  assertJsonResponse(malformed, 200);
  assert.deepEqual(await malformed.json(), {
    ok: true,
    result: "malformed",
  });
  assertDbEmpty(env.DB);
});

test("authenticated metadata is bounded and responses and logs exclude raw payloads", async () => {
  const canary = "PRIVATE_BODY_SECRET_CANARY";
  const raw = JSON.stringify({
    action: "opened",
    private: canary,
    id: 9007199254740993n.toString(),
  });
  const request = await signedWebhook({
    raw,
    event: "pull_request",
    delivery: "safe-delivery",
  });
  const authenticated = await authenticateWebhookRequest(
    request.clone(),
    makeEnv(),
  );
  assert.equal(authenticated.ok, true);
  assert.equal(authenticated.eventName, "pull_request");
  assert.equal(authenticated.deliveryId, "safe-delivery");
  assert.match(authenticated.payloadDigest, /^[0-9a-f]{64}$/);
  assert.equal(authenticated.payload.private, canary);
  assert.equal("rawBody" in authenticated, false);

  const captured = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => captured.push(args.join(" "));
  console.error = (...args) => captured.push(args.join(" "));
  try {
    const response = await handleRequest(request, makeEnv());
    assertJsonResponse(response, 200);
    assert.deepEqual(await response.clone().json(), {
      ok: true,
      result: "malformed",
    });
    assert.equal(JSON.stringify(await response.json()).includes(canary), false);

    const ignored = await handleRequest(
      await signedWebhook({
        raw: JSON.stringify({ private: canary }),
        event: "ping",
        delivery: "safe-ignored",
      }),
      makeEnv(),
    );
    assertJsonResponse(ignored, 200);
    assert.deepEqual(await ignored.json(), {
      ok: true,
      result: "event_not_allowed",
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  assert.equal(captured.join("\n").includes(canary), false);
});

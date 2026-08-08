import assert from "node:assert/strict";
import test from "node:test";

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

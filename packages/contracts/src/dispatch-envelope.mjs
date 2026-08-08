import {
  isImmutableControlRef,
  REQUEST_STATUS,
  TRIGGER_KIND,
  WATCHDOG_STALE_MS,
} from "./constants.mjs";
import {
  bytesToHex,
  encodeUtf8,
  hmacSha256,
  isValidSharedSecret,
  timingSafeEqualBytes,
} from "./crypto.mjs";
import { isCanonicalDecimalId } from "./ids.mjs";
import { canonicalJson } from "./receipt.mjs";

export const DISPATCH_ENVELOPE_VERSION = "grok-review-dispatch/v1";
export const DISPATCH_HMAC_DOMAIN = "grok-review-dispatch-hmac/v1\0";
export const DISPATCH_ENVELOPE_KEYS = Object.freeze([
  "version",
  "request_id",
  "installation_id",
  "repository_id",
  "pull_number",
  "trigger_kind",
  "trigger_id",
  "actor_id",
  "issued_at",
  "nonce",
  "control_ref",
  "workflow_file",
  "wrapper",
]);

const IDENTIFIER_FIELDS = Object.freeze([
  "request_id",
  "installation_id",
  "repository_id",
  "pull_number",
  "trigger_id",
  "actor_id",
]);
const NONCE_RE = /^[0-9a-f]{32}$/;
const SIGNATURE_RE = /^sha256=[0-9a-f]{64}$/;
const ACTIVE_REQUEST_STATUSES = new Set([
  REQUEST_STATUS.DISPATCHED,
  REQUEST_STATUS.CLAIMED,
  REQUEST_STATUS.STARTED,
]);
const STATIC_WRAPPERS = Object.freeze({
  staging: "review-worker-staging.yml",
  production: "review-worker-production.yml",
});
const REQUEST_KEYS = Object.freeze([
  "request_id",
  "status",
  "workflow_run_id",
  "updated_at",
]);

export class DispatchEnvelopeError extends Error {
  constructor(code) {
    super(code);
    this.name = "DispatchEnvelopeError";
    this.code = code;
  }
}

function fail(code) {
  throw new DispatchEnvelopeError(code);
}

function snapshotExactDataObject(value, keys, errorCode) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(errorCode);
  }
  let ownKeys;
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    fail(errorCode);
  }
  if (
    ownKeys.length !== keys.length ||
    keys.some((key) => !ownKeys.includes(key))
  ) {
    fail(errorCode);
  }
  const entries = [];
  for (const key of keys) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      fail(errorCode);
    }
    if (
      !descriptor ||
      descriptor.enumerable !== true ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      fail(errorCode);
    }
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}

function validateStaticBinding(workflowFile, wrapper, prefix = "dispatch") {
  if (!Object.prototype.hasOwnProperty.call(STATIC_WRAPPERS, wrapper)) {
    fail(`invalid_${prefix}_wrapper`);
  }
  if (!Object.values(STATIC_WRAPPERS).includes(workflowFile)) {
    fail(`invalid_${prefix}_workflow_file`);
  }
  if (STATIC_WRAPPERS[wrapper] !== workflowFile)
    fail(`${prefix}_workflow_wrapper_mismatch`);
}

export function createDispatchEnvelope(input) {
  const snapshot = snapshotExactDataObject(
    input,
    DISPATCH_ENVELOPE_KEYS,
    "invalid_dispatch_envelope_shape",
  );
  if (snapshot.version !== DISPATCH_ENVELOPE_VERSION)
    fail("invalid_dispatch_version");
  if (
    IDENTIFIER_FIELDS.some((field) => !isCanonicalDecimalId(snapshot[field]))
  ) {
    fail("invalid_dispatch_identifier");
  }
  if (DISPATCH_ENVELOPE_KEYS.some((key) => typeof snapshot[key] !== "string")) {
    fail("invalid_dispatch_envelope_value");
  }
  if (!Object.values(TRIGGER_KIND).includes(snapshot.trigger_kind))
    fail("invalid_dispatch_trigger_kind");
  if (!isCanonicalDecimalId(snapshot.issued_at))
    fail("invalid_dispatch_issued_at");
  if (!NONCE_RE.test(snapshot.nonce)) fail("invalid_dispatch_nonce");
  if (!isImmutableControlRef(snapshot.control_ref))
    fail("invalid_dispatch_control_ref");
  validateStaticBinding(snapshot.workflow_file, snapshot.wrapper);
  return Object.freeze(snapshot);
}

function hmacMessage(canonical) {
  return encodeUtf8(`${DISPATCH_HMAC_DOMAIN}${canonical}`);
}

export async function signDispatchEnvelope(envelope, secret) {
  const validated = createDispatchEnvelope(envelope);
  if (!isValidSharedSecret(secret)) fail("invalid_dispatch_secret");
  const mac = await hmacSha256(hmacMessage(canonicalJson(validated)), secret);
  return `sha256=${bytesToHex(mac)}`;
}

function validateExpectedBindings(
  expectedControlRef,
  expectedWorkflowFile,
  expectedWrapper,
) {
  if (!isImmutableControlRef(expectedControlRef))
    fail("invalid_expected_control_ref");
  validateStaticBinding(expectedWorkflowFile, expectedWrapper, "expected");
}

function bindingFailure(
  envelope,
  expectedControlRef,
  expectedWorkflowFile,
  expectedWrapper,
) {
  if (envelope.control_ref !== expectedControlRef)
    return "dispatch_control_ref_mismatch";
  if (envelope.workflow_file !== expectedWorkflowFile)
    return "dispatch_workflow_mismatch";
  if (envelope.wrapper !== expectedWrapper) return "dispatch_wrapper_mismatch";
  return null;
}

export async function verifyDispatchEnvelope({
  envelope,
  signature,
  secret,
  expectedControlRef,
  expectedWorkflowFile,
  expectedWrapper,
} = {}) {
  let validated;
  try {
    validated = createDispatchEnvelope(envelope);
    validateExpectedBindings(
      expectedControlRef,
      expectedWorkflowFile,
      expectedWrapper,
    );
  } catch (error) {
    return { ok: false, reason: error?.code || "invalid_dispatch_envelope" };
  }
  const mismatch = bindingFailure(
    validated,
    expectedControlRef,
    expectedWorkflowFile,
    expectedWrapper,
  );
  if (mismatch) return { ok: false, reason: mismatch };
  if (!SIGNATURE_RE.test(signature || ""))
    return { ok: false, reason: "invalid_dispatch_signature" };
  if (!isValidSharedSecret(secret))
    return { ok: false, reason: "invalid_dispatch_secret" };
  const canonical = canonicalJson(validated);
  const expected = await hmacSha256(hmacMessage(canonical), secret);
  const provided = new Uint8Array(32);
  for (let index = 0; index < provided.length; index += 1) {
    provided[index] = Number.parseInt(
      signature.slice(7 + index * 2, 9 + index * 2),
      16,
    );
  }
  if (!timingSafeEqualBytes(expected, provided)) {
    return { ok: false, reason: "dispatch_signature_invalid" };
  }
  return { ok: true, envelope: validated, canonical };
}

export function dispatchEnvelopeToWorkflowInputs({
  envelope,
  signature,
  expectedControlRef,
  expectedWorkflowFile,
  expectedWrapper,
} = {}) {
  const validated = createDispatchEnvelope(envelope);
  validateExpectedBindings(
    expectedControlRef,
    expectedWorkflowFile,
    expectedWrapper,
  );
  const mismatch = bindingFailure(
    validated,
    expectedControlRef,
    expectedWorkflowFile,
    expectedWrapper,
  );
  if (mismatch) fail(mismatch);
  if (!SIGNATURE_RE.test(signature || "")) fail("invalid_dispatch_signature");
  return Object.freeze({
    ...Object.fromEntries(
      DISPATCH_ENVELOPE_KEYS.map((key) => [key, validated[key]]),
    ),
    dispatch_signature: signature,
  });
}

function admissionFailure(reason) {
  return { ok: false, reason };
}

export function evaluateDispatchAdmissionWindow({
  envelope,
  request,
  workflowRunId,
  nonceConsumed,
  nowMs,
} = {}) {
  let validated;
  try {
    validated = createDispatchEnvelope(envelope);
  } catch (error) {
    return admissionFailure(error?.code || "invalid_dispatch_envelope");
  }
  let persisted;
  try {
    persisted = snapshotExactDataObject(
      request,
      REQUEST_KEYS,
      "invalid_dispatch_request",
    );
  } catch (error) {
    return admissionFailure(error?.code || "invalid_dispatch_request");
  }
  if (
    !isCanonicalDecimalId(persisted.request_id) ||
    !isCanonicalDecimalId(persisted.workflow_run_id) ||
    typeof persisted.status !== "string" ||
    typeof persisted.updated_at !== "string"
  )
    return admissionFailure("invalid_dispatch_request");
  if (nonceConsumed !== false)
    return admissionFailure("dispatch_nonce_consumed");
  if (!ACTIVE_REQUEST_STATUSES.has(persisted.status))
    return admissionFailure("dispatch_request_inactive");
  if (persisted.request_id !== validated.request_id)
    return admissionFailure("dispatch_request_mismatch");
  if (
    !isCanonicalDecimalId(workflowRunId) ||
    persisted.workflow_run_id !== workflowRunId
  ) {
    return admissionFailure("dispatch_run_mismatch");
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0)
    return admissionFailure("invalid_dispatch_now");
  const updatedAtMs = Date.parse(persisted.updated_at);
  if (
    !Number.isFinite(updatedAtMs) ||
    new Date(updatedAtMs).toISOString() !== persisted.updated_at
  ) {
    return admissionFailure("invalid_dispatch_updated_at");
  }
  const issuedAtMs = Number(validated.issued_at) * 1000;
  if (!Number.isSafeInteger(issuedAtMs))
    return admissionFailure("invalid_dispatch_issued_at");
  if (updatedAtMs < issuedAtMs)
    return admissionFailure("dispatch_updated_before_issued");
  if (updatedAtMs > nowMs)
    return admissionFailure("dispatch_updated_in_future");
  if (updatedAtMs - issuedAtMs >= WATCHDOG_STALE_MS) {
    return admissionFailure("dispatch_signing_window_expired");
  }
  if (nowMs - updatedAtMs >= WATCHDOG_STALE_MS) {
    return admissionFailure("dispatch_admission_window_expired");
  }
  return { ok: true };
}

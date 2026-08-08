/**
 * GitHub webhook authentication boundary. Durable routing lands in later slices.
 */

import {
  isImmutableControlRef,
  isValidSharedSecret,
  parseJsonPreservingIntegerIds,
  sha256Hex,
  verifyGitHubSignature256,
} from "@xliberty/grok-review-contracts";
import {
  errorResponse,
  isAllowedJsonContentType,
  logSafe,
  ok,
  readWebhookBody,
} from "./http.mjs";

const SUPPORTED_EVENT_NAMES = new Set([
  "pull_request",
  "issue_comment",
  "check_run",
  "installation",
  "installation_repositories",
]);
const SIGNATURE_RE = /^sha256=[0-9a-fA-F]{64}$/;

function configurationSnapshot(env) {
  if ((typeof env !== "object" && typeof env !== "function") || env === null) {
    throw new Error("invalid configuration");
  }
  const keys = ["WEBHOOK_SECRET", "CONTROL_REF"];
  const descriptors = keys.map((key) =>
    Object.getOwnPropertyDescriptor(env, key),
  );
  const values = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[index];
    if (
      !descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      throw new Error("invalid configuration");
    }
    values[key] = descriptor.value;
  }
  if (
    !isValidSharedSecret(values.WEBHOOK_SECRET) ||
    !isImmutableControlRef(values.CONTROL_REF)
  ) {
    throw new Error("invalid configuration");
  }
  return Object.freeze(values);
}

export function readWebhookIdentityHeaders(request) {
  const eventName = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");
  const signature = request.headers.get("x-hub-signature-256");

  if (
    typeof eventName !== "string" ||
    eventName.length === 0 ||
    /\s/.test(eventName)
  ) {
    return { ok: false, reason: "missing_headers" };
  }
  if (
    typeof deliveryId !== "string" ||
    deliveryId.length === 0 ||
    deliveryId.length > 128 ||
    /\s/.test(deliveryId)
  ) {
    return { ok: false, reason: "missing_headers" };
  }
  if (typeof signature !== "string" || !SIGNATURE_RE.test(signature)) {
    return { ok: false, reason: "missing_headers" };
  }
  return { ok: true, eventName, deliveryId, signature };
}

function rejected(response) {
  return { ok: false, response };
}

export async function authenticateWebhookRequest(request, env) {
  if (request.method !== "POST") {
    return rejected(errorResponse(405, "method_not_allowed"));
  }
  if (!isAllowedJsonContentType(request.headers.get("content-type"))) {
    return rejected(errorResponse(415, "unsupported_media_type"));
  }

  let config;
  try {
    config = configurationSnapshot(env);
  } catch {
    logSafe("error", "webhook_configuration_invalid");
    return rejected(errorResponse(500, "misconfigured"));
  }

  const headers = readWebhookIdentityHeaders(request);
  if (!headers.ok) return rejected(errorResponse(400, headers.reason));

  const bodyResult = await readWebhookBody(request);
  if (!bodyResult.ok) {
    if (bodyResult.reason === "payload_too_large") {
      return rejected(errorResponse(413, "payload_too_large"));
    }
    return rejected(errorResponse(400, "invalid_body"));
  }

  const rawBody = bodyResult.bytes;
  const valid = await verifyGitHubSignature256(
    rawBody,
    headers.signature,
    config.WEBHOOK_SECRET,
  );
  if (!valid) {
    logSafe("error", "webhook_signature_invalid");
    return rejected(errorResponse(401, "invalid_signature"));
  }

  if (!SUPPORTED_EVENT_NAMES.has(headers.eventName)) {
    return {
      ok: true,
      eventAllowed: false,
      eventName: headers.eventName,
      deliveryId: headers.deliveryId,
    };
  }

  let payload;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
    payload = parseJsonPreservingIntegerIds(text);
  } catch {
    return rejected(errorResponse(400, "invalid_json"));
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return rejected(errorResponse(400, "invalid_json"));
  }

  return {
    ok: true,
    eventAllowed: true,
    eventName: headers.eventName,
    deliveryId: headers.deliveryId,
    payloadDigest: await sha256Hex(rawBody),
    payload,
  };
}

export async function handleWebhook(request, env) {
  const authenticated = await authenticateWebhookRequest(request, env);
  if (!authenticated.ok) return authenticated.response;

  if (!authenticated.eventAllowed) {
    logSafe("info", "event_ignored", {
      event: authenticated.eventName,
      delivery_id: authenticated.deliveryId,
    });
    return ok({ result: "event_not_allowed" });
  }

  logSafe("info", "webhook_route_unavailable", {
    event: authenticated.eventName,
    delivery_id: authenticated.deliveryId,
    payload_digest: authenticated.payloadDigest,
  });
  return errorResponse(503, "webhook_route_unavailable");
}

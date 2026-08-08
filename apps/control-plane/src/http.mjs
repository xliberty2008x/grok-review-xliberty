/**
 * Neutral HTTP helpers. Never log bodies, comments, or receipt contents.
 */

import {
  ALLOWED_JSON_CONTENT_TYPES,
  MAX_CALLBACK_BYTES,
  MAX_WEBHOOK_BYTES,
} from "@xliberty/grok-review-contracts";

export function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function ok(extra = {}) {
  return jsonResponse(200, { ok: true, ...extra });
}

export function errorResponse(status, code) {
  return jsonResponse(status, { ok: false, error: code });
}

export function isAllowedJsonContentType(header) {
  if (typeof header !== "string") return false;
  const normalized = header.trim().toLowerCase().replace(/\s+/g, "");
  const candidates = ALLOWED_JSON_CONTENT_TYPES.map((candidate) =>
    candidate.replace(/\s+/g, ""),
  );
  return candidates.includes(normalized);
}

export async function readBodyWithLimit(request, maxBytes) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(contentLength)) {
      return { ok: false, reason: "invalid_content_length" };
    }
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0) {
      return { ok: false, reason: "invalid_content_length" };
    }
    if (declared > maxBytes) {
      return { ok: false, reason: "payload_too_large" };
    }
  }

  const reader = request.body?.getReader?.();
  if (!reader) return { ok: true, bytes: new Uint8Array(0) };

  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // Cancellation is best-effort after the byte ceiling is enforced.
      }
      return { ok: false, reason: "payload_too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export function readWebhookBody(request) {
  return readBodyWithLimit(request, MAX_WEBHOOK_BYTES);
}

export function readCallbackBody(request) {
  return readBodyWithLimit(request, MAX_CALLBACK_BYTES);
}

export function logSafe(level, message, fields = {}) {
  const line = JSON.stringify({ level, message, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

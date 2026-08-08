import {
  HEAD_SHA_HEX_RE,
  MAX_DECIMAL_ID_LENGTH,
  POLICY_VERSION,
  TRIGGER_KIND,
} from "./constants.mjs";

export function isCanonicalDecimalId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_DECIMAL_ID_LENGTH &&
    /^[1-9][0-9]*$/.test(value)
  );
}

export function canonicalDecimalId(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== value) return null;
    return isCanonicalDecimalId(value) ? value : null;
  }
  if (typeof value === "number") {
    if (
      !Number.isInteger(value) ||
      value <= 0 ||
      value > Number.MAX_SAFE_INTEGER
    )
      return null;
    const asString = String(value);
    if (!isCanonicalDecimalId(asString) || Number(asString) !== value)
      return null;
    return asString;
  }
  return null;
}

export function parseJsonPreservingIntegerIds(text) {
  if (typeof text !== "string") throw new SyntaxError("invalid json source");
  let out = "";
  let i = 0;
  let inString = false;
  let escape = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const start = i;
      if (text[i] === "-") i += 1;

      if (text[i] === "0") {
        i += 1;
        if (text[i] >= "0" && text[i] <= "9") {
          throw new SyntaxError("invalid json number");
        }
      } else if (text[i] >= "1" && text[i] <= "9") {
        i += 1;
        while (text[i] >= "0" && text[i] <= "9") i += 1;
      } else {
        throw new SyntaxError("invalid json number");
      }

      let integer = true;
      if (text[i] === ".") {
        integer = false;
        i += 1;
        const fractionStart = i;
        while (text[i] >= "0" && text[i] <= "9") i += 1;
        if (i === fractionStart) throw new SyntaxError("invalid json number");
      }
      if (text[i] === "e" || text[i] === "E") {
        integer = false;
        i += 1;
        if (text[i] === "+" || text[i] === "-") i += 1;
        const exponentStart = i;
        while (text[i] >= "0" && text[i] <= "9") i += 1;
        if (i === exponentStart) throw new SyntaxError("invalid json number");
      }

      const token = text.slice(start, i);
      out += integer ? `"${token}"` : token;
      continue;
    }
    out += ch;
    i += 1;
  }
  return JSON.parse(out);
}

export function canonicalHeadSha(value) {
  if (typeof value !== "string" || !/^[0-9a-fA-F]+$/.test(value)) return null;
  const sha = value.toLowerCase();
  return HEAD_SHA_HEX_RE.test(sha) ? sha : null;
}

export function createOpaqueReceiptId(
  randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto),
) {
  if (typeof randomUUID !== "function")
    throw new Error("receipt_id_rng_unavailable");
  const uuid = randomUUID();
  if (
    typeof uuid !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      uuid,
    )
  )
    throw new Error("invalid_receipt_id_rng");
  return `grr_${uuid.replaceAll("-", "").toLowerCase()}`;
}

export function buildAutomaticRequestKey(input) {
  return [
    "auto",
    input.installationId,
    input.repositoryId,
    input.pullNumber,
    input.action,
    input.deliveryId,
    input.headSha,
    input.policyVersion ?? POLICY_VERSION,
  ].join(":");
}

export function buildManualCommentRequestKey(input) {
  return [
    "manual_comment",
    input.installationId,
    input.repositoryId,
    input.commentId,
  ].join(":");
}

export function buildCheckRerunRequestKey(input) {
  return [
    "check_rerun",
    input.installationId,
    input.repositoryId,
    input.checkRunId,
    input.deliveryId,
  ].join(":");
}

export function buildRequestKey(triggerKind, ids) {
  if (triggerKind === TRIGGER_KIND.AUTOMATIC)
    return buildAutomaticRequestKey(ids);
  if (triggerKind === TRIGGER_KIND.MANUAL_COMMENT)
    return buildManualCommentRequestKey(ids);
  if (triggerKind === TRIGGER_KIND.CHECK_RERUN)
    return buildCheckRerunRequestKey(ids);
  throw new Error("unknown_trigger_kind");
}

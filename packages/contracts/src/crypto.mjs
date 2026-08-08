const textEncoder = new TextEncoder();
const SHARED_SECRET_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

export const SHARED_SECRET_MIN_BYTES = 32;
export const SHARED_SECRET_MAX_BYTES = 4096;

export function encodeUtf8(value) {
  return textEncoder.encode(value);
}

export function isValidSharedSecret(value) {
  if (typeof value !== "string" || SHARED_SECRET_CONTROL_RE.test(value))
    return false;
  const bytes = encodeUtf8(value).byteLength;
  return bytes >= SHARED_SECRET_MIN_BYTES && bytes <= SHARED_SECRET_MAX_BYTES;
}

export function timingSafeEqualBytes(a, b) {
  const av =
    a instanceof ArrayBuffer
      ? new Uint8Array(a)
      : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const bv =
    b instanceof ArrayBuffer
      ? new Uint8Array(b)
      : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  const length = Math.max(av.length, bv.length);
  let diff = av.length ^ bv.length;
  for (let index = 0; index < length; index += 1) {
    diff |=
      (index < av.length ? av[index] : 0) ^ (index < bv.length ? bv[index] : 0);
  }
  return diff === 0;
}

export function timingSafeEqualString(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    timingSafeEqualBytes(encodeUtf8(left), encodeUtf8(right))
  );
}

export function bytesToHex(bytes) {
  const view =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let out = "";
  for (const byte of view) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex) {
  if (
    typeof hex !== "string" ||
    hex.length % 2 !== 0 ||
    !/^[0-9a-fA-F]*$/.test(hex)
  ) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

export async function sha256Hex(data) {
  return bytesToHex(await globalThis.crypto.subtle.digest("SHA-256", data));
}

export async function hmacSha256(rawBody, secret) {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encodeUtf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await globalThis.crypto.subtle.sign("HMAC", key, rawBody),
  );
}

export async function verifySha256SignatureHeader(
  rawBody,
  signatureHeader,
  secret,
) {
  if (
    typeof signatureHeader !== "string" ||
    typeof secret !== "string" ||
    secret.length === 0
  ) {
    return false;
  }
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!match) {
    const mac = await hmacSha256(rawBody, secret);
    timingSafeEqualBytes(mac, mac);
    return false;
  }
  const provided = hexToBytes(match[1]);
  if (!provided) return false;
  return timingSafeEqualBytes(await hmacSha256(rawBody, secret), provided);
}

export async function verifyGitHubSignature256(
  rawBody,
  signatureHeader,
  secret,
) {
  return verifySha256SignatureHeader(rawBody, signatureHeader, secret);
}

export function buildCallbackMacMessage(timestamp, nonce, rawBody) {
  const prefix = encodeUtf8(`${timestamp}\n${nonce}\n`);
  const body =
    rawBody instanceof ArrayBuffer
      ? new Uint8Array(rawBody)
      : new Uint8Array(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
  const out = new Uint8Array(prefix.byteLength + body.byteLength);
  out.set(prefix, 0);
  out.set(body, prefix.byteLength);
  return out;
}

export async function verifyCallbackSignature256(
  rawBody,
  timestamp,
  nonce,
  signatureHeader,
  secret,
) {
  if (typeof timestamp !== "string" || typeof nonce !== "string") return false;
  return verifySha256SignatureHeader(
    buildCallbackMacMessage(timestamp, nonce, rawBody),
    signatureHeader,
    secret,
  );
}

export async function signCallbackMessage(rawBody, timestamp, nonce, secret) {
  const mac = await hmacSha256(
    buildCallbackMacMessage(timestamp, nonce, rawBody),
    secret,
  );
  return `sha256=${bytesToHex(mac)}`;
}

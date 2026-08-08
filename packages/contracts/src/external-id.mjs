import { EXTERNAL_ID_PREFIX } from "./constants.mjs";
import { isCanonicalDecimalId } from "./ids.mjs";

export function encodeExternalId(ids) {
  if (
    !isCanonicalDecimalId(ids.installationId) ||
    !isCanonicalDecimalId(ids.repositoryId) ||
    !isCanonicalDecimalId(ids.pullNumber) ||
    !isCanonicalDecimalId(ids.requestId)
  )
    throw new Error("invalid_external_id_components");
  return [
    EXTERNAL_ID_PREFIX,
    ids.installationId,
    ids.repositoryId,
    ids.pullNumber,
    ids.requestId,
  ].join(":");
}

export function parseExternalId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 200)
    return null;
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== EXTERNAL_ID_PREFIX) return null;
  const [installationId, repositoryId, pullNumber, requestId] = parts.slice(1);
  if (
    !isCanonicalDecimalId(installationId) ||
    !isCanonicalDecimalId(repositoryId) ||
    !isCanonicalDecimalId(pullNumber) ||
    !isCanonicalDecimalId(requestId)
  )
    return null;
  return { installationId, repositoryId, pullNumber, requestId };
}

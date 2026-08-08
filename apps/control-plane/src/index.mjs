import { WEBHOOK_PATH } from "@xliberty/grok-review-contracts";
import { errorResponse, jsonResponse } from "./http.mjs";
import { handleWebhook } from "./webhook.mjs";

export function normalizePath(pathname) {
  if (pathname === "/" || pathname === "") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export async function handleRequest(request, env, ctx, options = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  if (request.method === "GET" && (path === "/healthz" || path === "/health")) {
    return jsonResponse(200, { ok: true, service: "grok-review-app" });
  }
  if (path === WEBHOOK_PATH) {
    return handleWebhook(request, env, { ...options, ctx });
  }
  return errorResponse(404, "not_found");
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};

export {
  errorResponse,
  isAllowedJsonContentType,
  jsonResponse,
  logSafe,
  ok,
  readBodyWithLimit,
  readCallbackBody,
  readWebhookBody,
} from "./http.mjs";
export {
  authenticateWebhookRequest,
  handleWebhook,
  readWebhookIdentityHeaders,
} from "./webhook.mjs";
export {
  ALLOWED_JSON_CONTENT_TYPES,
  CALLBACK_PATH,
  MAX_CALLBACK_BYTES,
  MAX_WEBHOOK_BYTES,
  WEBHOOK_PATH,
  bytesToHex,
  hmacSha256,
  isImmutableControlRef,
  isValidSharedSecret,
  parseJsonPreservingIntegerIds,
  sha256Hex,
  verifyGitHubSignature256,
} from "@xliberty/grok-review-contracts";

export { createMemoryDb } from "./memory-db.mjs";
export {
  upsertInstallation,
  addInstallationRepository,
  clearInstallationRepositories,
  isInstallationRepoAuthorized,
  getRequestById,
  getRequestByKey,
  getDelivery,
  getReceiptById,
  getReceiptByRequestId,
  getOutboxJobById,
  getOutboxJobByKey,
  listOutboxJobs,
  listStaleActiveRequests,
  leaseOutboxJobs,
  repairOutboxJobs,
  rescheduleOutboxJob,
  completeOutboxJob,
  enqueueCancelOutboxJob,
  admitReviewRequestWithOutbox,
  claimWorkflowRunOrEnqueueOrphan,
  casAbortRequest,
  casWatchdogTerminal,
  authorizeReviewRequestWithOutbox,
  setInstallationRepositorySelection,
  supersedePrRequestsWithOutbox,
  supersedeInstallationRequestsWithOutbox,
  supersedeRepositoryRequestsWithOutbox,
  casClaimWorkflowRun,
  casMarkRequestSuperseded,
  casMarkFailedDispatch,
  casCommitTerminalWithReceipt,
} from "./db.mjs";

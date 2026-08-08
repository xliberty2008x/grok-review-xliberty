/**
 * GitHub webhook authentication and staged installation authority.
 * Review admission, dispatch, callbacks, and outbox execution land later.
 */

import {
  ALLOWED_EVENT_ACTIONS,
  ALLOWED_EVENT_NAMES,
  CHECK_RERUN_IDENTIFIER,
  MANUAL_REVIEW_COMMAND,
  canonicalDecimalId,
  canonicalHeadSha,
  isImmutableControlRef,
  isValidSharedSecret,
  parseExternalId,
  parseJsonPreservingIntegerIds,
  sha256Hex,
  verifyGitHubSignature256,
} from "@xliberty/grok-review-contracts";
import {
  addInstallationRepository,
  clearInstallationRepositories,
  deleteInstallation,
  ensureInstallationRow,
  getInstallation,
  getRequestById,
  isInstallationRepoAuthorized,
  removeInstallationRepository,
  setInstallationRepositorySelection,
  supersedeInstallationRequestsWithOutbox,
  supersedeRepositoryRequestsWithOutbox,
  upsertInstallation,
} from "./db.mjs";
import {
  errorResponse,
  isAllowedJsonContentType,
  logSafe,
  ok,
  readWebhookBody,
} from "./http.mjs";

const SUPPORTED_EVENT_NAMES = new Set(ALLOWED_EVENT_NAMES);
const SIGNATURE_RE = /^sha256=[0-9a-fA-F]{64}$/;
const MISSING = Symbol("missing own data property");
const INVALID = Symbol("invalid own data property");

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownData(object, key) {
  if (!isRecord(object)) return INVALID;
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(object, key);
  } catch {
    return INVALID;
  }
  if (!descriptor) return MISSING;
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    return INVALID;
  }
  return descriptor.value;
}

function ownPath(object, keys) {
  let current = object;
  for (const key of keys) {
    const value = ownData(current, key);
    if (value === MISSING || value === INVALID) return value;
    current = value;
  }
  return current;
}

function canonicalOwnId(object, keys) {
  const value = ownPath(object, keys);
  if (value === MISSING || value === INVALID) return null;
  return canonicalDecimalId(value);
}

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

function routingDbSnapshot(env) {
  if ((typeof env !== "object" && typeof env !== "function") || env === null) {
    throw new Error("invalid routing configuration");
  }
  const dbDescriptor = Object.getOwnPropertyDescriptor(env, "DB");
  if (
    !dbDescriptor ||
    !Object.prototype.hasOwnProperty.call(dbDescriptor, "value") ||
    !dbDescriptor.value ||
    (typeof dbDescriptor.value !== "object" &&
      typeof dbDescriptor.value !== "function")
  ) {
    throw new Error("invalid routing configuration");
  }

  return dbDescriptor.value;
}

function routingAppIdSnapshot(env) {
  if ((typeof env !== "object" && typeof env !== "function") || env === null) {
    throw new Error("invalid routing configuration");
  }
  const appDescriptor = Object.getOwnPropertyDescriptor(env, "GITHUB_APP_ID");
  if (
    appDescriptor &&
    !Object.prototype.hasOwnProperty.call(appDescriptor, "value")
  ) {
    throw new Error("invalid routing configuration");
  }
  return appDescriptor?.value;
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
  if (!isRecord(payload)) {
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

function inspectBotSender(sender) {
  if (sender == null) return { valid: true, bot: false };
  if (!isRecord(sender)) return { valid: false, bot: true };
  const type = ownData(sender, "type");
  const bot = ownData(sender, "bot");
  const login = ownData(sender, "login");
  if ([type, bot, login].includes(INVALID)) return { valid: false, bot: true };
  return {
    valid: true,
    bot:
      type === "Bot" ||
      bot === true ||
      (typeof login === "string" && /\[bot\]$/i.test(login)),
  };
}

export function isBotSender(sender) {
  return inspectBotSender(sender).bot;
}

export function isExactManualCommand(body) {
  return typeof body === "string" && body.trim() === MANUAL_REVIEW_COMMAND;
}

export function isAllowedEventAction(eventName, action) {
  if (
    typeof eventName !== "string" ||
    typeof action !== "string" ||
    !Object.prototype.hasOwnProperty.call(ALLOWED_EVENT_ACTIONS, eventName)
  ) {
    return false;
  }
  return ALLOWED_EVENT_ACTIONS[eventName].includes(action);
}

function repositorySelectionCandidate(payload, installation) {
  let value = ownData(payload, "repository_selection");
  if (value === INVALID) return INVALID;
  if (value === MISSING || value == null) {
    value = ownData(installation, "repository_selection");
  }
  return value;
}

function installationSelectionCandidate(installation) {
  return ownData(installation, "repository_selection");
}

function nullishOwnFallback(primary, fallback) {
  if (primary === INVALID) return INVALID;
  if (primary === MISSING || primary == null) return fallback;
  return primary;
}

function parseRepositorySelection(value, fallback) {
  if (value === INVALID) return null;
  if (value === MISSING || value == null) return fallback;
  return value === "all" || value === "selected" ? value : null;
}

function installationAccount(installation) {
  const account = ownData(installation, "account");
  if (account === INVALID) return null;
  if (account === MISSING || account == null) {
    return { accountId: null, accountType: null };
  }
  if (!isRecord(account)) return null;
  const rawId = ownData(account, "id");
  const rawType = ownData(account, "type");
  if (rawId === MISSING || rawId === INVALID || rawType === INVALID)
    return null;
  const accountId = canonicalDecimalId(rawId);
  if (!accountId) return null;
  if (rawType !== MISSING && rawType != null && typeof rawType !== "string") {
    return null;
  }
  return {
    accountId,
    accountType: typeof rawType === "string" ? rawType : null,
  };
}

function repositoryIds(payload, key) {
  const raw = ownData(payload, key);
  if (raw === MISSING) return [];
  if (raw === INVALID) return null;

  const repositories = [];
  try {
    if (!Array.isArray(raw)) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(raw, "length");
    const iteratorDescriptor = Object.getOwnPropertyDescriptor(
      raw,
      Symbol.iterator,
    );
    if (
      !lengthDescriptor ||
      !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
      iteratorDescriptor
    ) {
      return null;
    }
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0) return null;
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")
      ) {
        return null;
      }
      repositories.push(descriptor.value);
    }
  } catch {
    return null;
  }

  const ids = [];
  try {
    for (let index = 0; index < repositories.length; index += 1) {
      const repository = repositories[index];
      if (!isRecord(repository)) return null;
      const rawId = ownData(repository, "id");
      if (rawId === MISSING || rawId === INVALID) return null;
      const repositoryId = canonicalDecimalId(rawId);
      if (!repositoryId) return null;
      ids.push(repositoryId);
    }
  } catch {
    return null;
  }
  return ids;
}

async function handleInstallation(env, payload, action) {
  const installation = ownData(payload, "installation");
  if (!isRecord(installation)) {
    return { handled: true, result: "malformed" };
  }
  const rawInstallationId = ownData(installation, "id");
  const installationId = canonicalDecimalId(rawInstallationId);
  if (!installationId) return { handled: true, result: "malformed" };

  const account = installationAccount(installation);
  const repositories = repositoryIds(payload, "repositories");
  const rawSelection = installationSelectionCandidate(installation);
  if (!account || repositories === null || rawSelection === INVALID) {
    return { handled: true, result: "malformed" };
  }

  const db = routingDbSnapshot(env);
  const existing = await getInstallation(db, installationId);
  const repositorySelection = parseRepositorySelection(
    rawSelection,
    existing?.repository_selection ?? "selected",
  );
  if (!repositorySelection) {
    return { handled: true, result: "invalid_repository_selection" };
  }
  const now = new Date().toISOString();

  if (action === "deleted") {
    await supersedeInstallationRequestsWithOutbox(db, installationId, now);
    await deleteInstallation(db, installationId);
    return { handled: true, result: "installation_deleted" };
  }

  if (action === "suspend") {
    await upsertInstallation(db, {
      installationId,
      ...account,
      repositorySelection,
      suspended: 1,
      createdAt: now,
      updatedAt: now,
    });
    await supersedeInstallationRequestsWithOutbox(db, installationId, now);
    return { handled: true, result: "installation_suspended" };
  }

  await upsertInstallation(db, {
    installationId,
    ...account,
    repositorySelection,
    suspended: 0,
    createdAt: now,
    updatedAt: now,
  });
  if (
    repositorySelection === "selected" &&
    (action === "created" || existing?.repository_selection === "all")
  ) {
    await clearInstallationRepositories(db, installationId);
  }
  for (const repositoryId of repositories) {
    if (repositorySelection === "selected") {
      await addInstallationRepository(db, installationId, repositoryId);
    }
  }
  return { handled: true, result: "installation_upserted" };
}

async function handleInstallationRepositories(env, payload, action) {
  const installation = ownData(payload, "installation");
  if (!isRecord(installation)) {
    return { handled: true, result: "malformed" };
  }
  const installationId = canonicalOwnId(installation, ["id"]);
  if (!installationId) return { handled: true, result: "malformed" };

  const account = installationAccount(installation);
  const added = repositoryIds(payload, "repositories_added");
  const removed = repositoryIds(payload, "repositories_removed");
  const rawSelection = repositorySelectionCandidate(payload, installation);
  if (
    !account ||
    added === null ||
    removed === null ||
    rawSelection === INVALID
  ) {
    return { handled: true, result: "malformed" };
  }

  const db = routingDbSnapshot(env);
  const existing = await getInstallation(db, installationId);
  const repositorySelection = parseRepositorySelection(
    rawSelection,
    existing?.repository_selection ?? "selected",
  );
  if (!repositorySelection) {
    return { handled: true, result: "invalid_repository_selection" };
  }
  const now = new Date().toISOString();

  await ensureInstallationRow(db, {
    installationId,
    ...account,
    repositorySelection,
    suspended: 1,
    createdAt: now,
    updatedAt: now,
  });

  if (existing && existing.repository_selection !== repositorySelection) {
    if (
      existing.repository_selection === "all" &&
      repositorySelection === "selected"
    ) {
      await clearInstallationRepositories(db, installationId);
    }
    await setInstallationRepositorySelection(
      db,
      installationId,
      repositorySelection,
      now,
    );
  }

  if (action === "added") {
    if (repositorySelection === "selected") {
      for (const repositoryId of added) {
        await addInstallationRepository(db, installationId, repositoryId);
      }
    }
    return { handled: true, result: "repos_added" };
  }

  if (repositorySelection === "selected") {
    for (const repositoryId of removed) {
      await removeInstallationRepository(db, installationId, repositoryId);
      await supersedeRepositoryRequestsWithOutbox(
        db,
        installationId,
        repositoryId,
        now,
      );
    }
  }
  return { handled: true, result: "repos_removed" };
}

async function authorizeTrigger(db, installationId, repositoryId) {
  return isInstallationRepoAuthorized(db, installationId, repositoryId);
}

async function handlePullRequest(env, payload) {
  const pullRequest = ownData(payload, "pull_request");
  if (!isRecord(pullRequest)) return { handled: true, result: "malformed" };
  const draft = ownData(pullRequest, "draft");
  if (draft === INVALID || (draft !== MISSING && typeof draft !== "boolean")) {
    return { handled: true, result: "malformed" };
  }
  if (draft === true) return { handled: true, result: "draft_skipped" };

  const installationId = canonicalOwnId(payload, ["installation", "id"]);
  const repositoryId = canonicalOwnId(payload, ["repository", "id"]);
  const pullNumber = canonicalOwnId(pullRequest, ["number"]);
  const triggerId = canonicalOwnId(pullRequest, ["id"]);
  const rawActorId = nullishOwnFallback(
    ownPath(payload, ["sender", "id"]),
    ownPath(pullRequest, ["user", "id"]),
  );
  const actorId =
    rawActorId === MISSING || rawActorId === INVALID
      ? null
      : canonicalDecimalId(rawActorId);
  const head = ownPath(pullRequest, ["head", "sha"]);
  const headSha =
    head === MISSING || head === INVALID ? null : canonicalHeadSha(head);
  if (
    !installationId ||
    !repositoryId ||
    !pullNumber ||
    !triggerId ||
    !actorId ||
    !headSha
  ) {
    return { handled: true, result: "malformed_ids" };
  }
  const db = routingDbSnapshot(env);
  if (!(await authorizeTrigger(db, installationId, repositoryId))) {
    return { handled: true, result: "unauthorized" };
  }
  return { handled: true, result: "deferred", deferred: true };
}

async function handleIssueComment(env, payload) {
  const comment = ownData(payload, "comment");
  const issue = ownData(payload, "issue");
  if (!isRecord(comment) || !isRecord(issue)) {
    return { handled: true, result: "malformed" };
  }
  const pullRequest = ownData(issue, "pull_request");
  if (!isRecord(pullRequest)) {
    return { handled: true, result: "not_pull_request" };
  }

  const sender = ownData(payload, "sender");
  const commentUser = ownData(comment, "user");
  const senderBot = inspectBotSender(sender === MISSING ? null : sender);
  const commentBot = inspectBotSender(
    commentUser === MISSING ? null : commentUser,
  );
  if (!senderBot.valid || !commentBot.valid) {
    return { handled: true, result: "malformed" };
  }
  if (senderBot.bot || commentBot.bot) {
    return { handled: true, result: "bot_rejected" };
  }

  const body = ownData(comment, "body");
  if (body === INVALID || !isExactManualCommand(body)) {
    return { handled: true, result: "command_ignored" };
  }
  const installationId = canonicalOwnId(payload, ["installation", "id"]);
  const repositoryId = canonicalOwnId(payload, ["repository", "id"]);
  const pullNumber = canonicalOwnId(issue, ["number"]);
  const commentId = canonicalOwnId(comment, ["id"]);
  const rawActorId = nullishOwnFallback(
    ownPath(payload, ["sender", "id"]),
    ownPath(comment, ["user", "id"]),
  );
  const actorId =
    rawActorId === MISSING || rawActorId === INVALID
      ? null
      : canonicalDecimalId(rawActorId);
  if (
    !installationId ||
    !repositoryId ||
    !pullNumber ||
    !commentId ||
    !actorId
  ) {
    return { handled: true, result: "malformed_ids" };
  }
  const db = routingDbSnapshot(env);
  if (!(await authorizeTrigger(db, installationId, repositoryId))) {
    return { handled: true, result: "unauthorized" };
  }
  return { handled: true, result: "deferred", deferred: true };
}

async function handleCheckRun(env, payload) {
  const checkRun = ownData(payload, "check_run");
  const requestedAction = ownData(payload, "requested_action");
  if (!isRecord(checkRun) || !isRecord(requestedAction)) {
    return { handled: true, result: "malformed" };
  }
  const identifier = ownData(requestedAction, "identifier");
  if (identifier === INVALID || identifier !== CHECK_RERUN_IDENTIFIER) {
    return { handled: true, result: "foreign_action" };
  }

  const sender = ownData(payload, "sender");
  const senderBot = inspectBotSender(sender === MISSING ? null : sender);
  if (!senderBot.valid) return { handled: true, result: "malformed" };
  if (senderBot.bot) return { handled: true, result: "bot_rejected" };

  const configuredAppId = canonicalDecimalId(routingAppIdSnapshot(env));
  const checkAppId = canonicalOwnId(checkRun, ["app", "id"]);
  if (!configuredAppId || !checkAppId || configuredAppId !== checkAppId) {
    return { handled: true, result: "foreign_check" };
  }
  const externalId = ownData(checkRun, "external_id");
  const parsed =
    externalId === MISSING || externalId === INVALID
      ? null
      : parseExternalId(externalId);
  if (!parsed) return { handled: true, result: "invalid_external_id" };

  const installationId = canonicalOwnId(payload, ["installation", "id"]);
  const repositoryId = canonicalOwnId(payload, ["repository", "id"]);
  const actorId = canonicalOwnId(payload, ["sender", "id"]);
  const checkRunId = canonicalOwnId(checkRun, ["id"]);
  if (!installationId || !repositoryId || !actorId || !checkRunId) {
    return { handled: true, result: "malformed_ids" };
  }
  if (parsed.installationId !== installationId) {
    return { handled: true, result: "installation_mismatch" };
  }
  if (parsed.repositoryId !== repositoryId) {
    return { handled: true, result: "repository_mismatch" };
  }

  const db = routingDbSnapshot(env);
  const parent = await getRequestById(db, parsed.requestId);
  if (!parent) return { handled: true, result: "parent_request_missing" };
  if (
    String(parent.installation_id) !== installationId ||
    String(parent.repository_id) !== repositoryId ||
    String(parent.pull_number) !== parsed.pullNumber
  ) {
    return { handled: true, result: "parent_binding_mismatch" };
  }
  if (
    parent.check_run_id == null ||
    String(parent.check_run_id) !== checkRunId
  ) {
    return { handled: true, result: "check_identity_mismatch" };
  }

  if (!(await authorizeTrigger(db, installationId, repositoryId))) {
    return { handled: true, result: "unauthorized" };
  }
  return { handled: true, result: "deferred", deferred: true };
}

export async function routeWebhookEvent(env, eventName, payload, meta = {}) {
  if (!isRecord(payload)) return { handled: true, result: "malformed" };
  const action = ownData(payload, "action");
  if (action === INVALID || !isAllowedEventAction(eventName, action)) {
    return { handled: true, result: "event_not_allowed" };
  }

  switch (eventName) {
    case "pull_request":
      return handlePullRequest(env, payload, meta);
    case "issue_comment":
      return handleIssueComment(env, payload, meta);
    case "check_run":
      return handleCheckRun(env, payload, meta);
    case "installation":
      return handleInstallation(env, payload, action);
    case "installation_repositories":
      return handleInstallationRepositories(env, payload, action);
    default:
      return { handled: true, result: "event_not_allowed" };
  }
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

  let routeResult;
  try {
    routeResult = await routeWebhookEvent(
      env,
      authenticated.eventName,
      authenticated.payload,
      {
        deliveryId: authenticated.deliveryId,
        payloadDigest: authenticated.payloadDigest,
      },
    );
  } catch {
    logSafe("error", "webhook_route_configuration_invalid", {
      event: authenticated.eventName,
      delivery_id: authenticated.deliveryId,
    });
    return errorResponse(500, "misconfigured");
  }

  if (routeResult?.deferred) {
    logSafe("info", "webhook_route_unavailable", {
      event: authenticated.eventName,
      delivery_id: authenticated.deliveryId,
      payload_digest: authenticated.payloadDigest,
    });
    return errorResponse(503, "webhook_route_unavailable");
  }

  logSafe("info", "webhook_processed", {
    event: authenticated.eventName,
    delivery_id: authenticated.deliveryId,
    result: routeResult?.result ?? "ok",
  });
  return ok({ result: routeResult?.result ?? "ok" });
}

export { getInstallation, isInstallationRepoAuthorized };

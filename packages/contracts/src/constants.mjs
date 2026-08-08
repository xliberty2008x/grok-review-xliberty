export const EXTERNAL_ID_PREFIX = "grv1";
export const POLICY_VERSION = "1";
export const MAX_DECIMAL_ID_LENGTH = 32;
export const HEAD_SHA_HEX_RE = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
export const MAX_WEBHOOK_BYTES = 1 * 1024 * 1024;
export const MAX_CALLBACK_BYTES = 512 * 1024;
export const WEBHOOK_PATH = "/github/webhooks";
export const CALLBACK_PATH = "/internal/callback";
export const MANUAL_REVIEW_COMMAND = "@grok-review review";
export const CHECK_RERUN_IDENTIFIER = "grok_review_rerun";

export const ALLOWED_JSON_CONTENT_TYPES = Object.freeze([
  "application/json",
  "application/json; charset=utf-8",
  "application/json;charset=utf-8",
]);

export function isImmutableControlRef(value) {
  return (
    typeof value === "string" &&
    /^grok-review-runtime-[0-9a-f]{40}$/.test(value)
  );
}

export const TRIGGER_KIND = Object.freeze({
  AUTOMATIC: "automatic",
  MANUAL_COMMENT: "manual_comment",
  CHECK_RERUN: "check_rerun",
});

export const REQUEST_STATUS = Object.freeze({
  PENDING_DISPATCH: "pending_dispatch",
  DISPATCHED: "dispatched",
  FAILED_DISPATCH: "failed_dispatch",
  CLAIMED: "claimed",
  STARTED: "started",
  SUPERSEDED: "superseded",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

/** Statuses that a newer live-authorized request may supersede. */
export const SUPERSEDABLE_STATUSES = Object.freeze([
  REQUEST_STATUS.PENDING_DISPATCH,
  REQUEST_STATUS.DISPATCHED,
  REQUEST_STATUS.FAILED_DISPATCH,
  REQUEST_STATUS.CLAIMED,
  REQUEST_STATUS.STARTED,
]);

/** Statuses that may (re)attempt workflow dispatch. */
export const RETRYABLE_DISPATCH_STATUSES = Object.freeze([
  REQUEST_STATUS.PENDING_DISPATCH,
  REQUEST_STATUS.FAILED_DISPATCH,
]);

/** Terminal request statuses (no further transitions). */
export const TERMINAL_STATUSES = Object.freeze([
  REQUEST_STATUS.SUPERSEDED,
  REQUEST_STATUS.COMPLETED,
  REQUEST_STATUS.FAILED,
  REQUEST_STATUS.CANCELLED,
]);

export const OUTBOX_JOB_TYPE = Object.freeze({
  DISPATCH: "dispatch",
  CANCEL: "cancel",
});

export const OUTBOX_JOB_STATUS = Object.freeze({
  PENDING: "pending",
  LEASED: "leased",
  COMPLETED: "completed",
});

export const ALLOWED_EVENT_ACTIONS = Object.freeze({
  pull_request: Object.freeze([
    "opened",
    "reopened",
    "ready_for_review",
    "synchronize",
  ]),
  issue_comment: Object.freeze(["created"]),
  check_run: Object.freeze(["requested_action"]),
  installation: Object.freeze([
    "created",
    "deleted",
    "suspend",
    "unsuspend",
    "new_permissions_accepted",
  ]),
  installation_repositories: Object.freeze(["added", "removed"]),
});

export const ALLOWED_EVENT_NAMES = Object.freeze(
  Object.keys(ALLOWED_EVENT_ACTIONS),
);

export const WATCHDOG_STALE_MS = 15 * 60_000;

export const EXTERNAL_ID_PREFIX = "grv1";
export const POLICY_VERSION = "1";
export const MAX_DECIMAL_ID_LENGTH = 32;
export const HEAD_SHA_HEX_RE = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

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

export const WATCHDOG_STALE_MS = 15 * 60_000;

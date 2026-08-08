import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createMemoryDb } from "../../apps/control-plane/src/memory-db.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MIGRATION_PATH = path.join(ROOT, "migrations", "0001_init.sql");
const MIGRATION_SHA256 =
  "f8aeefd814275e4ca4c30f47662ae7563c816fc85ae9b47681939d569c5d106a";

const TABLE_COLUMNS = Object.freeze({
  installations: [
    "installation_id",
    "account_id",
    "account_type",
    "repository_selection",
    "suspended",
    "created_at",
    "updated_at",
  ],
  installation_repositories: ["installation_id", "repository_id"],
  webhook_deliveries: [
    "delivery_id",
    "event_name",
    "payload_digest",
    "received_at",
    "status",
  ],
  callback_nonces: ["nonce", "payload_digest", "received_at"],
  review_requests: [
    "request_id",
    "request_key",
    "receipt_id",
    "installation_id",
    "repository_id",
    "pull_number",
    "trigger_kind",
    "trigger_id",
    "actor_id",
    "status",
    "delivery_id",
    "payload_digest",
    "expected_head_sha",
    "policy_version",
    "workflow_run_id",
    "workflow_run_url",
    "workflow_html_url",
    "check_run_id",
    "authorized_at",
    "created_at",
    "updated_at",
  ],
  outbox_jobs: [
    "job_id",
    "job_key",
    "job_type",
    "request_id",
    "workflow_run_id",
    "status",
    "attempt_count",
    "available_at",
    "lease_owner",
    "lease_expires_at",
    "last_error_code",
    "created_at",
    "updated_at",
  ],
  sanitized_receipts: [
    "receipt_id",
    "request_id",
    "workflow_run_id",
    "event",
    "status",
    "check_id",
    "receipt_json",
    "algorithm",
    "key_id",
    "signature",
    "receipt_digest",
    "finding_count",
    "payload_digest",
    "created_at",
  ],
});

const APPLICATION_INDEXES = [
  "idx_installation_repositories_repo",
  "idx_outbox_jobs_ready",
  "idx_outbox_jobs_request",
  "idx_review_requests_active_pr",
  "idx_review_requests_delivery",
  "idx_review_requests_workflow_run",
  "idx_review_requests_workflow_run_unique",
  "idx_sanitized_receipts_request",
  "idx_webhook_deliveries_received",
];

const TEXT_EXTERNAL_IDS = Object.freeze({
  installations: ["installation_id", "account_id"],
  installation_repositories: ["installation_id", "repository_id"],
  webhook_deliveries: ["delivery_id"],
  review_requests: [
    "installation_id",
    "repository_id",
    "pull_number",
    "trigger_id",
    "actor_id",
    "delivery_id",
    "workflow_run_id",
    "check_run_id",
  ],
  outbox_jobs: ["request_id", "workflow_run_id"],
  sanitized_receipts: [
    "receipt_id",
    "request_id",
    "workflow_run_id",
    "check_id",
  ],
});

function migrationBytes() {
  return fs.readFileSync(MIGRATION_PATH);
}

function openMigratedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(migrationBytes().toString("utf8"));
  return db;
}

function schemaSql(db, name) {
  return db
    .prepare("SELECT sql FROM sqlite_schema WHERE name = ?")
    .get(name)
    .sql.replace(/\s+/g, " ")
    .trim();
}

function tableRows(db, table) {
  return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
}

function snapshotRows(db) {
  return Object.fromEntries(
    Object.keys(TABLE_COLUMNS).map((table) => [table, tableRows(db, table)]),
  );
}

function seedRepresentativeSnapshot(db) {
  db.exec(`
    INSERT INTO installations (
      installation_id, account_id, account_type, repository_selection,
      suspended, created_at, updated_at
    ) VALUES ('9007199254740995', '9007199254740996', 'Organization',
      'selected', 0, '2026-08-08T10:00:00.000Z', '2026-08-08T10:00:00.000Z');
    INSERT INTO installation_repositories (installation_id, repository_id)
      VALUES ('9007199254740995', '9007199254740994');
    INSERT INTO webhook_deliveries (
      delivery_id, event_name, payload_digest, received_at, status
    ) VALUES ('delivery-synthetic', 'pull_request', '${"a".repeat(64)}',
      '2026-08-08T10:01:00.000Z', 'accepted');
    INSERT INTO callback_nonces (nonce, payload_digest, received_at)
      VALUES ('nonce-synthetic', '${"b".repeat(64)}',
        '2026-08-08T10:02:00.000Z');
    INSERT INTO review_requests (
      request_key, receipt_id, installation_id, repository_id, pull_number,
      trigger_kind, trigger_id, actor_id, status, delivery_id, payload_digest,
      expected_head_sha, policy_version, workflow_run_id, workflow_run_url,
      workflow_html_url, check_run_id, authorized_at, created_at, updated_at
    ) VALUES (
      'request-key-synthetic', 'receipt-synthetic', '9007199254740995',
      '9007199254740994', '17', 'automatic', '9007199254740997',
      '9007199254740998', 'completed', 'delivery-synthetic',
      '${"c".repeat(64)}', '${"d".repeat(40)}', '1', '9007199254740999',
      'https://example.invalid/workflow', 'https://example.invalid/run',
      '9007199254741000', '2026-08-08T10:03:00.000Z',
      '2026-08-08T10:03:00.000Z', '2026-08-08T10:04:00.000Z'
    );
    INSERT INTO outbox_jobs (
      job_key, job_type, request_id, workflow_run_id, status, attempt_count,
      available_at, lease_owner, lease_expires_at, last_error_code,
      created_at, updated_at
    ) VALUES (
      'dispatch:1', 'dispatch', '1', NULL, 'completed', 1,
      '2026-08-08T10:03:00.000Z', NULL, NULL, NULL,
      '2026-08-08T10:03:00.000Z', '2026-08-08T10:04:00.000Z'
    );
    INSERT INTO sanitized_receipts (
      receipt_id, request_id, workflow_run_id, event, status, check_id,
      receipt_json, algorithm, key_id, signature, receipt_digest,
      finding_count, payload_digest, created_at
    ) VALUES (
      'receipt-synthetic', '1', '9007199254740999', 'terminal', 'completed',
      '9007199254741000', '{"schema_version":"synthetic/v1"}', 'Ed25519',
      'key-synthetic', 'signature-synthetic', '${"e".repeat(64)}', 0,
      '${"f".repeat(64)}', '2026-08-08T10:04:00.000Z'
    );
  `);
}

test("the frozen persistence kernel exposes the exact migration bytes", () => {
  assert.equal(typeof createMemoryDb, "function");
  assert.equal(
    createHash("sha256").update(migrationBytes()).digest("hex"),
    MIGRATION_SHA256,
  );
});

test("an empty SQLite database applies the complete application schema", () => {
  const db = openMigratedDatabase();
  try {
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    const objects = db
      .prepare(
        `SELECT type, name FROM sqlite_schema
         WHERE type IN ('table', 'index', 'trigger')
           AND name NOT LIKE 'sqlite_%'
         ORDER BY type, name`,
      )
      .all();
    assert.deepEqual(
      objects.filter(({ type }) => type === "table").map(({ name }) => name),
      Object.keys(TABLE_COLUMNS).sort(),
    );
    assert.deepEqual(
      objects.filter(({ type }) => type === "index").map(({ name }) => name),
      APPLICATION_INDEXES,
    );
    assert.deepEqual(
      objects.filter(({ type }) => type === "trigger"),
      [],
    );
  } finally {
    db.close();
  }
});

test("columns, identifiers, uniqueness, checks, and membership cascade stay closed", () => {
  const db = openMigratedDatabase();
  try {
    for (const [table, expected] of Object.entries(TABLE_COLUMNS)) {
      assert.deepEqual(
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map(({ name }) => name),
        expected,
        table,
      );
    }
    for (const [table, columns] of Object.entries(TEXT_EXTERNAL_IDS)) {
      const types = new Map(
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map(({ name, type }) => [name, type]),
      );
      for (const column of columns) assert.equal(types.get(column), "TEXT");
    }

    const requestSql = schemaSql(db, "review_requests");
    assert.match(
      requestSql,
      /trigger_kind IN \('automatic', 'manual_comment', 'check_rerun'\)/,
    );
    for (const status of [
      "pending_dispatch",
      "dispatched",
      "failed_dispatch",
      "claimed",
      "started",
      "superseded",
      "completed",
      "failed",
      "cancelled",
    ]) {
      assert.match(requestSql, new RegExp(`'${status}'`));
    }
    assert.match(requestSql, /receipt_id TEXT NOT NULL UNIQUE/);
    assert.match(requestSql, /UNIQUE \(request_key\)/);

    const workflowIndex = schemaSql(
      db,
      "idx_review_requests_workflow_run_unique",
    );
    assert.match(workflowIndex, /^CREATE UNIQUE INDEX /);
    assert.match(workflowIndex, /WHERE workflow_run_id IS NOT NULL$/);

    const outboxSql = schemaSql(db, "outbox_jobs");
    assert.match(outboxSql, /job_type IN \('dispatch', 'cancel'\)/);
    assert.match(outboxSql, /status IN \('pending', 'leased', 'completed'\)/);
    assert.match(outboxSql, /attempt_count >= 0/);
    assert.match(
      outboxSql,
      /job_type = 'dispatch' AND request_id IS NOT NULL AND workflow_run_id IS NULL/,
    );
    assert.match(
      outboxSql,
      /job_type = 'cancel' AND workflow_run_id IS NOT NULL/,
    );

    const receiptSql = schemaSql(db, "sanitized_receipts");
    assert.match(
      receiptSql,
      /status IN \('completed', 'failed', 'cancelled'\)/,
    );
    assert.match(receiptSql, /algorithm = 'Ed25519'/);
    assert.match(receiptSql, /UNIQUE \(request_id\)/);

    assert.deepEqual(
      db
        .prepare("PRAGMA foreign_key_list(installation_repositories)")
        .all()
        .map((row) => ({ ...row })),
      [
        {
          id: 0,
          seq: 0,
          table: "installations",
          from: "installation_id",
          to: "installation_id",
          on_update: "NO ACTION",
          on_delete: "CASCADE",
          match: "NONE",
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("reapplying the migration preserves a representative frozen snapshot", () => {
  const db = openMigratedDatabase();
  try {
    seedRepresentativeSnapshot(db);
    const before = snapshotRows(db);
    db.exec(migrationBytes().toString("utf8"));
    assert.deepEqual(snapshotRows(db), before);
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(TABLE_COLUMNS).map((table) => [
          table,
          db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
        ]),
      ),
      {
        installations: 1,
        installation_repositories: 1,
        webhook_deliveries: 1,
        callback_nonces: 1,
        review_requests: 1,
        outbox_jobs: 1,
        sanitized_receipts: 1,
      },
    );
  } finally {
    db.close();
  }
});

test("a failed paired request and outbox SQL transaction rolls back both rows", () => {
  const db = openMigratedDatabase();
  try {
    db.exec("BEGIN");
    assert.throws(
      () =>
        db.exec(`
          INSERT INTO review_requests (
            request_key, receipt_id, installation_id, repository_id,
            pull_number, trigger_kind, trigger_id, actor_id, status,
            created_at, updated_at
          ) VALUES (
            'request-key-rollback', 'receipt-rollback', '1', '2', '3',
            'automatic', '4', '5', 'pending_dispatch',
            '2026-08-08T11:00:00.000Z', '2026-08-08T11:00:00.000Z'
          );
          INSERT INTO outbox_jobs (
            job_key, job_type, request_id, workflow_run_id, status,
            available_at, created_at, updated_at
          ) VALUES (
            'cancel:invalid', 'cancel', NULL, NULL, 'pending',
            '2026-08-08T11:00:00.000Z', '2026-08-08T11:00:00.000Z',
            '2026-08-08T11:00:00.000Z'
          );
        `),
      /constraint/i,
    );
    db.exec("ROLLBACK");
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM review_requests WHERE request_key = ?",
        )
        .get("request-key-rollback").count,
      0,
    );
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS count FROM outbox_jobs WHERE job_key = ?")
        .get("cancel:invalid").count,
      0,
    );
  } finally {
    db.close();
  }
});

test("the schema has no retention machinery or sensitive storage columns", () => {
  const sql = migrationBytes().toString("utf8");
  assert.equal(sql.match(/\bON DELETE CASCADE\b/gi)?.length, 1);
  const withoutMembershipCascade = sql.replace(/\bON DELETE CASCADE\b/i, "");
  const uncommented = withoutMembershipCascade.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(uncommented, /^\s*(?:DELETE|DROP|VACUUM)\b/im);
  assert.doesNotMatch(
    uncommented,
    /\b(?:PURGE|TTL|EXPIRY|EXPIRE|EXPIRATION)\b/i,
  );
  assert.doesNotMatch(uncommented, /\bCREATE\s+TRIGGER\b/i);

  const db = openMigratedDatabase();
  try {
    const columns = Object.keys(TABLE_COLUMNS).flatMap((table) =>
      db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map(({ name }) => name.toLowerCase()),
    );
    const forbidden = [
      "repository_code",
      "repository_content",
      "repository_diff",
      "diff",
      "diff_text",
      "patch",
      "prompt",
      "instructions",
      "model_output",
      "raw_model_output",
      "findings",
      "raw_findings",
      "access_token",
      "token",
      "secret",
      "provider_diagnostics",
      "raw_provider_diagnostics",
      "stdout",
      "stderr",
    ];
    assert.deepEqual(
      columns.filter((column) => forbidden.includes(column)),
      [],
    );
  } finally {
    db.close();
  }
});

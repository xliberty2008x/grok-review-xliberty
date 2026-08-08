import assert from "node:assert/strict";
import test from "node:test";

import {
  addInstallationRepository,
  admitReviewRequestWithOutbox,
  casClaimWorkflowRun,
  createMemoryDb,
  getOutboxJobByKey,
  getRequestById,
  handleRequest,
  isInstallationRepoAuthorized,
  upsertInstallation,
} from "../../apps/control-plane/src/index.mjs";
import { getInstallation } from "../../apps/control-plane/src/db.mjs";
import {
  REQUEST_STATUS,
  WEBHOOK_PATH,
} from "../../packages/contracts/src/constants.mjs";
import {
  bytesToHex,
  hmacSha256,
} from "../../packages/contracts/src/crypto.mjs";

const WEBHOOK_SECRET = "test-webhook-secret-value-at-least-32-bytes";
const CONTROL_REF =
  "grok-review-runtime-ea3594fb1f7cc546ede6d3dca2282860e54b8721";
const MANUAL_REVIEW_COMMAND = "@grok-review review";
const CHECK_RERUN_IDENTIFIER = "grok_review_rerun";
const HEAD_SHA = "a".repeat(40);
const HUGE_INSTALLATION_ID = "9007199254740995";
const HUGE_ACCOUNT_ID = "9007199254740996";
const HUGE_REPOSITORY_ID = "9007199254740997";

function makeEnv(overrides = {}) {
  return {
    DB: createMemoryDb(),
    WEBHOOK_SECRET,
    CONTROL_REF,
    GITHUB_APP_ID: "12345",
    ...overrides,
  };
}

async function signatureFor(raw, secret = WEBHOOK_SECRET) {
  const bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
  return `sha256=${bytesToHex(await hmacSha256(bytes, secret))}`;
}

async function signedWebhook({
  body,
  raw,
  event,
  delivery = `delivery-${Math.random()}`,
  secret = WEBHOOK_SECRET,
} = {}) {
  const source = raw ?? JSON.stringify(body);
  return new Request(`https://worker.example${WEBHOOK_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": delivery,
      "x-hub-signature-256": await signatureFor(source, secret),
    },
    body: source,
  });
}

async function invoke(env, input, options = {}) {
  const pending = [];
  const ctx = options.ctx ?? {
    waitUntil(promise) {
      pending.push(Promise.resolve(promise));
    },
  };
  const response = await handleRequest(
    await signedWebhook(input),
    env,
    ctx,
    options,
  );
  if (!options.ctx) await Promise.all(pending);
  return response;
}

async function resultOf(response) {
  const body = await response.json();
  return { response, body };
}

function prPayload(overrides = {}) {
  return {
    action: "opened",
    pull_request: {
      id: "7001",
      number: "7",
      draft: false,
      head: { sha: HEAD_SHA },
      user: { id: "42", login: "dev", type: "User" },
    },
    repository: { id: "500" },
    installation: { id: "100" },
    sender: { id: "42", login: "dev", type: "User" },
    ...overrides,
  };
}

function commentPayload(overrides = {}) {
  return {
    action: "created",
    comment: {
      id: "8001",
      body: MANUAL_REVIEW_COMMAND,
      user: { id: "42", login: "dev", type: "User" },
    },
    issue: { number: "7", pull_request: { url: "https://example.invalid" } },
    repository: { id: "500" },
    installation: { id: "100" },
    sender: { id: "42", login: "dev", type: "User" },
    ...overrides,
  };
}

async function seedInstallation(
  env,
  {
    installationId = "100",
    repositoryId = "500",
    repositorySelection = "selected",
    suspended = 0,
  } = {},
) {
  const now = "2026-08-08T00:00:00.000Z";
  await upsertInstallation(env.DB, {
    installationId,
    accountId: "9",
    accountType: "Organization",
    repositorySelection,
    suspended,
    createdAt: now,
    updatedAt: now,
  });
  if (repositorySelection === "selected" && repositoryId) {
    await addInstallationRepository(env.DB, installationId, repositoryId);
  }
}

function stateCounts(db) {
  return {
    deliveries: db.deliveries.size,
    requests: db.requestsById.size,
    outbox: db.outboxById.size,
    receipts: db.receipts.size,
    nonces: db.nonces.size,
  };
}

function outboundSpy() {
  const calls = [];
  return {
    calls,
    fetchImpl: async (...args) => {
      calls.push(args);
      throw new Error("outbound call forbidden in authority slice");
    },
  };
}

async function seedDispatchedRequest(
  env,
  suffix = "1",
  { installationId = "100", repositoryId = "500" } = {},
) {
  const now = "2026-08-08T00:00:00.000Z";
  const row = await admitReviewRequestWithOutbox(env.DB, {
    requestKey: `seeded:${suffix}`,
    receiptId: `receipt-${suffix}`,
    installationId,
    repositoryId,
    pullNumber: "7",
    triggerKind: "automatic",
    triggerId: "7001",
    actorId: "42",
    status: REQUEST_STATUS.PENDING_DISPATCH,
    deliveryId: null,
    payloadDigest: null,
    expectedHeadSha: HEAD_SHA,
    policyVersion: "1",
    createdAt: now,
    updatedAt: now,
  });
  const claimed = await casClaimWorkflowRun(env.DB, row.request_id, {
    workflowRunId: `610${suffix}`,
    workflowRunUrl: `https://api.github.com/runs/610${suffix}`,
    workflowHtmlUrl: `https://github.com/runs/610${suffix}`,
    updatedAt: now,
  });
  assert.equal(claimed, true);
  return getRequestById(env.DB, row.request_id);
}

function seedMappedParent(env, overrides = {}) {
  const row = {
    request_id: "77",
    request_key: "seeded-parent",
    receipt_id: "receipt-parent",
    installation_id: "100",
    repository_id: "500",
    pull_number: "7",
    trigger_kind: "automatic",
    trigger_id: "7001",
    actor_id: "42",
    status: REQUEST_STATUS.STARTED,
    delivery_id: null,
    payload_digest: null,
    expected_head_sha: HEAD_SHA,
    policy_version: "1",
    workflow_run_id: "6000",
    workflow_run_url: "https://api.github.com/runs/6000",
    workflow_html_url: "https://github.com/runs/6000",
    check_run_id: "6001",
    authorized_at: "2026-08-08T00:00:00.000Z",
    created_at: "2026-08-08T00:00:00.000Z",
    updated_at: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
  env.DB.requestsById.set(row.request_id, row);
  env.DB.requestsByKey.set(row.request_key, row);
  return row;
}

function checkPayload(overrides = {}) {
  return {
    action: "requested_action",
    requested_action: { identifier: CHECK_RERUN_IDENTIFIER },
    check_run: {
      id: "6001",
      external_id: "grv1:100:500:7:77",
      app: { id: "12345" },
    },
    installation: { id: "100" },
    repository: { id: "500" },
    sender: { id: "42", login: "dev", type: "User" },
    ...overrides,
  };
}

test("installation lifecycle stores exact high IDs and enforces selected all suspend and delete", async () => {
  const env = makeEnv();
  const createdPayload = {
    action: "created",
    repository_selection: "all",
    installation: {
      id: HUGE_INSTALLATION_ID,
      account: { id: HUGE_ACCOUNT_ID, type: "Organization" },
      repository_selection: "selected",
    },
    repositories: [{ id: HUGE_REPOSITORY_ID }],
  };
  let raw = JSON.stringify(createdPayload);
  for (const id of [
    HUGE_INSTALLATION_ID,
    HUGE_ACCOUNT_ID,
    HUGE_REPOSITORY_ID,
  ]) {
    raw = raw.replace(`"${id}"`, id);
  }

  const created = await resultOf(
    await invoke(env, { raw, event: "installation", delivery: "high-created" }),
  );
  assert.equal(created.response.status, 200);
  assert.equal(created.body.result, "installation_upserted");
  const stored = await getInstallation(env.DB, HUGE_INSTALLATION_ID);
  assert.equal(stored.installation_id, HUGE_INSTALLATION_ID);
  assert.equal(stored.account_id, HUGE_ACCOUNT_ID);
  assert.equal(stored.repository_selection, "selected");
  assert.equal(
    await isInstallationRepoAuthorized(
      env.DB,
      HUGE_INSTALLATION_ID,
      HUGE_REPOSITORY_ID,
    ),
    true,
  );

  const suspended = await resultOf(
    await invoke(env, {
      body: {
        action: "suspend",
        installation: {
          id: HUGE_INSTALLATION_ID,
          account: { id: HUGE_ACCOUNT_ID, type: "Organization" },
          repository_selection: "selected",
        },
      },
      event: "installation",
      delivery: "high-suspend",
    }),
  );
  assert.equal(suspended.body.result, "installation_suspended");
  assert.equal(
    await isInstallationRepoAuthorized(
      env.DB,
      HUGE_INSTALLATION_ID,
      HUGE_REPOSITORY_ID,
    ),
    false,
  );

  const unsuspended = await resultOf(
    await invoke(env, {
      body: {
        action: "unsuspend",
        installation: {
          id: HUGE_INSTALLATION_ID,
          account: { id: HUGE_ACCOUNT_ID, type: "Organization" },
          repository_selection: "all",
        },
      },
      event: "installation",
      delivery: "high-unsuspend",
    }),
  );
  assert.equal(unsuspended.body.result, "installation_upserted");
  assert.equal(
    await isInstallationRepoAuthorized(env.DB, HUGE_INSTALLATION_ID, "999"),
    true,
  );

  const replay = await resultOf(
    await invoke(env, {
      body: {
        action: "new_permissions_accepted",
        installation: {
          id: HUGE_INSTALLATION_ID,
          account: { id: HUGE_ACCOUNT_ID, type: "Organization" },
          repository_selection: "all",
        },
      },
      event: "installation",
      delivery: "high-permissions",
    }),
  );
  assert.equal(replay.body.result, "installation_upserted");
  assert.equal(env.DB.installations.size, 1);

  const deleted = await resultOf(
    await invoke(env, {
      body: {
        action: "deleted",
        installation: { id: HUGE_INSTALLATION_ID },
      },
      event: "installation",
      delivery: "high-deleted",
    }),
  );
  assert.equal(deleted.body.result, "installation_deleted");
  assert.equal(await getInstallation(env.DB, HUGE_INSTALLATION_ID), null);
});

test("repository lifecycle is insert-only suspended and transitions selection fail closed", async () => {
  const absent = makeEnv();
  const inserted = await resultOf(
    await invoke(absent, {
      body: {
        action: "added",
        repository_selection: "selected",
        installation: {
          id: "100",
          account: { id: "9", type: "Organization" },
          repository_selection: "selected",
        },
        repositories_added: [{ id: "500" }],
      },
      event: "installation_repositories",
      delivery: "repo-absent",
    }),
  );
  assert.equal(inserted.body.result, "repos_added");
  assert.equal((await getInstallation(absent.DB, "100")).suspended, 1);
  assert.equal(
    await isInstallationRepoAuthorized(absent.DB, "100", "500"),
    false,
  );

  await seedInstallation(absent, { suspended: 1 });
  await invoke(absent, {
    body: {
      action: "added",
      installation: { id: "100", account: { id: "9", type: "Organization" } },
      repositories_added: [{ id: "501" }],
    },
    event: "installation_repositories",
    delivery: "repo-still-suspended",
  });
  assert.equal((await getInstallation(absent.DB, "100")).suspended, 1);

  const env = makeEnv();
  await seedInstallation(env);
  await invoke(env, {
    body: {
      action: "added",
      repository_selection: "all",
      installation: {
        id: "100",
        account: { id: "9", type: "Organization" },
        repository_selection: "all",
      },
      repositories_added: [],
    },
    event: "installation_repositories",
    delivery: "selected-to-all",
  });
  assert.equal(await isInstallationRepoAuthorized(env.DB, "100", "999"), true);

  await invoke(env, {
    body: {
      action: "added",
      repository_selection: "selected",
      installation: {
        id: "100",
        account: { id: "9", type: "Organization" },
        repository_selection: "selected",
      },
      repositories_added: [{ id: "501" }],
    },
    event: "installation_repositories",
    delivery: "all-to-selected",
  });
  assert.equal(await isInstallationRepoAuthorized(env.DB, "100", "500"), false);
  assert.equal(await isInstallationRepoAuthorized(env.DB, "100", "501"), true);

  await invoke(env, {
    body: {
      action: "removed",
      repository_selection: "selected",
      installation: {
        id: "100",
        account: { id: "9", type: "Organization" },
        repository_selection: "selected",
      },
      repositories_removed: [{ id: "501" }],
    },
    event: "installation_repositories",
    delivery: "selected-remove",
  });
  assert.equal(await isInstallationRepoAuthorized(env.DB, "100", "501"), false);
});

test("invalid lifecycle actions selections IDs and shapes fail closed without authority state", async () => {
  const cases = [
    [
      "installation",
      {
        action: "created",
        installation: {
          id: "100",
          account: { id: "9", type: "Organization" },
          repository_selection: "everything",
        },
      },
      "invalid_repository_selection",
    ],
    [
      "installation",
      {
        action: "created",
        installation: {
          id: "01",
          account: { id: "9", type: "Organization" },
          repository_selection: "selected",
        },
      },
      "malformed",
    ],
    [
      "installation",
      {
        action: "created",
        installation: {
          id: "100",
          account: { id: "09", type: "Organization" },
          repository_selection: "selected",
        },
      },
      "malformed",
    ],
    ["installation", { action: "created", installation: [] }, "malformed"],
    [
      "installation_repositories",
      { action: "added", installation: null, repositories_added: [] },
      "malformed",
    ],
    [
      "installation",
      { action: "edited", installation: { id: "100" } },
      "event_not_allowed",
    ],
  ];
  for (const [event, body, expected] of cases) {
    const env = makeEnv();
    const output = await resultOf(
      await invoke(env, { body, event, delivery: `invalid-${expected}` }),
    );
    assert.equal(output.response.status, 200);
    assert.equal(output.body.result, expected);
    assert.equal(env.DB.installations.size, 0);
    assert.deepEqual(stateCounts(env.DB), {
      deliveries: 0,
      requests: 0,
      outbox: 0,
      receipts: 0,
      nonces: 0,
    });
  }
});

test("repository arrays prevalidate completely before any authority or revocation mutation", async () => {
  const fresh = makeEnv();
  const mixedCreate = await resultOf(
    await invoke(fresh, {
      body: {
        action: "created",
        installation: {
          id: "100",
          account: { id: "9", type: "Organization" },
          repository_selection: "selected",
        },
        repositories: [{ id: "500" }, { id: "01" }],
      },
      event: "installation",
      delivery: "mixed-create",
    }),
  );
  assert.equal(mixedCreate.response.status, 200);
  assert.equal(mixedCreate.body.result, "malformed");
  assert.equal(fresh.DB.installations.size, 0);
  assert.equal(fresh.DB.installationRepos.size, 0);

  const env = makeEnv();
  await seedInstallation(env);
  const active = await seedDispatchedRequest(env, "mixed");
  const before = stateCounts(env.DB);
  const mixedRemove = await resultOf(
    await invoke(env, {
      body: {
        action: "removed",
        repository_selection: "selected",
        installation: {
          id: "100",
          account: { id: "9", type: "Organization" },
          repository_selection: "selected",
        },
        repositories_removed: [{ id: "500" }, { id: { value: "501" } }],
      },
      event: "installation_repositories",
      delivery: "mixed-remove",
    }),
  );
  assert.equal(mixedRemove.response.status, 200);
  assert.equal(mixedRemove.body.result, "malformed");
  assert.equal(await isInstallationRepoAuthorized(env.DB, "100", "500"), true);
  assert.equal(
    (await getRequestById(env.DB, active.request_id)).status,
    REQUEST_STATUS.DISPATCHED,
  );
  assert.deepEqual(stateCounts(env.DB), before);
  assert.equal(
    [...env.DB.outboxById.values()].filter((job) => job.job_type === "cancel")
      .length,
    0,
  );
});

test("repository arrays reject own iterator and index accessors without invocation or mutation", async (t) => {
  const { routeWebhookEvent } =
    await import("../../apps/control-plane/src/index.mjs");
  const cases = [
    {
      name: "own Symbol.iterator accessor",
      canary: "REPOSITORY_ITERATOR_PRIVATE_DIAGNOSTIC",
      repositories(calls) {
        const repositories = [{ id: "500" }];
        Object.defineProperty(repositories, Symbol.iterator, {
          configurable: true,
          get() {
            calls.count += 1;
            return Array.prototype[Symbol.iterator];
          },
        });
        return repositories;
      },
    },
    {
      name: "numeric index accessor",
      canary: "REPOSITORY_INDEX_PRIVATE_DIAGNOSTIC",
      repositories(calls) {
        const repositories = [];
        Object.defineProperty(repositories, "0", {
          configurable: true,
          enumerable: true,
          get() {
            calls.count += 1;
            return { id: "500" };
          },
        });
        return repositories;
      },
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const env = makeEnv();
      const calls = { count: 0 };
      const logs = [];
      const originalLog = console.log;
      const originalError = console.error;
      console.log = (...args) => logs.push(args.join(" "));
      console.error = (...args) => logs.push(args.join(" "));
      let output;
      try {
        output = await routeWebhookEvent(
          env,
          "installation",
          {
            action: "created",
            installation: {
              id: "100",
              account: { id: "9", type: "Organization" },
              repository_selection: "selected",
            },
            repositories: item.repositories(calls),
          },
          {
            deliveryId: `repository-accessor-${item.name}`,
            payloadDigest: "a".repeat(64),
          },
        );
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }

      assert.equal(calls.count, 0, item.canary);
      assert.deepEqual(output, { handled: true, result: "malformed" });
      assert.equal(env.DB.installations.size, 0);
      assert.equal(env.DB.installationRepos.size, 0);
      assert.deepEqual(stateCounts(env.DB), {
        deliveries: 0,
        requests: 0,
        outbox: 0,
        receipts: 0,
        nonces: 0,
      });
      assert.equal(
        `${JSON.stringify(output)}\n${logs.join("\n")}`.includes(item.canary),
        false,
      );
    });
  }
});

test("trigger safety decisions stop before admission while authorized triggers stay visibly unavailable", async () => {
  const env = makeEnv();
  const outbound = outboundSpy();

  const unauthorized = await resultOf(
    await invoke(
      env,
      { body: prPayload(), event: "pull_request", delivery: "pr-no-install" },
      outbound,
    ),
  );
  assert.equal(unauthorized.response.status, 200);
  assert.equal(unauthorized.body.result, "unauthorized");

  await seedInstallation(env, { suspended: 1 });
  const suspended = await resultOf(
    await invoke(
      env,
      { body: prPayload(), event: "pull_request", delivery: "pr-suspended" },
      outbound,
    ),
  );
  assert.equal(suspended.body.result, "unauthorized");

  await seedInstallation(env);
  const draft = await resultOf(
    await invoke(
      env,
      {
        body: prPayload({
          pull_request: {
            id: "7001",
            number: "7",
            draft: true,
            head: { sha: HEAD_SHA },
            user: { id: "42", type: "User" },
          },
        }),
        event: "pull_request",
        delivery: "pr-draft",
      },
      outbound,
    ),
  );
  assert.equal(draft.body.result, "draft_skipped");

  const invalidSender = await resultOf(
    await invoke(
      env,
      {
        body: prPayload({
          sender: { id: "01", login: "dev", type: "User" },
        }),
        event: "pull_request",
        delivery: "pr-invalid-sender-no-fallback",
      },
      outbound,
    ),
  );
  assert.equal(invalidSender.response.status, 200);
  assert.equal(invalidSender.body.result, "malformed_ids");

  const beforeAutomatic = stateCounts(env.DB);
  const botAutomatic = await resultOf(
    await invoke(
      env,
      {
        body: prPayload({
          sender: { id: "9", login: "dependabot[bot]", type: "Bot" },
          pull_request: {
            id: "7001",
            number: "7",
            draft: false,
            head: { sha: HEAD_SHA },
            user: { id: "9", login: "dependabot[bot]", type: "Bot" },
          },
        }),
        event: "pull_request",
        delivery: "pr-bot-valid",
      },
      outbound,
    ),
  );
  assert.equal(botAutomatic.response.status, 503);
  assert.equal(botAutomatic.body.error, "webhook_route_unavailable");
  assert.deepEqual(stateCounts(env.DB), beforeAutomatic);

  const botManual = await resultOf(
    await invoke(
      env,
      {
        body: commentPayload({
          sender: { id: "9", login: "dependabot[bot]", type: "Bot" },
          comment: {
            id: "8001",
            body: MANUAL_REVIEW_COMMAND,
            user: { id: "9", type: "Bot" },
          },
        }),
        event: "issue_comment",
        delivery: "manual-bot",
      },
      outbound,
    ),
  );
  assert.equal(botManual.body.result, "bot_rejected");

  const notPr = await resultOf(
    await invoke(
      env,
      {
        body: commentPayload({ issue: { number: "7" } }),
        event: "issue_comment",
        delivery: "manual-not-pr",
      },
      outbound,
    ),
  );
  assert.equal(notPr.body.result, "not_pull_request");

  const malformedCommand = await resultOf(
    await invoke(
      env,
      {
        body: commentPayload({
          comment: {
            id: "8001",
            body: "@grok-review review please",
            user: { id: "42", type: "User" },
          },
        }),
        event: "issue_comment",
        delivery: "manual-malformed",
      },
      outbound,
    ),
  );
  assert.equal(malformedCommand.body.result, "command_ignored");

  const invalidManualSender = await resultOf(
    await invoke(
      env,
      {
        body: commentPayload({
          sender: { id: "01", login: "dev", type: "User" },
        }),
        event: "issue_comment",
        delivery: "manual-invalid-sender-no-fallback",
      },
      outbound,
    ),
  );
  assert.equal(invalidManualSender.response.status, 200);
  assert.equal(invalidManualSender.body.result, "malformed_ids");

  const beforeManual = stateCounts(env.DB);
  const manual = await resultOf(
    await invoke(
      env,
      {
        body: commentPayload(),
        event: "issue_comment",
        delivery: "manual-valid",
      },
      outbound,
    ),
  );
  assert.equal(manual.response.status, 503);
  assert.equal(manual.body.error, "webhook_route_unavailable");
  assert.deepEqual(stateCounts(env.DB), beforeManual);
  assert.equal(outbound.calls.length, 0);
});

test("check requested_action binds App external identity parent check actor and authority", async () => {
  const env = makeEnv();
  await seedInstallation(env);
  seedMappedParent(env);
  const outbound = outboundSpy();
  const baseline = stateCounts(env.DB);

  const safeCases = [
    [
      "foreign_action",
      checkPayload({ requested_action: { identifier: "foreign" } }),
    ],
    [
      "foreign_check",
      checkPayload({
        check_run: {
          id: "6001",
          external_id: "grv1:100:500:7:77",
          app: { id: "999" },
        },
      }),
    ],
    ["repository_mismatch", checkPayload({ repository: { id: "999" } })],
    ["installation_mismatch", checkPayload({ installation: { id: "999" } })],
    [
      "parent_request_missing",
      checkPayload({
        check_run: {
          id: "6001",
          external_id: "grv1:100:500:7:999",
          app: { id: "12345" },
        },
      }),
    ],
    [
      "check_identity_mismatch",
      checkPayload({
        check_run: {
          id: "6002",
          external_id: "grv1:100:500:7:77",
          app: { id: "12345" },
        },
      }),
    ],
    [
      "bot_rejected",
      checkPayload({ sender: { id: "9", login: "bot[bot]", type: "Bot" } }),
    ],
  ];
  for (const [expected, body] of safeCases) {
    const output = await resultOf(
      await invoke(
        env,
        {
          body,
          event: "check_run",
          delivery: `check-${expected}`,
        },
        outbound,
      ),
    );
    assert.equal(output.response.status, 200, expected);
    assert.equal(output.body.result, expected);
    assert.deepEqual(stateCounts(env.DB), baseline);
  }

  const valid = await resultOf(
    await invoke(
      env,
      {
        body: checkPayload(),
        event: "check_run",
        delivery: "check-valid",
      },
      outbound,
    ),
  );
  assert.equal(valid.response.status, 503);
  assert.equal(valid.body.error, "webhook_route_unavailable");
  assert.deepEqual(stateCounts(env.DB), baseline);
  assert.equal(outbound.calls.length, 0);
});

test("revocation supersedes seeded active work and leaves cancellation pending without network", async (t) => {
  const cases = [
    {
      name: "installation suspend",
      event: "installation",
      body: {
        action: "suspend",
        installation: {
          id: "100",
          account: { id: "9", type: "Organization" },
          repository_selection: "selected",
        },
      },
      expected: "installation_suspended",
    },
    {
      name: "installation delete",
      event: "installation",
      body: { action: "deleted", installation: { id: "100" } },
      expected: "installation_deleted",
    },
    {
      name: "selected repository remove",
      event: "installation_repositories",
      body: {
        action: "removed",
        repository_selection: "selected",
        installation: {
          id: "100",
          account: { id: "9", type: "Organization" },
          repository_selection: "selected",
        },
        repositories_removed: [{ id: "500" }],
      },
      expected: "repos_removed",
    },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    await t.test(item.name, async () => {
      const env = makeEnv();
      await seedInstallation(env);
      await seedInstallation(env, {
        installationId: "200",
        repositoryId: "900",
      });
      const row = await seedDispatchedRequest(env, String(index + 1));
      const unscoped = await seedDispatchedRequest(
        env,
        `unscoped-${index + 1}`,
        { installationId: "200", repositoryId: "900" },
      );
      const outbound = outboundSpy();
      let waits = 0;
      const ctx = {
        waitUntil() {
          waits += 1;
        },
      };
      const output = await resultOf(
        await invoke(
          env,
          {
            body: item.body,
            event: item.event,
            delivery: `revoke-${index}`,
          },
          { ...outbound, ctx },
        ),
      );
      assert.equal(output.response.status, 200);
      assert.equal(output.body.result, item.expected);
      assert.equal(
        (await getRequestById(env.DB, row.request_id)).status,
        REQUEST_STATUS.SUPERSEDED,
      );
      const cancel = await getOutboxJobByKey(
        env.DB,
        `cancel:${row.workflow_run_id}`,
      );
      assert.equal(cancel.status, "pending");
      assert.equal(cancel.workflow_run_id, row.workflow_run_id);
      assert.equal(
        (await getRequestById(env.DB, unscoped.request_id)).status,
        REQUEST_STATUS.DISPATCHED,
      );
      assert.equal(
        [...env.DB.outboxById.values()].filter(
          (job) =>
            job.job_type === "cancel" &&
            job.workflow_run_id === row.workflow_run_id,
        ).length,
        1,
      );

      const duplicate = await resultOf(
        await invoke(
          env,
          {
            body: item.body,
            event: item.event,
            delivery: `revoke-duplicate-${index}`,
          },
          { ...outbound, ctx },
        ),
      );
      assert.equal(duplicate.response.status, 200);
      assert.equal(
        [...env.DB.outboxById.values()].filter(
          (job) =>
            job.job_type === "cancel" &&
            job.workflow_run_id === row.workflow_run_id,
        ).length,
        1,
      );
      assert.equal(outbound.calls.length, 0);
      assert.equal(waits, 0);
      assert.equal(env.DB.deliveries.size, 0);
    });
  }
});

test("authority bindings are own data snapshots and reflection failures are generic", async () => {
  const dbAccessorCalls = { count: 0 };
  const dbAccessorEnv = {
    WEBHOOK_SECRET,
    CONTROL_REF,
    GITHUB_APP_ID: "12345",
  };
  Object.defineProperty(dbAccessorEnv, "DB", {
    enumerable: true,
    get() {
      dbAccessorCalls.count += 1;
      throw new Error("DB_PRIVATE_DIAGNOSTIC");
    },
  });
  const dbAccessor = await resultOf(
    await invoke(dbAccessorEnv, {
      body: prPayload(),
      event: "pull_request",
      delivery: "db-accessor",
    }),
  );
  assert.equal(dbAccessor.response.status, 500);
  assert.equal(dbAccessor.body.error, "misconfigured");
  assert.equal(dbAccessorCalls.count, 0);

  const appAccessorCalls = { count: 0 };
  const appAccessorEnv = makeEnv();
  Object.defineProperty(appAccessorEnv, "GITHUB_APP_ID", {
    enumerable: true,
    configurable: true,
    get() {
      appAccessorCalls.count += 1;
      throw new Error("APP_PRIVATE_DIAGNOSTIC");
    },
  });
  const appAccessor = await resultOf(
    await invoke(appAccessorEnv, {
      body: checkPayload(),
      event: "check_run",
      delivery: "app-accessor",
    }),
  );
  assert.equal(appAccessor.response.status, 500);
  assert.equal(appAccessor.body.error, "misconfigured");
  assert.equal(appAccessorCalls.count, 0);

  const descriptorReads = { DB: 0, GITHUB_APP_ID: 0 };
  let valueReads = 0;
  const backing = makeEnv();
  await seedInstallation(backing);
  const snapshotted = new Proxy(backing, {
    getOwnPropertyDescriptor(target, property) {
      if (property in descriptorReads) descriptorReads[property] += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    get(target, property, receiver) {
      if (property === "DB" || property === "GITHUB_APP_ID") valueReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  const valid = await resultOf(
    await invoke(snapshotted, {
      body: prPayload(),
      event: "pull_request",
      delivery: "snapshot-valid",
    }),
  );
  assert.equal(valid.response.status, 503);
  assert.deepEqual(descriptorReads, { DB: 1, GITHUB_APP_ID: 0 });
  assert.equal(valueReads, 0);

  const foreignActionReads = { DB: 0, GITHUB_APP_ID: 0 };
  const foreignActionEnv = new Proxy(backing, {
    getOwnPropertyDescriptor(target, property) {
      if (property in foreignActionReads) foreignActionReads[property] += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  const foreignAction = await resultOf(
    await invoke(foreignActionEnv, {
      body: checkPayload({ requested_action: { identifier: "foreign" } }),
      event: "check_run",
      delivery: "foreign-action-no-app-read",
    }),
  );
  assert.equal(foreignAction.body.result, "foreign_action");
  assert.deepEqual(foreignActionReads, { DB: 0, GITHUB_APP_ID: 0 });

  const draftReads = { DB: 0, GITHUB_APP_ID: 0 };
  const draftEnv = new Proxy(backing, {
    getOwnPropertyDescriptor(target, property) {
      if (property in draftReads) draftReads[property] += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  const draft = await resultOf(
    await invoke(draftEnv, {
      body: prPayload({
        pull_request: {
          id: "7001",
          number: "7",
          draft: true,
          head: { sha: HEAD_SHA },
          user: { id: "42", type: "User" },
        },
      }),
      event: "pull_request",
      delivery: "draft-no-db-read",
    }),
  );
  assert.equal(draft.body.result, "draft_skipped");
  assert.deepEqual(draftReads, { DB: 0, GITHUB_APP_ID: 0 });

  seedMappedParent(backing);
  const validCheckReads = { DB: 0, GITHUB_APP_ID: 0 };
  const validCheckEnv = new Proxy(backing, {
    getOwnPropertyDescriptor(target, property) {
      if (property in validCheckReads) validCheckReads[property] += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  const validCheck = await resultOf(
    await invoke(validCheckEnv, {
      body: checkPayload(),
      event: "check_run",
      delivery: "valid-check-app-read",
    }),
  );
  assert.equal(validCheck.response.status, 503);
  assert.deepEqual(validCheckReads, { DB: 1, GITHUB_APP_ID: 1 });

  const dbA = createMemoryDb();
  const dbB = createMemoryDb();
  const swappingEnv = makeEnv({ DB: dbA });
  await seedInstallation(swappingEnv);
  const originalPrepare = dbA.prepare.bind(dbA);
  let swapped = false;
  dbA.prepare = (sql) => {
    if (!swapped) {
      swapped = true;
      swappingEnv.DB = dbB;
    }
    return originalPrepare(sql);
  };
  const detached = await resultOf(
    await invoke(swappingEnv, {
      body: prPayload(),
      event: "pull_request",
      delivery: "db-swap",
    }),
  );
  assert.equal(detached.response.status, 503);
  assert.equal(swapped, true);
  assert.equal(dbB.installations.size, 0);

  const canary = "REFLECTION_PRIVATE_DIAGNOSTIC";
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const reflectionEnv = new Proxy(makeEnv(), {
      getOwnPropertyDescriptor(target, property) {
        if (property === "DB") throw new Error(canary);
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    const failed = await resultOf(
      await invoke(reflectionEnv, {
        body: prPayload(),
        event: "pull_request",
        delivery: "reflection-failure",
      }),
    );
    assert.equal(failed.response.status, 500);
    assert.deepEqual(failed.body, { ok: false, error: "misconfigured" });
  } finally {
    console.error = originalError;
  }
  assert.equal(logs.join("\n").includes(canary), false);
});

test("bot check rejects before App or DB descriptor snapshots", async () => {
  const canary = "BOT_APP_ACCESSOR_PRIVATE_DIAGNOSTIC";
  const appAccessorCalls = { count: 0 };
  const descriptorReads = { DB: 0, GITHUB_APP_ID: 0 };
  const backing = makeEnv();
  await seedInstallation(backing);
  const parent = seedMappedParent(backing);
  const baseline = {
    state: stateCounts(backing.DB),
    installations: backing.DB.installations.size,
    installationRepos: backing.DB.installationRepos.size,
    parent: { ...parent },
  };
  Object.defineProperty(backing, "GITHUB_APP_ID", {
    configurable: true,
    enumerable: true,
    get() {
      appAccessorCalls.count += 1;
      throw new Error(canary);
    },
  });
  const env = new Proxy(backing, {
    getOwnPropertyDescriptor(target, property) {
      if (Object.prototype.hasOwnProperty.call(descriptorReads, property)) {
        descriptorReads[property] += 1;
      }
      if (property === "GITHUB_APP_ID") {
        return {
          configurable: true,
          enumerable: true,
          value: "12345",
          writable: false,
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  const outbound = outboundSpy();
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  let output;
  try {
    output = await resultOf(
      await invoke(
        env,
        {
          body: checkPayload({
            sender: { id: "9", login: "bot[bot]", type: "Bot" },
          }),
          event: "check_run",
          delivery: "bot-check-no-routing-bindings",
        },
        outbound,
      ),
    );
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.equal(output.response.status, 200);
  assert.deepEqual(output.body, { ok: true, result: "bot_rejected" });
  assert.deepEqual(descriptorReads, { DB: 0, GITHUB_APP_ID: 0 });
  assert.equal(appAccessorCalls.count, 0);
  assert.deepEqual(stateCounts(backing.DB), baseline.state);
  assert.equal(backing.DB.installations.size, baseline.installations);
  assert.equal(backing.DB.installationRepos.size, baseline.installationRepos);
  assert.deepEqual(
    backing.DB.requestsById.get(parent.request_id),
    baseline.parent,
  );
  assert.equal(outbound.calls.length, 0);
  assert.equal(
    `${JSON.stringify(output.body)}\n${logs.join("\n")}`.includes(canary),
    false,
  );
});

test("untrusted nested shapes inherited properties and coercible IDs fail without getter invocation", async () => {
  const { routeWebhookEvent } =
    await import("../../apps/control-plane/src/index.mjs");
  assert.equal(typeof routeWebhookEvent, "function");
  const env = makeEnv();
  const getterCalls = { count: 0 };
  const coercible = {
    toString() {
      getterCalls.count += 1;
      return "100";
    },
  };
  const inherited = Object.create({ installation: { id: "100" } });
  Object.assign(inherited, {
    action: "created",
    repositories: [],
  });
  const getterPayload = { action: "created" };
  Object.defineProperty(getterPayload, "installation", {
    enumerable: true,
    get() {
      getterCalls.count += 1;
      throw new Error("NESTED_PRIVATE_DIAGNOSTIC");
    },
  });
  const nestedGetter = {
    action: "created",
    installation: {
      account: { id: "9", type: "Organization" },
      repository_selection: "selected",
    },
  };
  Object.defineProperty(nestedGetter.installation, "id", {
    enumerable: true,
    get() {
      getterCalls.count += 1;
      throw new Error("NESTED_ID_PRIVATE_DIAGNOSTIC");
    },
  });
  const polluted = JSON.parse(
    '{"action":"created","__proto__":{"installation":{"id":"100"}}}',
  );
  const malformed = [
    null,
    [],
    { action: "created", installation: [] },
    inherited,
    getterPayload,
    nestedGetter,
    { action: "created", installation: { id: coercible } },
    polluted,
  ];
  for (const payload of malformed) {
    const result = await routeWebhookEvent(env, "installation", payload, {
      deliveryId: "direct-malformed",
      payloadDigest: "a".repeat(64),
    });
    assert.match(result.result, /^(malformed|event_not_allowed)$/);
  }
  assert.equal(getterCalls.count, 0);
  assert.equal(env.DB.installations.size, 0);
  assert.equal({}.installation, undefined);

  const module = await import("../../apps/control-plane/src/index.mjs");
  assert.equal(module.isAllowedEventAction("__proto__", "created"), false);
  assert.equal(module.isAllowedEventAction("constructor", "created"), false);
});

test("authority logs and responses remain metadata-only", async () => {
  const env = makeEnv({ GITHUB_APP_ID: "9007199254740999" });
  await seedInstallation(env);
  seedMappedParent(env);
  const canaries = [
    "RAW_PAYLOAD_PRIVATE_CANARY",
    "APP_ID_PRIVATE_CANARY",
    "grv1:100:500:7:77",
  ];
  canaries.push(WEBHOOK_SECRET, env.GITHUB_APP_ID);
  const payload = checkPayload({
    private: canaries[0],
    check_run: {
      id: "6001",
      external_id: "grv1:100:500:7:77",
      app: { id: env.GITHUB_APP_ID },
    },
  });
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  let response;
  try {
    response = await invoke(env, {
      body: payload,
      event: "check_run",
      delivery: "safe-metadata",
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  const body = JSON.stringify(await response.json());
  const combined = `${body}\n${logs.join("\n")}`;
  for (const canary of canaries) assert.equal(combined.includes(canary), false);
  assert.equal(combined.includes("12345"), false);
  assert.equal(response.status, 503);
});

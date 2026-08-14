import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchAuthoritativeReviewContext
} from "../apps/grok-review-app/src/actions/github-authority.mjs";
import {
  EXACT_GROK_CLI,
  formatAutomaticHeadMismatchSummary,
  parseWorkflowInputs,
  runCentralReview
} from "../apps/grok-review-app/src/actions/central-runner.mjs";
import {
  buildPrReviewPayload,
  formatMergeBaseHeadScopeLine
} from "../scripts/ci/lib/build-pr-review-payload.mjs";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const MERGE_BASE = "c".repeat(40);
const NEW_HEAD = "d".repeat(40);
const RECEIPT_ID = `grr_${"8".repeat(32)}`;
const RECEIPT_ENVELOPE = Object.freeze({
  alg: "Ed25519",
  kid: "1".repeat(64),
  receipt_sha256: "2".repeat(64),
  signature: "A".repeat(86)
});

function inputs() {
  return parseWorkflowInputs({
    request_id: "1001",
    installation_id: "2001",
    repository_id: "3001",
    pull_number: "17",
    trigger_kind: "automatic",
    trigger_id: "4001",
    actor_id: "5001"
  });
}

function config() {
  return Object.freeze({
    workflowRunId: "6001",
    githubSha: "e".repeat(40),
    runtimeCommit: "e".repeat(40),
    runtimeRoot: "/trusted/runtime",
    runtimeBundleSha256: "f".repeat(64),
    nodeVersion: process.version.slice(1),
    githubAppId: "7001",
    githubAppClientId: "Iv1.test-client",
    githubAppPrivateKey: "PRIVATE APP KEY",
    workerOrigin: "https://worker.example",
    callbackSecret: "callback-secret",
    receiptPrivateKey: "PRIVATE RECEIPT KEY",
    receiptPublicKey: "PUBLIC RECEIPT KEY",
    grokAuthJson: '{"xai":{"key":"grok-only"}}',
    model: "grok-4.6",
    modelVersion: "grok-4.6",
    effort: "high",
    grokCliVersion: EXACT_GROK_CLI.version,
    grokCliSha256: EXACT_GROK_CLI.darwinArm64Sha256,
    grokPackageIntegritySha256: EXACT_GROK_CLI.packageIntegritySha256,
    grokPackageGitCommit: EXACT_GROK_CLI.packageGitCommit
  });
}

function packet() {
  const patch = [
    "diff --git a/src/app.js b/src/app.js",
    "index 1111111..2222222 100644",
    "--- a/src/app.js",
    "+++ b/src/app.js",
    "@@ -1,2 +1,2 @@",
    "-const answer = 40;",
    "+const answer = 41;",
    " export { answer };",
    ""
  ].join("\n");
  return Object.freeze({
    identity: Object.freeze({
      owner: "octo-org",
      repository: "target-repo",
      pullNumber: 17,
      baseRef: "main",
      baseTipSha: BASE,
      mergeBaseSha: MERGE_BASE,
      headSha: HEAD
    }),
    patch: Object.freeze({
      encoding: "utf8",
      content: patch,
      bytes: Buffer.byteLength(patch),
      digest: "3".repeat(64),
      untrusted: true
    }),
    receipt: Object.freeze({
      patchDigest: "3".repeat(64),
      patchBytes: Buffer.byteLength(patch),
      commitCount: 2,
      changedFileCount: 1,
      instructions: Object.freeze({
        files: Object.freeze([])
      })
    })
  });
}

function claim() {
  return {
    result: "claimed",
    request_id: "1001",
    installation_id: "2001",
    repository_id: "3001",
    pull_number: "17",
    trigger_kind: "automatic",
    trigger_id: "4001",
    actor_id: "5001",
    expected_head_sha: HEAD,
    receipt_id: RECEIPT_ID,
    policy_version: "1",
    workflow_run_id: "6001"
  };
}

function makeHarness(options = {}) {
  const events = [];
  let claimCount = 0;
  let tokenCounter = 0;
  const createdChecks = [];
  const completedChecks = [];
  const callback = {
    async claim() {
      claimCount += 1;
      events.push(`claim:${claimCount}`);
      return {
        ...claim(),
        result: claimCount === 1 ? "claimed" : "already_claimed"
      };
    },
    async authorized() {
      events.push("callback:authorized");
      return { ...claim(), result: "authorized" };
    },
    async started(value) {
      events.push("callback:started");
      assert.equal(value.checkId, "8001");
      return { result: "started", request_id: "1001" };
    },
    async abort(value) {
      events.push(`callback:abort:${value.status}:${value.checkId ?? "null"}`);
      return { result: "aborted", request_id: "1001" };
    },
    async terminal(value) {
      events.push(`callback:terminal:${value.status}`);
      return {
        result: "accepted",
        receipt_id: value.receipt.receipt_id
      };
    }
  };
  const deps = {
    computeRuntimeBundleDigest() {
      return config().runtimeBundleSha256;
    },
    attestLocalGrok(value) {
      return {
        binary: "/trusted/grok",
        version: value.expectedVersion,
        sha256: value.expectedSha256,
        size: 129_363_664,
        packageIntegritySha256: EXACT_GROK_CLI.packageIntegritySha256,
        packageGitCommit: EXACT_GROK_CLI.packageGitCommit,
        identityDigest: "6".repeat(64),
        releaseIdentityDigest: "7".repeat(64)
      };
    },
    createAppJwt() {
      return "app-jwt";
    },
    createGitHubClient({ token }) {
      return {
        token,
        request() {
          throw new Error("network_not_expected");
        }
      };
    },
    async mintInstallationToken({ phase, repositoryId }) {
      tokenCounter += 1;
      events.push(`mint:${phase}`);
      return { phase, repositoryId, token: `${phase}-token-${tokenCounter}` };
    },
    async revokeInstallationToken({ token }) {
      events.push(`revoke:${token.split("-token-")[0]}`);
    },
    async fetchAuthoritativeReviewContext() {
      events.push("authority");
      if (options.authorityError) throw options.authorityError;
      return Object.freeze({
        installationId: "2001",
        repositoryId: "3001",
        owner: "octo-org",
        name: "target-repo",
        fullName: "octo-org/target-repo",
        pullNumber: "17",
        baseSha: BASE,
        headSha: HEAD,
        reviewHeadSha: HEAD,
        baseRef: "main",
        draft: false,
        isFork: true,
        actor: null
      });
    },
    async fetchAuthoritativeAppIdentity() {
      events.push("app-identity");
      return {
        appId: "7001",
        appSlug: "grok-review",
        botId: "9001",
        botLogin: "grok-review[bot]"
      };
    },
    async createOrReconcileCheckRun(value) {
      events.push("check:create");
      createdChecks.push(value);
      assert.equal(value.headSha, options.checkHeadSha ?? HEAD);
      return {
        id: "8001",
        status: "in_progress",
        conclusion: null,
        reconciled: false
      };
    },
    async completeCheckRun(value) {
      events.push(`check:complete:${value.conclusion}`);
      completedChecks.push(value);
      return {
        id: value.checkId,
        status: "completed",
        conclusion: value.conclusion
      };
    },
    async collectCanonicalReviewPacket() {
      events.push("collect");
      return packet();
    },
    assertCredentialBoundary() {
      events.push("credential-boundary");
    },
    async runIsolatedModelReview() {
      events.push("model");
      return {
        providerLaunched: true,
        providerVersion: EXACT_GROK_CLI.version,
        providerProcess: {
          pid: 12345,
          startToken: "test-start-token",
          processGroupId: 12345
        },
        durationMs: 42,
        review: {
          verdict: "pass",
          summary: "The exact-head change is clean.",
          findings: []
        }
      };
    },
    collectRightSideMap() {
      return {
        hasLine() {
          return false;
        },
        hasRange() {
          return false;
        }
      };
    },
    buildPrReviewPayload: options.buildPrReviewPayload ?? buildPrReviewPayload,
    async signReceipt({ receipt }) {
      events.push("receipt:sign");
      return { receipt, envelope: RECEIPT_ENVELOPE };
    },
    buildReceiptMarker(receipt) {
      return `<!-- grok-review-receipt:v1:${receipt.receipt_id}:${"2".repeat(64)}:Ed25519:${"1".repeat(64)}:${"A".repeat(86)} -->`;
    },
    async reconcileReviewByReceiptMarker() {
      return null;
    },
    async createPendingReview(value) {
      events.push("review:create-pending");
      options.onPending?.(value);
      return { id: "8101", state: "PENDING", commitId: value.headSha };
    },
    async submitPendingReview() {
      events.push("review:submit-comment");
      return { id: "8101", state: "COMMENTED", commitId: HEAD };
    },
    async deletePendingReview() {
      events.push("review:delete-pending");
    },
    now: (() => {
      let tick = 0;
      return () => new Date(Date.UTC(2026, 6, 28, 12, 0, tick++));
    })()
  };
  return { events, callback, deps, createdChecks, completedChecks };
}

function staticClient(routes) {
  return {
    async request(path, options = {}) {
      const key = `${options.method ?? "GET"} ${path}`;
      const route = routes[key] ?? routes[path];
      if (route === undefined) throw new Error(`missing route ${key}`);
      return { status: options.expectedStatus ?? 200, json: structuredClone(route) };
    }
  };
}

test("automatic admit creates an in_progress Grok review check before model invoke", async () => {
  let pending;
  const harness = makeHarness({
    onPending(value) {
      pending = value;
    }
  });
  const result = await runCentralReview(
    {
      inputs: inputs(),
      config: config(),
      callback: harness.callback,
      cancelRequested: () => false
    },
    harness.deps
  );
  assert.equal(result.status, "completed");
  assert.ok(harness.events.includes("check:create"));
  assert.ok(harness.events.includes("model"));
  assert.ok(
    harness.events.indexOf("check:create") < harness.events.indexOf("model")
  );
  assert.equal(harness.createdChecks[0].headSha, HEAD);
  assert.match(harness.createdChecks[0].title, /Grok review/);
  assert.equal(pending.event ?? "COMMENT", "COMMENT");
  assert.match(
    pending.body,
    new RegExp(formatMergeBaseHeadScopeLine({
      commitCount: 2,
      changedFileCount: 1
    }).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.equal(pending.body.includes("APPROVE"), false);
});

test("automatic_head_mismatch cancels the bound-SHA check and posts no COMMENT", async () => {
  const mismatch = new Error("automatic_head_mismatch");
  mismatch.code = "automatic_head_mismatch";
  mismatch.liveHeadSha = NEW_HEAD;
  mismatch.expectedHeadSha = HEAD;
  mismatch.owner = "octo-org";
  mismatch.name = "target-repo";
  const harness = makeHarness({
    authorityError: mismatch,
    checkHeadSha: HEAD
  });
  await assert.rejects(
    () => runCentralReview(
      {
        inputs: inputs(),
        config: config(),
        callback: harness.callback,
        cancelRequested: () => false
      },
      harness.deps
    ),
    (error) =>
      error.code === "central_runner_cancelled"
      && error.causeCode === "automatic_head_mismatch"
  );
  assert.equal(harness.events.includes("callback:authorized"), false);
  assert.equal(harness.events.includes("model"), false);
  assert.equal(harness.events.includes("collect"), false);
  assert.equal(harness.events.includes("review:create-pending"), false);
  assert.equal(harness.events.includes("review:submit-comment"), false);
  assert.ok(harness.events.includes("check:create"));
  assert.ok(harness.events.includes("check:complete:cancelled"));
  assert.equal(harness.createdChecks[0].headSha, HEAD);
  assert.equal(harness.completedChecks[0].headSha, HEAD);
  assert.equal(harness.completedChecks[0].conclusion, "cancelled");
  assert.match(
    harness.completedChecks[0].summary,
    new RegExp(formatAutomaticHeadMismatchSummary(NEW_HEAD).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.match(harness.completedChecks[0].summary, new RegExp(NEW_HEAD));
  assert.ok(harness.events.includes("callback:abort:cancelled:8001"));
});

test("authority mismatch error names the live head without authorizing COMMENT", async () => {
  const routes = {
    "GET /app/installations/4": {
      id: "4",
      app_id: "12345",
      target_id: "99",
      target_type: "Organization",
      suspended_at: null
    },
    "GET /repositories/5": {
      id: "5",
      name: "repo",
      full_name: "owner/repo",
      owner: { id: "99", login: "owner", type: "Organization" },
      disabled: false
    },
    "GET /repos/owner/repo/pulls/6": {
      number: "6",
      id: "7",
      state: "open",
      draft: false,
      base: { sha: BASE, ref: "main", repo: { id: "5" } },
      head: { sha: NEW_HEAD, repo: { id: "55" } }
    }
  };
  const client = staticClient(routes);
  await assert.rejects(
    () => fetchAuthoritativeReviewContext({
      appClient: client,
      repoClient: client,
      installationId: "4",
      repositoryId: "5",
      pullNumber: "6",
      triggerKind: "automatic",
      actorId: "8",
      expectedHeadSha: HEAD,
      expectedTriggerId: "7",
      expectedAppId: "12345"
    }),
    (error) =>
      error.code === "automatic_head_mismatch"
      && error.liveHeadSha === NEW_HEAD
      && error.expectedHeadSha === HEAD
      && error.owner === "owner"
      && error.name === "repo"
  );
});

test("zero-finding COMMENT body includes host merge-base..head counts", () => {
  const scope = formatMergeBaseHeadScopeLine({
    commitCount: 2,
    changedFileCount: 16
  });
  const mapped = buildPrReviewPayload({
    job: {
      result: {
        review: {
          summary: "No issues found.",
          findings: []
        }
      }
    },
    headSha: HEAD,
    hostScope: {
      commitCount: 2,
      changedFileCount: 16
    }
  });
  assert.equal(mapped.skip, false);
  assert.equal(mapped.payload.event, "COMMENT");
  assert.match(mapped.payload.body, /## Grok review/);
  assert.match(mapped.payload.body, new RegExp(scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(mapped.payload.body, /2 commits/);
  assert.match(mapped.payload.body, /16 changed files/);
  assert.equal(mapped.payload.body.includes("APPROVE"), false);
  assert.equal(mapped.payload.body.includes("REQUEST_CHANGES"), false);
});

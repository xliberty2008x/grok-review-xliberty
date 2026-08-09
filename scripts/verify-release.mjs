#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CLOSED_MANIFEST = Object.freeze({
  schema_version: 1,
  asset: Object.freeze({
    name: "grok-0.2.112-darwin-arm64",
    version: "0.2.112",
    platform: "darwin",
    arch: "arm64",
    size: 129363664,
    sha256: "5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4",
    package_integrity_sha256:
      "49862ac444a3ca9db560cac29c96b5f2503b4b004a61ac9ac64a558842398143",
    package_git_commit: "9bbd559437aaef77f2830978da7fcc8f59b07e33",
  }),
  notice: Object.freeze({
    source_path: "release/THIRD_PARTY_NOTICES.md",
    asset_name: "THIRD_PARTY_NOTICES.md",
    sha256: "8ce6186eb72090f0d8cf6b1c38f9ac9874e0739886bbf379b389097c84b7b937",
  }),
  license: Object.freeze({
    spdx: "Apache-2.0",
    source_path: "LICENSE",
    asset_name: "Apache-2.0.txt",
    sha256: "f342b45da3700cc2a823c3843b31ce55307824fb5f7e84e1de39bf8e19deb9bf",
  }),
});

const COMMIT_RE = /^[0-9a-f]{40}$/;
const ROOT_KEYS = Object.freeze([
  "schema_version",
  "asset",
  "notice",
  "license",
]);
const ASSET_KEYS = Object.freeze([
  "name",
  "version",
  "platform",
  "arch",
  "size",
  "sha256",
  "package_integrity_sha256",
  "package_git_commit",
]);
const NOTICE_KEYS = Object.freeze(["source_path", "asset_name", "sha256"]);
const LICENSE_KEYS = Object.freeze([
  "spdx",
  "source_path",
  "asset_name",
  "sha256",
]);

export class ReleaseError extends Error {
  constructor(code) {
    super(code);
    this.name = "ReleaseError";
    this.code = code;
  }
}

export function fail(code) {
  throw new ReleaseError(code);
}

export function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertSameIdentity(left, right) {
  if (!sameIdentity(left, right)) {
    fail("release_path_changed");
  }
}

function noFollow(flags) {
  if (!Number.isInteger(fs.constants.O_NOFOLLOW)) {
    fail("release_nofollow_unavailable");
  }
  return flags | fs.constants.O_NOFOLLOW;
}

function openDirectoryIdentity(targetPath, { mode = null, safe = false } = {}) {
  assertAbsolutePath(targetPath);
  const normalizedPath = path.resolve(targetPath);
  let requested;
  try {
    requested = fs.lstatSync(normalizedPath);
  } catch {
    fail("release_path_not_directory");
  }
  if (requested.isSymbolicLink()) {
    fail("release_path_is_symlink");
  }
  if (!requested.isDirectory()) {
    fail("release_path_not_directory");
  }
  let canonicalPath;
  try {
    canonicalPath = fs.realpathSync(normalizedPath);
  } catch {
    fail("release_path_not_directory");
  }
  let before;
  try {
    before = fs.lstatSync(canonicalPath);
  } catch {
    fail("release_path_not_directory");
  }
  if (before.isSymbolicLink()) {
    fail("release_path_is_symlink");
  }
  if (!before.isDirectory()) {
    fail("release_path_not_directory");
  }
  if (safe) {
    assertOwned(before);
    assertNotGroupOrWorldWritable(before);
    if (mode !== null && (before.mode & 0o777) !== mode) {
      fail("release_path_mode_mismatch");
    }
  }

  let fd;
  try {
    fd = fs.openSync(
      canonicalPath,
      noFollow(fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY || 0)),
    );
    const opened = fs.fstatSync(fd);
    assertSameIdentity(requested, opened);
    assertSameIdentity(before, opened);
    if (!opened.isDirectory()) {
      fail("release_path_not_directory");
    }
    if (safe) {
      assertOwned(opened);
      assertNotGroupOrWorldWritable(opened);
      if (mode !== null && (opened.mode & 0o777) !== mode) {
        fail("release_path_mode_mismatch");
      }
    }
    return { canonicalPath, fd, stat: opened };
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    if (error instanceof ReleaseError) throw error;
    fail("release_path_not_directory");
  }
}

function assertDirectoryIdentity(handle) {
  let current;
  try {
    current = fs.lstatSync(handle.canonicalPath);
  } catch {
    fail("release_path_changed");
  }
  assertSameIdentity(handle.stat, current);
  assertSameIdentity(handle.stat, fs.fstatSync(handle.fd));
}

function openVerifiedRegularFile(targetPath) {
  assertAbsolutePath(targetPath);
  let parent;
  let fd;
  try {
    const parentPath = fs.realpathSync(path.dirname(targetPath));
    parent = openDirectoryIdentity(parentPath);
    const canonicalPath = path.join(
      parent.canonicalPath,
      path.basename(targetPath),
    );
    const before = lstatPath(canonicalPath);
    if (before.isSymbolicLink()) {
      fail("release_path_is_symlink");
    }
    if (!before.isFile()) {
      fail("release_path_not_file");
    }
    assertOwned(before);
    assertNotGroupOrWorldWritable(before);
    assertDirectoryIdentity(parent);
    fd = fs.openSync(canonicalPath, noFollow(fs.constants.O_RDONLY));
    const opened = fs.fstatSync(fd);
    assertSameIdentity(before, opened);
    if (!opened.isFile()) {
      fail("release_path_not_file");
    }
    assertOwned(opened);
    assertNotGroupOrWorldWritable(opened);
    assertDirectoryIdentity(parent);
    assertSameIdentity(opened, lstatPath(canonicalPath));
    return { canonicalPath, fd, parent, stat: opened };
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    if (parent) fs.closeSync(parent.fd);
    if (error instanceof ReleaseError) throw error;
    fail("release_path_not_file");
  }
}

function assertVerifiedRegularFile(handle) {
  const after = fs.fstatSync(handle.fd);
  assertSameIdentity(handle.stat, after);
  if (
    handle.stat.size !== after.size ||
    handle.stat.mtimeMs !== after.mtimeMs ||
    handle.stat.ctimeMs !== after.ctimeMs
  ) {
    fail("release_path_changed");
  }
  assertSameIdentity(after, lstatPath(handle.canonicalPath));
  assertDirectoryIdentity(handle.parent);
}

function closeVerifiedRegularFile(handle) {
  try {
    assertVerifiedRegularFile(handle);
  } finally {
    fs.closeSync(handle.fd);
    fs.closeSync(handle.parent.fd);
  }
}

function sha256Descriptor(fd) {
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.alloc(1024 * 1024);
  let position = 0;
  for (;;) {
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest("hex");
}

export const _releaseFs = Object.freeze({
  assertDirectoryIdentity,
  assertVerifiedRegularFile,
  closeVerifiedRegularFile,
  noFollow,
  openDirectoryIdentity,
  openVerifiedRegularFile,
  sameIdentity,
  sha256Descriptor,
});

export function sha256File(filePath) {
  const handle = openVerifiedRegularFile(filePath);
  try {
    return sha256Descriptor(handle.fd);
  } finally {
    closeVerifiedRegularFile(handle);
  }
}

function currentUid() {
  if (typeof process.getuid !== "function") {
    fail("release_path_not_owned");
  }
  return process.getuid();
}

export function assertAbsolutePath(value, code = "release_path_not_absolute") {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !path.isAbsolute(value)
  ) {
    fail(code);
  }
}

function assertOwned(stat) {
  if (stat.uid !== currentUid()) {
    fail("release_path_not_owned");
  }
}

function assertNotGroupOrWorldWritable(stat) {
  if ((stat.mode & 0o022) !== 0) {
    fail("release_path_group_or_world_writable");
  }
}

function lstatPath(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    fail("release_path_not_file");
  }
}

export function assertSafeRegularFile(targetPath) {
  const handle = openVerifiedRegularFile(targetPath);
  const stat = handle.stat;
  closeVerifiedRegularFile(handle);
  return stat;
}

export function assertSafeDirectory(targetPath, { mode = null } = {}) {
  let handle;
  try {
    handle = openDirectoryIdentity(targetPath, { mode, safe: true });
    assertDirectoryIdentity(handle);
    return handle.stat;
  } finally {
    if (handle) fs.closeSync(handle.fd);
  }
}

export function assertCommit(commit) {
  if (typeof commit !== "string" || !COMMIT_RE.test(commit)) {
    fail("runtime_commit_invalid");
  }
}

export function gitHead(runtimeRoot) {
  const root = openDirectoryIdentity(runtimeRoot, { safe: true });
  try {
    const result = spawnSync(
      "git",
      ["--no-replace-objects", "-C", root.canonicalPath, "rev-parse", "HEAD"],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );
    assertDirectoryIdentity(root);
    if (result.status !== 0) {
      fail("runtime_commit_mismatch");
    }
    const head = String(result.stdout || "").trim();
    if (!COMMIT_RE.test(head)) {
      fail("runtime_commit_mismatch");
    }
    return head;
  } finally {
    fs.closeSync(root.fd);
  }
}

export function gitArchiveBytes(runtimeRoot, commit) {
  assertCommit(commit);
  const root = openDirectoryIdentity(runtimeRoot, { safe: true });
  try {
    const result = spawnSync(
      "git",
      [
        "--no-replace-objects",
        "-C",
        root.canonicalPath,
        "archive",
        "--format=tar",
        commit,
      ],
      {
        encoding: "buffer",
        maxBuffer: 512 * 1024 * 1024,
      },
    );
    assertDirectoryIdentity(root);
    if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
      fail("release_git_archive_failed");
    }
    return result.stdout;
  } finally {
    fs.closeSync(root.fd);
  }
}

function exactKeys(value, keys) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

export function assertClosedManifestShape(manifest) {
  if (!exactKeys(manifest, ROOT_KEYS)) {
    fail("release_manifest_shape_invalid");
  }
  if (manifest.schema_version !== CLOSED_MANIFEST.schema_version) {
    fail("release_manifest_shape_invalid");
  }
  if (!exactKeys(manifest.asset, ASSET_KEYS)) {
    fail("release_manifest_shape_invalid");
  }
  if (!exactKeys(manifest.notice, NOTICE_KEYS)) {
    fail("release_manifest_shape_invalid");
  }
  if (!exactKeys(manifest.license, LICENSE_KEYS)) {
    fail("release_manifest_shape_invalid");
  }
  if (manifest.asset.platform !== CLOSED_MANIFEST.asset.platform) {
    fail("release_platform_mismatch");
  }
  if (manifest.asset.arch !== CLOSED_MANIFEST.asset.arch) {
    fail("release_arch_mismatch");
  }
  if (manifest.asset.version !== CLOSED_MANIFEST.asset.version) {
    fail("release_version_mismatch");
  }
  if (
    manifest.asset.name !== CLOSED_MANIFEST.asset.name ||
    manifest.asset.size !== CLOSED_MANIFEST.asset.size ||
    manifest.asset.sha256 !== CLOSED_MANIFEST.asset.sha256 ||
    manifest.asset.package_integrity_sha256 !==
      CLOSED_MANIFEST.asset.package_integrity_sha256 ||
    manifest.asset.package_git_commit !==
      CLOSED_MANIFEST.asset.package_git_commit ||
    manifest.notice.source_path !== CLOSED_MANIFEST.notice.source_path ||
    manifest.notice.asset_name !== CLOSED_MANIFEST.notice.asset_name ||
    manifest.notice.sha256 !== CLOSED_MANIFEST.notice.sha256 ||
    manifest.license.spdx !== CLOSED_MANIFEST.license.spdx ||
    manifest.license.source_path !== CLOSED_MANIFEST.license.source_path ||
    manifest.license.asset_name !== CLOSED_MANIFEST.license.asset_name ||
    manifest.license.sha256 !== CLOSED_MANIFEST.license.sha256
  ) {
    fail("release_manifest_shape_invalid");
  }
  return CLOSED_MANIFEST;
}

export function loadManifest(manifestPath) {
  let parsed;
  const handle = openVerifiedRegularFile(manifestPath);
  try {
    parsed = JSON.parse(fs.readFileSync(handle.fd, "utf8"));
  } catch {
    fail("release_manifest_shape_invalid");
  } finally {
    closeVerifiedRegularFile(handle);
  }
  return assertClosedManifestShape(parsed);
}

export function resolveRepoRootFromManifest(manifestPath) {
  assertAbsolutePath(manifestPath);
  const manifestDir = path.dirname(path.resolve(manifestPath));
  return path.dirname(manifestDir);
}

export function projectReleaseReceipt(commit, runtimeArchiveSha256) {
  assertCommit(commit);
  if (
    typeof runtimeArchiveSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(runtimeArchiveSha256)
  ) {
    fail("release_manifest_shape_invalid");
  }
  return Object.freeze({
    commit,
    runtime_archive_sha256: runtimeArchiveSha256,
    asset_sha256: CLOSED_MANIFEST.asset.sha256,
    asset_size: CLOSED_MANIFEST.asset.size,
    asset_name: CLOSED_MANIFEST.asset.name,
    license_sha256: CLOSED_MANIFEST.license.sha256,
    notice_sha256: CLOSED_MANIFEST.notice.sha256,
  });
}

export function _verifyExactFile({
  filePath,
  size = null,
  sha256,
  sizeMismatchCode,
  digestMismatchCode,
}) {
  const handle = openVerifiedRegularFile(filePath);
  try {
    if (size !== null && handle.stat.size !== size) {
      fail(sizeMismatchCode);
    }
    const digest = sha256Descriptor(handle.fd);
    if (digest !== sha256) {
      fail(digestMismatchCode);
    }
    return Object.freeze({ size: handle.stat.size, sha256: digest });
  } finally {
    closeVerifiedRegularFile(handle);
  }
}

function assertFileDigest(filePath, expectedSha256, mismatchCode) {
  return _verifyExactFile({
    filePath,
    sha256: expectedSha256,
    sizeMismatchCode: mismatchCode,
    digestMismatchCode: mismatchCode,
  });
}

function assertAssetMatchesManifest(assetPath) {
  return _verifyExactFile({
    filePath: assetPath,
    size: CLOSED_MANIFEST.asset.size,
    sha256: CLOSED_MANIFEST.asset.sha256,
    sizeMismatchCode: "release_asset_size_mismatch",
    digestMismatchCode: "release_asset_digest_mismatch",
  });
}

export async function verifyManifestOnly({ manifestPath } = {}) {
  const manifest = loadManifest(manifestPath);
  const repoRoot = resolveRepoRootFromManifest(manifestPath);
  const licensePath = path.resolve(repoRoot, manifest.license.source_path);
  const noticePath = path.resolve(repoRoot, manifest.notice.source_path);
  assertFileDigest(
    licensePath,
    manifest.license.sha256,
    "release_license_digest_mismatch",
  );
  assertFileDigest(
    noticePath,
    manifest.notice.sha256,
    "release_notice_digest_mismatch",
  );
  return Object.freeze({
    schema_version: manifest.schema_version,
    asset_name: manifest.asset.name,
    asset_sha256: manifest.asset.sha256,
    asset_size: manifest.asset.size,
    license_sha256: manifest.license.sha256,
    notice_sha256: manifest.notice.sha256,
  });
}

export async function verifyRelease(options = {}) {
  if (options.manifestOnly) {
    return verifyManifestOnly(options);
  }

  const {
    runtimeRoot,
    commit,
    assetPath,
    licensePath,
    noticePath,
    manifestPath,
  } = options;

  assertCommit(commit);
  loadManifest(manifestPath);
  const runtime = openDirectoryIdentity(runtimeRoot, { safe: true });
  try {
    const head = gitHead(runtime.canonicalPath);
    assertDirectoryIdentity(runtime);
    if (head !== commit) {
      fail("runtime_commit_mismatch");
    }

    assertAssetMatchesManifest(assetPath);
    assertFileDigest(
      licensePath,
      CLOSED_MANIFEST.license.sha256,
      "release_license_digest_mismatch",
    );
    assertFileDigest(
      noticePath,
      CLOSED_MANIFEST.notice.sha256,
      "release_notice_digest_mismatch",
    );

    assertDirectoryIdentity(runtime);
    const archive = gitArchiveBytes(runtime.canonicalPath, commit);
    assertDirectoryIdentity(runtime);
    return projectReleaseReceipt(commit, sha256Buffer(archive));
  } finally {
    fs.closeSync(runtime.fd);
  }
}

function readFlagValue(argv, index) {
  if (index + 1 >= argv.length || String(argv[index + 1]).startsWith("--")) {
    fail("release_args_invalid");
  }
  return argv[index + 1];
}

export function parseVerifyArgs(argv) {
  const args = {
    manifestOnly: false,
  };
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (seen.has(arg)) {
      fail("release_args_invalid");
    }
    seen.add(arg);
    if (arg === "--manifest-only") {
      args.manifestOnly = true;
    } else if (arg === "--manifest") {
      args.manifestPath = readFlagValue(argv, i);
      i += 1;
    } else if (arg === "--runtime-root") {
      args.runtimeRoot = readFlagValue(argv, i);
      i += 1;
    } else if (arg === "--commit") {
      args.commit = readFlagValue(argv, i);
      i += 1;
    } else if (arg === "--asset") {
      args.assetPath = readFlagValue(argv, i);
      i += 1;
    } else if (arg === "--license") {
      args.licensePath = readFlagValue(argv, i);
      i += 1;
    } else if (arg === "--notice") {
      args.noticePath = readFlagValue(argv, i);
      i += 1;
    } else {
      fail("release_args_invalid");
    }
  }
  if (!args.manifestPath) {
    fail("release_args_invalid");
  }
  if (args.manifestOnly) {
    if (seen.size !== 2 || !seen.has("--manifest")) {
      fail("release_args_invalid");
    }
    // The tracked package script intentionally supplies this one path relative
    // to the repository cwd. Full release verification remains absolute-only.
    args.manifestPath = path.resolve(args.manifestPath);
    return args;
  }
  for (const key of [
    "runtimeRoot",
    "commit",
    "assetPath",
    "licensePath",
    "noticePath",
  ]) {
    if (!args[key]) {
      fail("release_args_invalid");
    }
  }
  for (const key of [
    "runtimeRoot",
    "assetPath",
    "licensePath",
    "noticePath",
    "manifestPath",
  ]) {
    assertAbsolutePath(args[key]);
  }
  return args;
}

async function main(argv) {
  const args = parseVerifyArgs(argv);
  const receipt = await verifyRelease(args);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && modulePath === invokedPath) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error && error.code ? error.code : "release_args_invalid";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  _releaseFs,
  CLOSED_MANIFEST,
  assertAbsolutePath,
  assertCommit,
  fail,
  gitHead,
} from "./verify-release.mjs";

const {
  assertDirectoryIdentity: assertDirectoryStable,
  assertVerifiedRegularFile: assertSourceStable,
  closeVerifiedRegularFile: closeSource,
  noFollow,
  openDirectoryIdentity: openDirectory,
  openVerifiedRegularFile: openSource,
  sameIdentity,
  sha256Descriptor,
} = _releaseFs;

function assertSameIdentity(left, right) {
  if (!sameIdentity(left, right)) fail("release_path_changed");
}

function assertOwnedSafeFile(stat) {
  if (!stat.isFile()) fail("release_path_not_file");
  if (typeof process.getuid !== "function" || stat.uid !== process.getuid()) {
    fail("release_path_not_owned");
  }
  if ((stat.mode & 0o022) !== 0) {
    fail("release_path_group_or_world_writable");
  }
}

function validateFileSpec(file) {
  if (
    !file ||
    typeof file !== "object" ||
    path.basename(file.assetName || "") !== file.assetName ||
    file.assetName === "." ||
    file.assetName === ".." ||
    ![0o500, 0o600].includes(file.mode) ||
    !(
      file.size === null ||
      (Number.isSafeInteger(file.size) && file.size >= 0)
    ) ||
    !/^[0-9a-f]{64}$/.test(file.sha256 || "") ||
    typeof file.sizeMismatchCode !== "string" ||
    typeof file.digestMismatchCode !== "string"
  ) {
    fail("release_args_invalid");
  }
}

function verifySourceSpec(file, handle) {
  if (file.size !== null && handle.stat.size !== file.size) {
    fail(file.sizeMismatchCode);
  }
  if (sha256Descriptor(handle.fd) !== file.sha256) {
    fail(file.digestMismatchCode);
  }
  assertSourceStable(handle);
}

function unlinkCreated(outDir, created) {
  try {
    assertDirectoryStable(outDir);
    const current = fs.lstatSync(created.path);
    if (!sameIdentity(current, created.stat)) return;
    fs.unlinkSync(created.path);
  } catch {
    // Never unlink a path whose identity cannot be proved to be ours.
  }
}

function copyExclusive(outDir, source, file) {
  assertDirectoryStable(outDir);
  const destinationPath = path.join(outDir.canonicalPath, file.assetName);

  let destinationFd;
  try {
    destinationFd = fs.openSync(
      destinationPath,
      noFollow(
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR,
      ),
      file.mode,
    );
  } catch (error) {
    if (error && (error.code === "EEXIST" || error.code === "EISDIR")) {
      fail("release_overwrite_rejected");
    }
    fail("release_overwrite_rejected");
  }

  let destinationStat;
  try {
    destinationStat = fs.fstatSync(destinationFd);
    assertOwnedSafeFile(destinationStat);
    assertDirectoryStable(outDir);
    assertSameIdentity(destinationStat, fs.lstatSync(destinationPath));
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    for (;;) {
      const bytesRead = fs.readSync(
        source.fd,
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) {
        break;
      }
      let written = 0;
      while (written < bytesRead) {
        const count = fs.writeSync(
          destinationFd,
          buffer,
          written,
          bytesRead - written,
          position + written,
        );
        if (!Number.isInteger(count) || count <= 0) {
          fail("release_partial_write");
        }
        written += count;
      }
      position += bytesRead;
    }
    fs.fchmodSync(destinationFd, file.mode);
    fs.fsyncSync(destinationFd);
    const published = fs.fstatSync(destinationFd);
    assertSameIdentity(destinationStat, published);
    if (published.size !== source.stat.size) fail(file.sizeMismatchCode);
    if ((published.mode & 0o777) !== file.mode) {
      fail("release_path_mode_mismatch");
    }
    if (sha256Descriptor(destinationFd) !== file.sha256) {
      fail(file.digestMismatchCode);
    }
    assertSourceStable(source);
    assertDirectoryStable(outDir);
    assertSameIdentity(published, fs.lstatSync(destinationPath));
    fs.closeSync(destinationFd);
    destinationFd = undefined;
    return { path: destinationPath, stat: published };
  } catch (error) {
    if (destinationFd !== undefined) {
      try {
        fs.ftruncateSync(destinationFd, 0);
        fs.fsyncSync(destinationFd);
      } catch {
        // The path is untrusted below unless its identity still matches.
      }
      try {
        destinationStat ||= fs.fstatSync(destinationFd);
      } catch {
        // Leave undefined; cleanup will not unlink without identity.
      }
      try {
        fs.closeSync(destinationFd);
      } catch {
        // Preserve the original publication failure.
      }
    }
    if (destinationStat) {
      unlinkCreated(outDir, { path: destinationPath, stat: destinationStat });
    }
    throw error;
  }
}

export function _publishReleaseFiles({
  outDir,
  files,
  requireEmpty = true,
} = {}) {
  if (!Array.isArray(files) || files.length === 0) fail("release_args_invalid");
  const names = new Set();
  for (const file of files) {
    validateFileSpec(file);
    if (names.has(file.assetName)) fail("release_args_invalid");
    names.add(file.assetName);
  }

  const directory = openDirectory(outDir, { mode: 0o700, safe: true });
  const sources = [];
  const created = [];
  let failure;
  try {
    assertDirectoryStable(directory);
    if (requireEmpty && fs.readdirSync(directory.canonicalPath).length !== 0) {
      fail("release_out_dir_not_empty");
    }
    assertDirectoryStable(directory);
    for (const file of files) {
      const source = openSource(file.sourcePath);
      sources.push(source);
      verifySourceSpec(file, source);
    }
    for (let index = 0; index < files.length; index += 1) {
      created.push(copyExclusive(directory, sources[index], files[index]));
    }
    for (const source of sources) assertSourceStable(source);
    assertDirectoryStable(directory);
    const entries = fs.readdirSync(directory.canonicalPath).sort();
    const expectedEntries = [...names].sort();
    if (
      entries.length !== expectedEntries.length ||
      entries.some((entry, index) => entry !== expectedEntries[index])
    ) {
      fail("release_out_dir_not_empty");
    }
    fs.fsyncSync(directory.fd);
    return Object.freeze(
      created.map(({ path: publishedPath }, index) =>
        Object.freeze({
          assetName: files[index].assetName,
          path: publishedPath,
          mode: files[index].mode,
        }),
      ),
    );
  } catch (error) {
    failure = error;
    for (const item of created.reverse()) unlinkCreated(directory, item);
    try {
      assertDirectoryStable(directory);
      fs.fsyncSync(directory.fd);
    } catch {
      // Preserve the first failure code.
    }
    throw error;
  } finally {
    let closeError;
    for (const source of sources) {
      try {
        closeSource(source);
      } catch (error) {
        closeError ||= error;
      }
    }
    if (!failure && closeError) {
      for (const item of created.reverse()) unlinkCreated(directory, item);
      try {
        fs.fsyncSync(directory.fd);
      } catch {
        // Cleanup already made the trusted paths absent where identities match.
      }
    }
    fs.closeSync(directory.fd);
    if (!failure && closeError) throw closeError;
  }
}

export async function buildRelease({
  runtimeRoot,
  commit,
  grokBinary,
  outDir,
} = {}) {
  assertCommit(commit);
  const runtime = openDirectory(runtimeRoot, { safe: true });
  let resolvedOutDir;
  let licenseSource;
  let noticeSource;
  try {
    const head = gitHead(runtime.canonicalPath);
    assertDirectoryStable(runtime);
    if (head !== commit) {
      fail("runtime_commit_mismatch");
    }

    assertAbsolutePath(outDir);
    licenseSource = path.resolve(
      runtime.canonicalPath,
      CLOSED_MANIFEST.license.source_path,
    );
    noticeSource = path.resolve(
      runtime.canonicalPath,
      CLOSED_MANIFEST.notice.source_path,
    );

    const published = _publishReleaseFiles({
      outDir,
      files: [
        {
          sourcePath: grokBinary,
          assetName: CLOSED_MANIFEST.asset.name,
          mode: 0o500,
          size: CLOSED_MANIFEST.asset.size,
          sha256: CLOSED_MANIFEST.asset.sha256,
          sizeMismatchCode: "release_asset_size_mismatch",
          digestMismatchCode: "release_asset_digest_mismatch",
        },
        {
          sourcePath: licenseSource,
          assetName: CLOSED_MANIFEST.license.asset_name,
          mode: 0o600,
          size: null,
          sha256: CLOSED_MANIFEST.license.sha256,
          sizeMismatchCode: "release_license_digest_mismatch",
          digestMismatchCode: "release_license_digest_mismatch",
        },
        {
          sourcePath: noticeSource,
          assetName: CLOSED_MANIFEST.notice.asset_name,
          mode: 0o600,
          size: null,
          sha256: CLOSED_MANIFEST.notice.sha256,
          sizeMismatchCode: "release_notice_digest_mismatch",
          digestMismatchCode: "release_notice_digest_mismatch",
        },
      ],
    });
    resolvedOutDir = path.dirname(published[0].path);
  } finally {
    fs.closeSync(runtime.fd);
  }
  const assetPath = path.join(resolvedOutDir, CLOSED_MANIFEST.asset.name);
  const licensePath = path.join(
    resolvedOutDir,
    CLOSED_MANIFEST.license.asset_name,
  );
  const noticePath = path.join(
    resolvedOutDir,
    CLOSED_MANIFEST.notice.asset_name,
  );

  return Object.freeze({
    commit,
    outDir: resolvedOutDir,
    assetPath,
    licensePath,
    noticePath,
    asset_name: CLOSED_MANIFEST.asset.name,
    asset_sha256: CLOSED_MANIFEST.asset.sha256,
    asset_size: CLOSED_MANIFEST.asset.size,
    license_sha256: CLOSED_MANIFEST.license.sha256,
    notice_sha256: CLOSED_MANIFEST.notice.sha256,
  });
}

function readFlagValue(argv, index) {
  if (index + 1 >= argv.length || String(argv[index + 1]).startsWith("--")) {
    fail("release_args_invalid");
  }
  return argv[index + 1];
}

export function parseBuildArgs(argv) {
  const args = {};
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (seen.has(arg)) fail("release_args_invalid");
    seen.add(arg);
    if (arg === "--runtime-root") {
      args.runtimeRoot = readFlagValue(argv, i);
      i += 1;
    } else if (arg === "--commit") {
      args.commit = readFlagValue(argv, i);
      i += 1;
    } else if (arg === "--grok-bin") {
      args.grokBinary = readFlagValue(argv, i);
      i += 1;
    } else if (arg === "--out-dir") {
      args.outDir = readFlagValue(argv, i);
      i += 1;
    } else {
      fail("release_args_invalid");
    }
  }
  for (const key of ["runtimeRoot", "commit", "grokBinary", "outDir"]) {
    if (!args[key]) {
      fail("release_args_invalid");
    }
  }
  for (const key of ["runtimeRoot", "grokBinary", "outDir"]) {
    assertAbsolutePath(args[key]);
  }
  return args;
}

async function main(argv) {
  const args = parseBuildArgs(argv);
  const result = await buildRelease(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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

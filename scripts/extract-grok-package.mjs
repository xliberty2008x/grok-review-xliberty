#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  _releaseFs,
  CLOSED_MANIFEST,
  assertAbsolutePath,
  fail,
} from "./verify-release.mjs";

const TAR_BIN = "/usr/bin/tar";
const TAR_REAL_BIN = "/usr/bin/bsdtar";
const MAX_COMPRESSED_MEMBER_BYTES = 64 * 1024 * 1024;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertExpectedFile(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isSafeInteger(value.size) ||
    value.size <= 0 ||
    !/^[0-9a-f]{64}$/.test(value.sha256 || "")
  ) {
    fail("release_args_invalid");
  }
}

function assertMemberPath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.startsWith("-") ||
    value
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    fail("release_args_invalid");
  }
}

function readVerifiedPackage(packageTarball, expectedPackage) {
  const handle = _releaseFs.openVerifiedRegularFile(packageTarball);
  try {
    if (handle.stat.size !== expectedPackage.size) {
      fail("release_package_size_mismatch");
    }
    if (_releaseFs.sha256Descriptor(handle.fd) !== expectedPackage.sha256) {
      fail("release_package_digest_mismatch");
    }
    const bytes = fs.readFileSync(handle.fd);
    _releaseFs.assertVerifiedRegularFile(handle);
    return bytes;
  } finally {
    _releaseFs.closeVerifiedRegularFile(handle);
  }
}

function extractCompressedMember(packageBytes, memberPath, tarBin) {
  if (tarBin !== TAR_BIN) {
    fail("release_tar_invalid");
  }
  let tarLink;
  let canonicalTar;
  let tarStat;
  try {
    tarLink = fs.lstatSync(tarBin);
    canonicalTar = fs.realpathSync.native(tarBin);
    tarStat = fs.lstatSync(canonicalTar);
  } catch {
    fail("release_tar_invalid");
  }
  if (
    !tarLink.isSymbolicLink() ||
    fs.readlinkSync(tarBin) !== "bsdtar" ||
    canonicalTar !== TAR_REAL_BIN ||
    !tarStat.isFile() ||
    tarStat.uid !== 0 ||
    (tarStat.mode & 0o022) !== 0
  ) {
    fail("release_tar_invalid");
  }

  const result = spawnSync(canonicalTar, ["-xOf", "-", "--", memberPath], {
    input: packageBytes,
    encoding: "buffer",
    env: {
      HOME: "/var/empty",
      LANG: "C",
      PATH: "/usr/bin:/bin",
    },
    maxBuffer: MAX_COMPRESSED_MEMBER_BYTES,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail("release_package_extract_failed");
  }
  return result.stdout;
}

function publishExclusive(outFile, assetBytes, expectedAsset) {
  assertAbsolutePath(outFile);
  const resolvedOutFile = path.resolve(outFile);
  const parent = _releaseFs.openDirectoryIdentity(
    path.dirname(resolvedOutFile),
    {
      mode: 0o700,
      safe: true,
    },
  );
  let fd;
  let createdStat;
  try {
    const canonicalOutFile = path.join(
      parent.canonicalPath,
      path.basename(resolvedOutFile),
    );
    _releaseFs.assertDirectoryIdentity(parent);
    try {
      fd = fs.openSync(
        canonicalOutFile,
        _releaseFs.noFollow(
          fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR,
        ),
        0o500,
      );
    } catch {
      fail("release_overwrite_rejected");
    }
    createdStat = fs.fstatSync(fd);
    if (
      !createdStat.isFile() ||
      createdStat.uid !== process.getuid() ||
      (createdStat.mode & 0o022) !== 0
    ) {
      fail("release_path_not_owned");
    }
    if (!_releaseFs.sameIdentity(createdStat, fs.lstatSync(canonicalOutFile))) {
      fail("release_path_changed");
    }

    let position = 0;
    while (position < assetBytes.length) {
      const count = fs.writeSync(
        fd,
        assetBytes,
        position,
        assetBytes.length - position,
        position,
      );
      if (!Number.isInteger(count) || count <= 0) {
        fail("release_partial_write");
      }
      position += count;
    }
    fs.fchmodSync(fd, 0o500);
    fs.fsyncSync(fd);

    const published = fs.fstatSync(fd);
    if (
      !_releaseFs.sameIdentity(createdStat, published) ||
      !_releaseFs.sameIdentity(published, fs.lstatSync(canonicalOutFile))
    ) {
      fail("release_path_changed");
    }
    if (published.size !== expectedAsset.size) {
      fail("release_asset_size_mismatch");
    }
    if (_releaseFs.sha256Descriptor(fd) !== expectedAsset.sha256) {
      fail("release_asset_digest_mismatch");
    }
    if ((published.mode & 0o777) !== 0o500) {
      fail("release_path_mode_mismatch");
    }
    _releaseFs.assertDirectoryIdentity(parent);
    fs.closeSync(fd);
    fd = undefined;
    return Object.freeze({ outFile: canonicalOutFile });
  } catch (error) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Preserve the original extraction failure.
      }
      fd = undefined;
    }
    if (createdStat) {
      try {
        const current = fs.lstatSync(
          path.join(parent.canonicalPath, path.basename(resolvedOutFile)),
        );
        if (_releaseFs.sameIdentity(createdStat, current)) {
          fs.unlinkSync(
            path.join(parent.canonicalPath, path.basename(resolvedOutFile)),
          );
        }
      } catch {
        // Never remove a path whose identity is no longer proven.
      }
    }
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.closeSync(parent.fd);
  }
}

export function _extractVerifiedPackage({
  packageTarball,
  outFile,
  memberPath,
  noticeMemberPath,
  expectedPackage,
  expectedAsset,
  expectedNotice,
  tarBin = TAR_BIN,
} = {}) {
  assertAbsolutePath(packageTarball);
  assertAbsolutePath(outFile);
  assertMemberPath(memberPath);
  assertMemberPath(noticeMemberPath);
  assertExpectedFile(expectedPackage);
  assertExpectedFile(expectedAsset);
  assertExpectedFile(expectedNotice);

  const packageBytes = readVerifiedPackage(packageTarball, expectedPackage);
  const compressed = extractCompressedMember(packageBytes, memberPath, tarBin);
  const noticeBytes = extractCompressedMember(
    packageBytes,
    noticeMemberPath,
    tarBin,
  );
  if (noticeBytes.length !== expectedNotice.size) {
    fail("release_notice_size_mismatch");
  }
  if (sha256(noticeBytes) !== expectedNotice.sha256) {
    fail("release_notice_digest_mismatch");
  }
  let assetBytes;
  try {
    assetBytes = zlib.brotliDecompressSync(compressed, {
      maxOutputLength: expectedAsset.size,
    });
  } catch {
    fail("release_package_extract_failed");
  }
  if (assetBytes.length !== expectedAsset.size) {
    fail("release_asset_size_mismatch");
  }
  if (sha256(assetBytes) !== expectedAsset.sha256) {
    fail("release_asset_digest_mismatch");
  }
  return publishExclusive(outFile, assetBytes, expectedAsset);
}

export function parseExtractArgs(argv) {
  const args = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (seen.has(flag) || !["--package-tarball", "--out"].includes(flag)) {
      fail("release_args_invalid");
    }
    seen.add(flag);
    const value = argv[index + 1];
    if (!value || String(value).startsWith("--")) {
      fail("release_args_invalid");
    }
    if (flag === "--package-tarball") args.packageTarball = value;
    else args.outFile = value;
    index += 1;
  }
  if (!args.packageTarball || !args.outFile) {
    fail("release_args_invalid");
  }
  assertAbsolutePath(args.packageTarball);
  assertAbsolutePath(args.outFile);
  return args;
}

function main() {
  try {
    const args = parseExtractArgs(process.argv.slice(2));
    const result = _extractVerifiedPackage({
      ...args,
      memberPath: CLOSED_MANIFEST.asset.platform_package_member,
      noticeMemberPath: CLOSED_MANIFEST.asset.platform_package_notice_member,
      expectedPackage: {
        size: CLOSED_MANIFEST.asset.platform_package_tarball_size,
        sha256: CLOSED_MANIFEST.asset.platform_package_tarball_sha256,
      },
      expectedAsset: {
        size: CLOSED_MANIFEST.asset.size,
        sha256: CLOSED_MANIFEST.asset.sha256,
      },
      expectedNotice: {
        size: CLOSED_MANIFEST.asset.platform_package_notice_size,
        sha256: CLOSED_MANIFEST.notice.sha256,
      },
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code || "release_extract_failed"}\n`);
    process.exitCode = 1;
  }
}

let invokedPath = "";
try {
  invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
} catch {
  invokedPath = "";
}
if (invokedPath === fs.realpathSync(fileURLToPath(import.meta.url))) main();

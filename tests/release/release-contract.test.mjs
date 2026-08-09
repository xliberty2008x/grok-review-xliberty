import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  _publishReleaseFiles,
  buildRelease,
  parseBuildArgs,
} from "../../scripts/build-release.mjs";
import {
  _releaseFs,
  _verifyExactFile,
  CLOSED_MANIFEST,
  gitArchiveBytes,
  loadManifest,
  parseVerifyArgs,
  projectReleaseReceipt,
  sha256Buffer,
  verifyManifestOnly,
  verifyRelease,
} from "../../scripts/verify-release.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MANIFEST_PATH = path.join(ROOT, "release", "grok-runtime-v1.json");
const NOTICE_PATH = path.join(ROOT, "release", "THIRD_PARTY_NOTICES.md");
const LICENSE_PATH = path.join(ROOT, "LICENSE");
const BUILD_SOURCE = path.join(ROOT, "scripts", "build-release.mjs");
const EXTRACT_SOURCE = path.join(ROOT, "scripts", "extract-grok-package.mjs");
const VERIFY_SOURCE = path.join(ROOT, "scripts", "verify-release.mjs");

const EXPECTED_ASSET_SHA256 =
  "5cf05fe670b1818561daf7566b580a5de6b81149166499d61072e49640b541a4";
const EXPECTED_NOTICE_SHA256 =
  "e8785a6098a7ee780cd2db35745b8e53061cfb1b6da19147a308579466ea4e50";
const EXPECTED_LICENSE_SHA256 =
  "f342b45da3700cc2a823c3843b31ce55307824fb5f7e84e1de39bf8e19deb9bf";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function gitHead(runtimeRoot = ROOT) {
  const result = spawnSync("git", ["-C", runtimeRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, "git rev-parse HEAD must succeed");
  return result.stdout.trim();
}

function privateTempDir(t, prefix = "grok-release-") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function emptyOwnedOutDir(t) {
  const directory = privateTempDir(t, "grok-release-out-");
  fs.chmodSync(directory, 0o700);
  return directory;
}

function writeSyntheticAsset(filePath, { size = 64, contents = null } = {}) {
  if (contents !== null) {
    fs.writeFileSync(filePath, contents, { mode: 0o600 });
    fs.chmodSync(filePath, 0o600);
    return filePath;
  }
  const fd = fs.openSync(
    filePath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    0o600,
  );
  try {
    fs.ftruncateSync(fd, size);
    fs.fchmodSync(fd, 0o600);
  } finally {
    fs.closeSync(fd);
  }
  return filePath;
}

function validVerifyArgs(t, overrides = {}) {
  const staging = privateTempDir(t, "grok-release-verify-");
  const defaultAsset = writeSyntheticAsset(
    path.join(staging, "wrong-asset.bin"),
    {
      contents: Buffer.from("not-the-pinned-grok-binary\n"),
    },
  );
  return {
    runtimeRoot: ROOT,
    commit: gitHead(ROOT),
    assetPath: defaultAsset,
    licensePath: LICENSE_PATH,
    noticePath: NOTICE_PATH,
    manifestPath: MANIFEST_PATH,
    ...overrides,
  };
}

test("closed manifest records the pinned darwin-arm64 runtime asset", () => {
  const manifest = loadManifest(MANIFEST_PATH);
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.asset.name, "grok-0.2.112-darwin-arm64");
  assert.equal(manifest.asset.version, "0.2.112");
  assert.equal(manifest.asset.platform, "darwin");
  assert.equal(manifest.asset.arch, "arm64");
  assert.equal(manifest.asset.size, 129363664);
  assert.equal(manifest.asset.sha256, EXPECTED_ASSET_SHA256);
  assert.equal(
    manifest.asset.package_integrity_sha256,
    "49862ac444a3ca9db560cac29c96b5f2503b4b004a61ac9ac64a558842398143",
  );
  assert.equal(
    manifest.asset.package_git_commit,
    "9bbd559437aaef77f2830978da7fcc8f59b07e33",
  );
  assert.equal(
    manifest.asset.platform_package_name,
    "@xai-official/grok-darwin-arm64",
  );
  assert.equal(manifest.asset.platform_package_tarball_size, 37094207);
  assert.equal(
    manifest.asset.platform_package_tarball_sha256,
    "36f4aedb29affafaca63bb47be8cf3f918fc2350ff6920d43b5e473ab22b327f",
  );
  assert.equal(
    manifest.asset.platform_package_integrity_sha256,
    "633371990f1ed70635bfd160ba56545b344d9d3c4dfa74c9afebe4513dba3086",
  );
  assert.equal(manifest.asset.platform_package_member, "package/bin/grok.br");
  assert.equal(
    manifest.asset.platform_package_notice_member,
    "package/THIRD_PARTY_NOTICES.md",
  );
  assert.equal(manifest.asset.platform_package_notice_size, 7995);
  assert.equal(manifest.notice.sha256, EXPECTED_NOTICE_SHA256);
  assert.equal(manifest.license.sha256, EXPECTED_LICENSE_SHA256);
  assert.equal(manifest.license.spdx, "Apache-2.0");
  assert.deepEqual(manifest, CLOSED_MANIFEST);
});

test("script-disabled package extraction verifies bytes without running lifecycle code", async (t) => {
  let extractVerifiedPackage = null;
  try {
    ({ _extractVerifiedPackage: extractVerifiedPackage } = await import(
      pathToFileURL(EXTRACT_SOURCE).href
    ));
  } catch {
    // RED until the bounded extractor exists.
  }
  assert.equal(
    typeof extractVerifiedPackage,
    "function",
    "the verified package extractor must exist",
  );

  const staging = privateTempDir(t, "grok-package-extract-");
  const sourceRoot = path.join(staging, "source");
  const packageBin = path.join(sourceRoot, "package", "bin");
  fs.mkdirSync(packageBin, { recursive: true, mode: 0o700 });
  const assetBytes = Buffer.from("verified-grok-fixture\n");
  fs.writeFileSync(
    path.join(packageBin, "grok.br"),
    zlib.brotliCompressSync(assetBytes),
    { mode: 0o600 },
  );
  const lifecycleCanary = path.join(staging, "lifecycle-ran");
  fs.writeFileSync(
    path.join(packageBin, "postinstall.js"),
    `require("node:fs").writeFileSync(${JSON.stringify(lifecycleCanary)}, "bad");\n`,
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(sourceRoot, "package", "package.json"),
    `${JSON.stringify({ scripts: { postinstall: "node bin/postinstall.js" } })}\n`,
    { mode: 0o600 },
  );
  const noticeBytes = Buffer.from("verified upstream notices\n");
  fs.writeFileSync(
    path.join(sourceRoot, "package", "THIRD_PARTY_NOTICES.md"),
    noticeBytes,
    { mode: 0o600 },
  );

  const packageTarball = path.join(staging, "package.tgz");
  const packed = spawnSync(
    "/usr/bin/tar",
    ["-czf", packageTarball, "-C", sourceRoot, "package"],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  assert.equal(packed.status, 0, packed.stderr);
  fs.chmodSync(packageTarball, 0o600);

  const outDir = emptyOwnedOutDir(t);
  const outFile = path.join(outDir, "verified-grok");
  const packageBytes = fs.readFileSync(packageTarball);
  const extractArgs = {
    packageTarball,
    outFile,
    memberPath: "package/bin/grok.br",
    noticeMemberPath: "package/THIRD_PARTY_NOTICES.md",
    expectedPackage: {
      size: packageBytes.length,
      sha256: sha256(packageBytes),
    },
    expectedAsset: {
      size: assetBytes.length,
      sha256: sha256(assetBytes),
    },
    expectedNotice: {
      size: noticeBytes.length,
      sha256: sha256(noticeBytes),
    },
    tarBin: "/usr/bin/tar",
  };
  assert.throws(
    () =>
      extractVerifiedPackage({
        ...extractArgs,
        memberPath: "--version",
      }),
    /release_args_invalid/,
  );
  assert.equal(fs.existsSync(outFile), false);
  assert.throws(
    () =>
      extractVerifiedPackage({
        ...extractArgs,
        expectedNotice: {
          ...extractArgs.expectedNotice,
          sha256: "0".repeat(64),
        },
      }),
    /release_notice_digest_mismatch/,
  );
  assert.equal(fs.existsSync(outFile), false);
  const result = extractVerifiedPackage({
    ...extractArgs,
  });

  assert.equal(
    result.outFile,
    path.join(fs.realpathSync(outDir), path.basename(outFile)),
  );
  assert.deepEqual(fs.readFileSync(outFile), assetBytes);
  assert.equal(fs.statSync(outFile).mode & 0o777, 0o500);
  assert.equal(fs.existsSync(lifecycleCanary), false);
});

test("source-only verification accepts only the closed notice and license bytes", async (t) => {
  const receipt = await verifyManifestOnly({ manifestPath: MANIFEST_PATH });
  assert.equal(receipt.schema_version, 1);
  assert.equal(receipt.license_sha256, EXPECTED_LICENSE_SHA256);
  assert.equal(receipt.notice_sha256, EXPECTED_NOTICE_SHA256);
  assert.equal(receipt.asset_sha256, EXPECTED_ASSET_SHA256);
  assert.equal(receipt.asset_size, 129363664);
  assert.equal(sha256File(NOTICE_PATH), EXPECTED_NOTICE_SHA256);
  assert.equal(sha256File(LICENSE_PATH), EXPECTED_LICENSE_SHA256);

  const tamperedDir = privateTempDir(t);
  const tamperedManifest = path.join(tamperedDir, "grok-runtime-v1.json");
  const tampered = structuredClone(CLOSED_MANIFEST);
  tampered.asset.platform = "linux";
  fs.writeFileSync(tamperedManifest, `${JSON.stringify(tampered, null, 2)}\n`);
  await assert.rejects(
    verifyManifestOnly({ manifestPath: tamperedManifest }),
    /release_(?:manifest_shape_invalid|platform_mismatch)/,
  );
});

test("verifyRelease rejects asset size or digest mismatch", async (t) => {
  const staging = privateTempDir(t);
  const wrongBytes = writeSyntheticAsset(path.join(staging, "wrong.bin"), {
    contents: Buffer.from("wrong-bytes\n"),
  });
  const valid = validVerifyArgs(t, { assetPath: wrongBytes });
  await assert.rejects(
    verifyRelease(valid),
    /release_asset_(?:size|digest)_mismatch/,
  );

  const sameSize = writeSyntheticAsset(path.join(staging, "same-size.bin"), {
    size: CLOSED_MANIFEST.asset.size,
  });
  await assert.rejects(
    verifyRelease({ ...valid, assetPath: sameSize }),
    /release_asset_(?:size|digest)_mismatch/,
  );
});

test("buildRelease rejects a mismatched runtime commit", async (t) => {
  const outDir = emptyOwnedOutDir(t);
  const staging = privateTempDir(t);
  const grokBinary = writeSyntheticAsset(path.join(staging, "fake-grok"), {
    contents: Buffer.from("fake\n"),
  });
  await assert.rejects(
    buildRelease({
      runtimeRoot: ROOT,
      commit: "0".repeat(40),
      grokBinary,
      outDir,
    }),
    /runtime_commit_mismatch/,
  );
});

test("buildRelease rejects unsafe output directory path, mode, symlink, and non-empty states", async (t) => {
  const staging = privateTempDir(t);
  const grokBinary = writeSyntheticAsset(path.join(staging, "fake-grok"), {
    contents: Buffer.from("fake\n"),
  });
  const commit = gitHead(ROOT);
  const base = {
    runtimeRoot: ROOT,
    commit,
    grokBinary,
  };

  await assert.rejects(
    buildRelease({ ...base, outDir: "relative/out" }),
    /release_path_not_absolute/,
  );

  const modeDir = emptyOwnedOutDir(t);
  fs.chmodSync(modeDir, 0o755);
  await assert.rejects(
    buildRelease({ ...base, outDir: modeDir }),
    /release_path_mode_mismatch/,
  );

  const realOut = emptyOwnedOutDir(t);
  const linkOut = path.join(staging, "out-link");
  fs.symlinkSync(realOut, linkOut);
  await assert.rejects(
    buildRelease({ ...base, outDir: linkOut }),
    /release_path_is_symlink/,
  );
  await assert.rejects(
    buildRelease({ ...base, outDir: `${linkOut}${path.sep}` }),
    /release_path_is_symlink/,
  );

  const nonEmpty = emptyOwnedOutDir(t);
  fs.writeFileSync(path.join(nonEmpty, "stale.txt"), "nope\n", {
    mode: 0o600,
  });
  await assert.rejects(
    buildRelease({ ...base, outDir: nonEmpty }),
    /release_out_dir_not_empty/,
  );
});

test("buildRelease rejects unsafe binary path shapes before publication", async (t) => {
  const outDir = emptyOwnedOutDir(t);
  const commit = gitHead(ROOT);
  const staging = privateTempDir(t);

  await assert.rejects(
    buildRelease({
      runtimeRoot: ROOT,
      commit,
      grokBinary: "relative-bin",
      outDir,
    }),
    /release_path_not_absolute/,
  );

  const linkBin = path.join(staging, "bin-link");
  const target = writeSyntheticAsset(path.join(staging, "bin-target"), {
    contents: Buffer.from("x\n"),
  });
  fs.symlinkSync(target, linkBin);
  await assert.rejects(
    buildRelease({
      runtimeRoot: ROOT,
      commit,
      grokBinary: linkBin,
      outDir,
    }),
    /release_path_is_symlink/,
  );

  const wrongSize = writeSyntheticAsset(path.join(staging, "wrong-size"), {
    contents: Buffer.from("too-small\n"),
  });
  await assert.rejects(
    buildRelease({
      runtimeRoot: ROOT,
      commit,
      grokBinary: wrongSize,
      outDir,
    }),
    /release_asset_(?:size|digest)_mismatch/,
  );
});

test("verifyRelease rejects unsafe paths, symlinks, and closed-shape violations", async (t) => {
  const staging = privateTempDir(t);
  const valid = validVerifyArgs(t);

  await assert.rejects(
    verifyRelease({ ...valid, assetPath: "relative-asset" }),
    /release_path_not_absolute/,
  );

  const linkAsset = path.join(staging, "asset-link");
  fs.symlinkSync(valid.assetPath, linkAsset);
  await assert.rejects(
    verifyRelease({ ...valid, assetPath: linkAsset }),
    /release_path_is_symlink/,
  );

  const badManifest = path.join(staging, "bad-manifest.json");
  const extra = structuredClone(CLOSED_MANIFEST);
  extra.extra_key = true;
  fs.writeFileSync(badManifest, `${JSON.stringify(extra, null, 2)}\n`);
  await assert.rejects(
    verifyRelease({ ...valid, manifestPath: badManifest }),
    /release_manifest_shape_invalid/,
  );

  const archManifest = path.join(staging, "arch-manifest.json");
  const wrongArch = structuredClone(CLOSED_MANIFEST);
  wrongArch.asset.arch = "x64";
  fs.writeFileSync(archManifest, `${JSON.stringify(wrongArch, null, 2)}\n`);
  await assert.rejects(
    verifyRelease({ ...valid, manifestPath: archManifest }),
    /release_(?:manifest_shape_invalid|arch_mismatch)/,
  );

  await assert.rejects(
    verifyRelease({ ...valid, commit: "0".repeat(40) }),
    /runtime_commit_mismatch/,
  );

  await assert.rejects(
    verifyRelease({ ...valid, commit: "not-a-commit" }),
    /runtime_commit_invalid/,
  );
});

test("verifyRelease projects the closed frozen receipt and rejects digest mismatch", async (t) => {
  const staging = privateTempDir(t);
  const sameSize = writeSyntheticAsset(path.join(staging, "zeros.bin"), {
    size: CLOSED_MANIFEST.asset.size,
  });
  await assert.rejects(
    verifyRelease(validVerifyArgs(t, { assetPath: sameSize })),
    /release_asset_digest_mismatch/,
  );

  const commit = gitHead(ROOT);
  const receipt = projectReleaseReceipt(
    commit,
    sha256Buffer(gitArchiveBytes(ROOT, commit)),
  );
  assert.ok(Object.isFrozen(receipt));
  assert.equal(receipt.commit, commit);
  assert.equal(receipt.asset_sha256, EXPECTED_ASSET_SHA256);
  assert.equal(receipt.asset_size, 129363664);
  assert.equal(receipt.asset_name, "grok-0.2.112-darwin-arm64");
  assert.equal(receipt.license_sha256, EXPECTED_LICENSE_SHA256);
  assert.equal(receipt.notice_sha256, EXPECTED_NOTICE_SHA256);
  assert.match(receipt.runtime_archive_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(receipt).sort(), [
    "asset_name",
    "asset_sha256",
    "asset_size",
    "commit",
    "license_sha256",
    "notice_sha256",
    "runtime_archive_sha256",
  ]);

  const sourceReceipt = await verifyManifestOnly({
    manifestPath: MANIFEST_PATH,
  });
  assert.ok(Object.isFrozen(sourceReceipt));
  assert.deepEqual(Object.keys(sourceReceipt).sort(), [
    "asset_name",
    "asset_sha256",
    "asset_size",
    "license_sha256",
    "notice_sha256",
    "schema_version",
  ]);
});

test("git archive ignores replacement refs while HEAD remains the requested commit", (t) => {
  const repository = privateTempDir(t, "grok-release-git-replace-");
  const runGit = (args, options = {}) => {
    const result = spawnSync("git", ["-C", repository, ...args], {
      encoding: options.encoding ?? "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(
      result.status,
      0,
      `git ${args.join(" ")} failed: ${String(result.stderr || "")}`,
    );
    return result.stdout;
  };

  runGit(["init", "--quiet"]);
  runGit(["config", "user.name", "Release Test"]);
  runGit(["config", "user.email", "release-test@example.invalid"]);
  fs.writeFileSync(path.join(repository, "tree.txt"), "original\n");
  runGit(["add", "tree.txt"]);
  runGit(["commit", "--quiet", "-m", "original"]);
  const originalCommit = runGit(["rev-parse", "HEAD"]).trim();
  const originalArchive = runGit(["archive", "--format=tar", originalCommit], {
    encoding: "buffer",
  });

  fs.writeFileSync(path.join(repository, "tree.txt"), "replacement\n");
  runGit(["commit", "--quiet", "-am", "replacement"]);
  const replacementCommit = runGit(["rev-parse", "HEAD"]).trim();
  runGit(["reset", "--quiet", "--hard", originalCommit]);
  runGit(["replace", originalCommit, replacementCommit]);

  assert.equal(gitHead(repository), originalCommit);
  const replacedArchive = runGit(["archive", "--format=tar", originalCommit], {
    encoding: "buffer",
  });
  assert.notEqual(sha256(replacedArchive), sha256(originalArchive));
  assert.equal(
    sha256(gitArchiveBytes(repository, originalCommit)),
    sha256(originalArchive),
  );
});

test("release scripts never invoke npm, curl, gh, or a network URL", () => {
  for (const filePath of [BUILD_SOURCE, EXTRACT_SOURCE, VERIFY_SOURCE]) {
    const source = fs.readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /\bnpm\b/);
    assert.doesNotMatch(source, /\bcurl\b/);
    assert.doesNotMatch(source, /\bgh\b/);
    assert.doesNotMatch(source, /https?:\/\//i);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
  }
});

test("publication exclusively creates the requested files with exact modes", (t) => {
  const staging = privateTempDir(t);
  const realParent = privateTempDir(t, "grok-release-real-parent-");
  const realOutDir = path.join(realParent, "out");
  fs.mkdirSync(realOutDir, { mode: 0o700 });
  const aliasParent = path.join(staging, "parent-alias");
  fs.symlinkSync(realParent, aliasParent);
  const outDir = path.join(aliasParent, "out");
  const canonicalOutDir = fs.realpathSync(realOutDir);
  const asset = writeSyntheticAsset(path.join(staging, "asset"), {
    contents: Buffer.from("asset-bytes\n"),
  });
  const license = writeSyntheticAsset(path.join(staging, "license"), {
    contents: Buffer.from("license-bytes\n"),
  });
  const notice = writeSyntheticAsset(path.join(staging, "notice"), {
    contents: Buffer.from("notice-bytes\n"),
  });

  const files = [
    {
      sourcePath: asset,
      assetName: "grok-test",
      mode: 0o500,
      size: 12,
      sha256: sha256(Buffer.from("asset-bytes\n")),
      sizeMismatchCode: "release_asset_size_mismatch",
      digestMismatchCode: "release_asset_digest_mismatch",
    },
    {
      sourcePath: license,
      assetName: "Apache-2.0.txt",
      mode: 0o600,
      size: 14,
      sha256: sha256(Buffer.from("license-bytes\n")),
      sizeMismatchCode: "release_license_digest_mismatch",
      digestMismatchCode: "release_license_digest_mismatch",
    },
    {
      sourcePath: notice,
      assetName: "THIRD_PARTY_NOTICES.md",
      mode: 0o600,
      size: 13,
      sha256: sha256(Buffer.from("notice-bytes\n")),
      sizeMismatchCode: "release_notice_digest_mismatch",
      digestMismatchCode: "release_notice_digest_mismatch",
    },
  ];

  const published = _publishReleaseFiles({ outDir, files });
  assert.deepEqual(fs.readdirSync(outDir).sort(), [
    "Apache-2.0.txt",
    "THIRD_PARTY_NOTICES.md",
    "grok-test",
  ]);
  assert.deepEqual(
    published.map(({ assetName }) => assetName),
    files.map(({ assetName }) => assetName),
  );
  for (const { sourcePath, assetName, mode } of files) {
    const output = path.join(realOutDir, assetName);
    assert.deepEqual(fs.readFileSync(output), fs.readFileSync(sourcePath));
    assert.equal(fs.statSync(output).mode & 0o777, mode);
  }
  assert.ok(
    published.every(({ path: publishedPath }) =>
      publishedPath.startsWith(`${canonicalOutDir}${path.sep}`),
    ),
  );
});

test("publication rejects overwrite and removes only outputs created by that attempt", (t) => {
  const staging = privateTempDir(t);
  const outDir = emptyOwnedOutDir(t);
  const first = writeSyntheticAsset(path.join(staging, "first"), {
    contents: Buffer.from("first\n"),
  });
  const second = writeSyntheticAsset(path.join(staging, "second"), {
    contents: Buffer.from("second\n"),
  });
  const existing = path.join(outDir, "second.txt");
  fs.writeFileSync(existing, "existing\n", { mode: 0o600 });

  assert.throws(
    () =>
      _publishReleaseFiles({
        outDir,
        files: [
          {
            sourcePath: first,
            assetName: "first.txt",
            mode: 0o600,
            size: 6,
            sha256: sha256(Buffer.from("first\n")),
            sizeMismatchCode: "release_notice_digest_mismatch",
            digestMismatchCode: "release_notice_digest_mismatch",
          },
        ],
      }),
    /release_out_dir_not_empty/,
  );

  assert.throws(
    () =>
      _publishReleaseFiles({
        outDir,
        requireEmpty: false,
        files: [
          {
            sourcePath: first,
            assetName: "first.txt",
            mode: 0o600,
            size: 6,
            sha256: sha256(Buffer.from("first\n")),
            sizeMismatchCode: "release_notice_digest_mismatch",
            digestMismatchCode: "release_notice_digest_mismatch",
          },
          {
            sourcePath: second,
            assetName: "second.txt",
            mode: 0o600,
            size: 7,
            sha256: sha256(Buffer.from("second\n")),
            sizeMismatchCode: "release_notice_digest_mismatch",
            digestMismatchCode: "release_notice_digest_mismatch",
          },
        ],
      }),
    /release_overwrite_rejected/,
  );
  assert.deepEqual(fs.readdirSync(outDir), ["second.txt"]);
  assert.equal(fs.readFileSync(existing, "utf8"), "existing\n");
});

test("exact-file verification checks small real files without changing pinned release values", (t) => {
  const staging = privateTempDir(t);
  const filePath = writeSyntheticAsset(path.join(staging, "fixture"), {
    contents: Buffer.from("verified\n"),
  });
  const expected = sha256(Buffer.from("verified\n"));

  const result = _verifyExactFile({
    filePath,
    size: 9,
    sha256: expected,
    sizeMismatchCode: "fixture_size_mismatch",
    digestMismatchCode: "fixture_digest_mismatch",
  });
  assert.equal(result.size, 9);
  assert.equal(result.sha256, expected);

  fs.writeFileSync(filePath, "tampered\n", { mode: 0o600 });
  assert.throws(
    () =>
      _verifyExactFile({
        filePath,
        size: 9,
        sha256: expected,
        sizeMismatchCode: "fixture_size_mismatch",
        digestMismatchCode: "fixture_digest_mismatch",
      }),
    /fixture_digest_mismatch/,
  );
});

test("descriptor checks detect file and output-directory substitution", (t) => {
  const staging = privateTempDir(t);
  const sourcePath = writeSyntheticAsset(path.join(staging, "source"), {
    contents: Buffer.from("source\n"),
  });
  const sourceHandle = _releaseFs.openVerifiedRegularFile(sourcePath);
  fs.renameSync(sourcePath, `${sourcePath}.moved`);
  writeSyntheticAsset(sourcePath, { contents: Buffer.from("replacement\n") });
  assert.throws(
    () => _releaseFs.closeVerifiedRegularFile(sourceHandle),
    /release_path_changed/,
  );

  const outDir = emptyOwnedOutDir(t);
  const directoryHandle = _releaseFs.openDirectoryIdentity(outDir, {
    mode: 0o700,
    safe: true,
  });
  const movedOutDir = `${outDir}.moved`;
  fs.renameSync(outDir, movedOutDir);
  fs.mkdirSync(outDir, { mode: 0o700 });
  try {
    assert.throws(
      () => _releaseFs.assertDirectoryIdentity(directoryHandle),
      /release_path_changed/,
    );
  } finally {
    fs.closeSync(directoryHandle.fd);
  }
});

test("full release CLIs require absolute paths and reject duplicate or mixed modes", () => {
  const commit = "a".repeat(40);
  const absolute = path.join(ROOT, "placeholder");
  assert.throws(
    () =>
      parseBuildArgs([
        "--runtime-root",
        ".",
        "--commit",
        commit,
        "--grok-bin",
        absolute,
        "--out-dir",
        absolute,
      ]),
    /release_path_not_absolute/,
  );
  assert.throws(
    () =>
      parseBuildArgs([
        "--runtime-root",
        absolute,
        "--runtime-root",
        absolute,
        "--commit",
        commit,
        "--grok-bin",
        absolute,
        "--out-dir",
        absolute,
      ]),
    /release_args_invalid/,
  );
  assert.throws(
    () =>
      parseVerifyArgs([
        "--runtime-root",
        absolute,
        "--commit",
        commit,
        "--asset",
        "relative-asset",
        "--license",
        absolute,
        "--notice",
        absolute,
        "--manifest",
        absolute,
      ]),
    /release_path_not_absolute/,
  );
  assert.throws(
    () =>
      parseVerifyArgs([
        "--manifest-only",
        "--manifest",
        "release/grok-runtime-v1.json",
        "--asset",
        absolute,
      ]),
    /release_args_invalid/,
  );

  const manifestOnly = parseVerifyArgs([
    "--manifest-only",
    "--manifest",
    "release/grok-runtime-v1.json",
  ]);
  assert.equal(manifestOnly.manifestPath, MANIFEST_PATH);
});

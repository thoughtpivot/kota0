import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chmod, mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureBundleBinariesExecutable } from "@/components/kota0/deploy/bundle/bundleBinaryPermissions";

const isExecutable = (mode: number): boolean => (mode & 0o111) !== 0;

/** Create a non-executable (0644) file, asserting the starting condition is the bug we fix. */
async function writeNonExecutable(file: string, body = ""): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, "utf8");
  await chmod(file, 0o644);
}

describe("ensureBundleBinariesExecutable", () => {
  it("restores +x on the esbuild platform binary that Vite spawns directly", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-binperms-"));
    const nm = path.join(root, "node_modules");
    // Mirrors the real failing path: vite's NESTED esbuild platform binary.
    const nested = path.join(nm, "vite", "node_modules", "@esbuild", "darwin-arm64", "bin", "esbuild");
    const topLevel = path.join(nm, "@esbuild", "darwin-arm64", "bin", "esbuild");
    try {
      await writeNonExecutable(nested, "#!/bin/sh\n");
      await writeNonExecutable(topLevel, "#!/bin/sh\n");

      await ensureBundleBinariesExecutable(nm);

      assert.ok(isExecutable((await stat(nested)).mode), "nested esbuild should be executable");
      assert.ok(isExecutable((await stat(topLevel)).mode), "top-level esbuild should be executable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("restores +x on .bin symlink targets without touching the symlink itself", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-binperms-bin-"));
    const nm = path.join(root, "node_modules");
    const viteBin = path.join(nm, "vite", "bin", "vite.js");
    const binLink = path.join(nm, ".bin", "vite");
    try {
      await writeNonExecutable(viteBin, "#!/usr/bin/env node\n");
      await mkdir(path.join(nm, ".bin"), { recursive: true });
      await symlink(path.relative(path.join(nm, ".bin"), viteBin), binLink);

      await ensureBundleBinariesExecutable(nm);

      assert.ok(isExecutable((await stat(viteBin)).mode), ".bin target should be executable");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("repairs the shared cache when node_modules is a symlink (thin-clone bundle)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-binperms-link-"));
    const cacheBin = path.join(root, ".cache", "node_modules", "@esbuild", "darwin-arm64", "bin", "esbuild");
    const bundleNm = path.join(root, "bundle", "node_modules");
    try {
      await writeNonExecutable(cacheBin, "#!/bin/sh\n");
      await mkdir(path.dirname(bundleNm), { recursive: true });
      await symlink(path.join(root, ".cache", "node_modules"), bundleNm, "dir");

      await ensureBundleBinariesExecutable(bundleNm);

      assert.ok(isExecutable((await stat(cacheBin)).mode), "cache binary should be repaired via the symlink");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("is a no-op when node_modules does not exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-binperms-missing-"));
    try {
      await ensureBundleBinariesExecutable(path.join(root, "node_modules"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

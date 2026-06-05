import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chmod, lstat, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureWritableDir,
  materializeBundleSymlinksForDeploy,
} from "@/components/kota0/deploy/bundle/bundleDirInflate";

const isOwnerWritable = (mode: number): boolean => (mode & 0o200) !== 0;

describe("kota0BundleDirInflate", () => {
  it("ensureWritableDir replaces a relative symlink with a real directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-inflate-"));
    const cacheDir = path.join(root, ".starter-cache");
    const bundleDir = path.join(root, "app-id");
    const cacheDist = path.join(cacheDir, "dist");
    const bundleDist = path.join(bundleDir, "dist");
    try {
      await mkdir(cacheDist, { recursive: true });
      await writeFile(path.join(cacheDist, "index.html"), "<html>cache</html>", "utf8");
      await mkdir(bundleDir, { recursive: true });
      const relTarget = path.relative(bundleDir, cacheDist);
      await symlink(relTarget, bundleDist, "dir");

      const inflated = await ensureWritableDir(bundleDist);
      assert.equal(inflated, true);
      const stat = await lstat(bundleDist);
      assert.equal(stat.isSymbolicLink(), false);
      const html = await readFile(path.join(bundleDist, "index.html"), "utf8");
      assert.match(html, /cache/);
      const cacheHtml = await readFile(path.join(cacheDist, "index.html"), "utf8");
      assert.match(cacheHtml, /cache/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("materializes a symlink to a READ-ONLY cache into a writable tree (vite emptyDir works)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-inflate-ro-"));
    const cacheDist = path.join(root, ".starter-cache", "dist");
    const bundleDist = path.join(root, "app-id", "dist");
    try {
      // Mirror the real cache: dist + dist/assets built, then dist chmod'd 0o555 (read-only).
      await mkdir(path.join(cacheDist, "assets"), { recursive: true });
      await writeFile(path.join(cacheDist, "assets", "index.js"), "console.log(1)", "utf8");
      await chmod(cacheDist, 0o555);
      await mkdir(path.join(root, "app-id"), { recursive: true });
      await symlink(path.relative(path.join(root, "app-id"), cacheDist), bundleDist, "dir");

      const materialized = await ensureWritableDir(bundleDist);

      assert.equal(materialized, true);
      assert.equal((await lstat(bundleDist)).isSymbolicLink(), false);
      assert.ok(isOwnerWritable((await stat(bundleDist)).mode), "dist must be owner-writable");
      assert.ok(
        isOwnerWritable((await stat(path.join(bundleDist, "assets"))).mode),
        "dist/assets must be owner-writable",
      );
      // The exact operation that was failing with EACCES: vite's prepareOutDir empties the out dir.
      assert.doesNotThrow(() => rmSync(path.join(bundleDist, "assets"), { recursive: true }));
      // The shared cache is left untouched (still read-only).
      assert.equal((await stat(cacheDist)).mode & 0o200, 0, "cache must stay read-only");
    } finally {
      await chmod(cacheDist, 0o755).catch(() => {});
      await rm(root, { recursive: true, force: true });
    }
  });

  it("repairs an already-materialized real read-only directory (self-heal on rebuild)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-inflate-real-ro-"));
    const dist = path.join(root, "dist");
    try {
      await mkdir(path.join(dist, "assets"), { recursive: true });
      await chmod(path.join(dist, "assets"), 0o555);
      await chmod(dist, 0o555);

      const materialized = await ensureWritableDir(dist);

      assert.equal(materialized, false, "no symlink, so nothing was materialized");
      assert.ok(isOwnerWritable((await stat(dist)).mode), "dist made writable");
      assert.doesNotThrow(() => rmSync(path.join(dist, "assets"), { recursive: true }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("materializeBundleSymlinksForDeploy inflates node_modules and dist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-deploy-inflate-"));
    const cacheDir = path.join(root, ".starter-cache");
    const bundleDir = path.join(root, "app-id");
    try {
      for (const dir of ["node_modules/pkg", "dist"] as const) {
        await mkdir(path.join(cacheDir, dir), { recursive: true });
      }
      await writeFile(path.join(cacheDir, "dist", "index.html"), "<html>ok</html>", "utf8");
      await writeFile(path.join(cacheDir, "node_modules", "pkg", "index.js"), "export {};", "utf8");
      await mkdir(bundleDir, { recursive: true });
      for (const dir of ["node_modules", "dist"] as const) {
        await symlink(path.relative(bundleDir, path.join(cacheDir, dir)), path.join(bundleDir, dir), "dir");
      }

      await materializeBundleSymlinksForDeploy(bundleDir);

      for (const dir of ["node_modules", "dist"] as const) {
        const stat = await lstat(path.join(bundleDir, dir));
        assert.equal(stat.isSymbolicLink(), false, `${dir} should be materialized`);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

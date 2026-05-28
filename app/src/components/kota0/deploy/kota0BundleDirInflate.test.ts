import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureWritableDir,
  materializeBundleSymlinksForDeploy,
} from "@/components/kota0/deploy/kota0BundleDirInflate";

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

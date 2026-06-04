import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sanitizeAppVueBundleApiImports } from "@/components/kota0/deploy/bundle/appVueBundleApiSanitize";
import { isPlaceholder } from "@/components/kota0/viewer/sfc/starterDetect";
import {
  computeStarterCacheFingerprint,
  isStarterCacheDisabled,
  isStarterCacheReady,
  markStarterCacheReadOnly,
  thinCloneStarterCacheToAppBundle,
} from "@/components/kota0/deploy/bundle/starterBundleCache";
import { bundleMaterializeFingerprint } from "@/components/kota0/deploy/bundle/bundleMaterializeFingerprint";
import {
  DEFAULT_K0_BACKEND,
  DEFAULT_K0_SFC,
} from "@/components/kota0/viewer/materialize/materialize";
import { normalizeAppBackendForFlight } from "@/components/kota0/viewer/materialize/appBackendForFlight";
import { sanitizeChartJsModelArtifactsInAppVueSource } from "@/components/kota0/deploy/bundle/appVueChartSanitize.ts";
import { normalizeAppVueLeadingSlashApis } from "@/components/kota0/viewer/materialize/materialize";

describe("kota0StarterBundleCache", () => {
  it("computeStarterCacheFingerprint is stable", async () => {
    const a = await computeStarterCacheFingerprint();
    const b = await computeStarterCacheFingerprint();
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it("isStarterCacheReady is false when cache dir is absent", async () => {
    const prev = process.env.K0_DISABLE_STARTER_CACHE;
    process.env.K0_DISABLE_STARTER_CACHE = "1";
    try {
      assert.equal(await isStarterCacheReady(), false);
      assert.equal(isStarterCacheDisabled(), true);
    } finally {
      if (prev === undefined) delete process.env.K0_DISABLE_STARTER_CACHE;
      else process.env.K0_DISABLE_STARTER_CACHE = prev;
    }
  });

  it("raw DEFAULT_K0_SFC + DEFAULT_K0_BACKEND must be recognized as placeholder so the fast path triggers for new apps", () => {
    /**
     * Regression: passing the **normalized** vueSource to isPlaceholder caused the
     * starter-cache fast path to never trigger (the normalizer rewrites a literal `'/api/…'`
     * inside the default comment, so normalized !== raw). materializeForApp must compare
     * against the **raw** Scribe-stored source.
     */
    assert.equal(isPlaceholder({ sfc: DEFAULT_K0_SFC, backend: DEFAULT_K0_BACKEND }), true);
  });

  it("placeholder app materialize fingerprint matches normalized starter sources", () => {
    const vue = sanitizeChartJsModelArtifactsInAppVueSource(
      normalizeAppVueLeadingSlashApis(DEFAULT_K0_SFC),
    );
    const backend = normalizeAppBackendForFlight(DEFAULT_K0_BACKEND);
    const fpFromDefaults = bundleMaterializeFingerprint(DEFAULT_K0_SFC, DEFAULT_K0_BACKEND);
    const fpFromNormalized = bundleMaterializeFingerprint(vue, backend);
    assert.equal(fpFromDefaults, fpFromNormalized);
  });

  it("thinCloneStarterCacheToAppBundle uses relative symlinks for heavy dirs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-starter-clone-"));
    const cacheDir = path.join(root, ".starter-cache");
    const bundleDir = path.join(root, "new-app-id");
    try {
      await mkdir(path.join(cacheDir, "node_modules", "pkg"), { recursive: true });
      await mkdir(path.join(cacheDir, "dist"), { recursive: true });
      await writeFile(path.join(cacheDir, "dist", "index.html"), "<html></html>", "utf8");
      await writeFile(path.join(cacheDir, "App.vue"), "<template></template>", "utf8");
      await writeFile(path.join(cacheDir, "App.backend.ts"), "export default () => {};", "utf8");
      await writeFile(path.join(cacheDir, "package.json"), "{}\n", "utf8");
      await mkdir(path.join(cacheDir, "src"), { recursive: true });
      await writeFile(path.join(cacheDir, "src", "bundleApi.ts"), "export {};", "utf8");

      await thinCloneStarterCacheToAppBundle(cacheDir, bundleDir);

      for (const dir of ["node_modules", "dist"] as const) {
        const linkPath = path.join(bundleDir, dir);
        const stat = await lstat(linkPath);
        assert.equal(stat.isSymbolicLink(), true, `${dir} should be a symlink`);
        const target = await readlink(linkPath);
        assert.equal(path.isAbsolute(target), false, `${dir} symlink target must be relative`);
      }
      const appVueStat = await lstat(path.join(bundleDir, "App.vue"));
      assert.equal(appVueStat.isSymbolicLink(), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("markStarterCacheReadOnly sets cache dir mode 0555", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "k0-starter-ro-"));
    const cacheDir = path.join(root, ".starter-cache");
    try {
      await mkdir(path.join(cacheDir, "node_modules"), { recursive: true });
      await mkdir(path.join(cacheDir, "dist"), { recursive: true });
      await markStarterCacheReadOnly(cacheDir);
      const stat = await lstat(cacheDir);
      assert.equal(stat.mode & 0o777, 0o555);
    } finally {
      await chmod(cacheDir, 0o755).catch(() => {});
      await chmod(path.join(cacheDir, "node_modules"), 0o755).catch(() => {});
      await chmod(path.join(cacheDir, "dist"), 0o755).catch(() => {});
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("sanitizeAppVueBundleApiImports", () => {
  it("rewrites @shared/bundleApi and @/bundleApi to ./src/bundleApi", () => {
    const src =
      'import { bundleApiUrl } from "@shared/bundleApi";\nimport x from "@/bundleApi";';
    const out = sanitizeAppVueBundleApiImports(src);
    assert.match(out, /from "\.\/src\/bundleApi"/g);
    assert.doesNotMatch(out, /@shared\/bundleApi/);
    assert.doesNotMatch(out, /@\/bundleApi/);
  });
});

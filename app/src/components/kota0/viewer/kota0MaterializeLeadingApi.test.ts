/**
 * Regression coverage for `normalizeKota0AppVueLeadingSlashApis`.
 *
 * The workspace preview iframe loads bundle App.vue under
 * `/__k0_bundle/<…>`, but a path-absolute `fetch('/api/…')` in the SFC ignores
 * `<base href>` and resolves at the workspace origin instead of the bundle's.
 * The workspace doesn't serve arbitrary `/api/…`, so the call **404s**. This
 * was reported by the user as "the app front-end is having issues checking
 * the backend, we get 404 on the attempted route" — the bundle had
 * `router.get('/api/holidays', …)` on the backend and `fetch('/api/holidays')`
 * in App.vue; the latter hit the workspace and returned 404.
 *
 * The materializer must rewrite any leading-slash `/api/…` literal in App.vue
 * (except `/api/kota0/…`, which targets the WORKSPACE API on purpose) so the
 * call goes through `bundleApiUrl(...)` and hence the preview proxy.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeKota0AppVueLeadingSlashApis } from "@/components/kota0/viewer/kota0Materialize";

const sfcWith = (body: string) => `<template>\n  <div>x</div>\n</template>\n\n<script setup lang="ts">\n${body}\n</script>\n`;

describe("normalizeKota0AppVueLeadingSlashApis", () => {
  it("rewrites /api/kota0-app/* (existing behavior preserved)", () => {
    const out = normalizeKota0AppVueLeadingSlashApis(
      sfcWith(`const r = await fetch('/api/kota0-app/items');`),
    );
    assert.ok(out.includes("bundleApiUrl('api/kota0-app/items')"));
    assert.ok(!out.includes("'/api/kota0-app/items'"));
  });

  it("rewrites bare /api/<custom>/* paths — the user-reported 404", () => {
    const out = normalizeKota0AppVueLeadingSlashApis(
      sfcWith(`const r = await fetch('/api/holidays');`),
    );
    assert.ok(out.includes("bundleApiUrl('api/holidays')"));
    assert.ok(!out.includes("'/api/holidays'"));
  });

  it("rewrites nested /api/<custom>/<segment> paths", () => {
    const out = normalizeKota0AppVueLeadingSlashApis(
      sfcWith(`fetch('/api/auth/session');\nfetch("/api/data/list");`),
    );
    assert.ok(out.includes("bundleApiUrl('api/auth/session')"));
    assert.ok(out.includes("bundleApiUrl('api/data/list')"));
  });

  it("leaves /api/kota0/* alone (workspace API — bundles must not silently re-proxy)", () => {
    const before = sfcWith(`fetch('/api/kota0/diagnostics');`);
    const out = normalizeKota0AppVueLeadingSlashApis(before);
    assert.equal(out, before);
  });

  it("injects the bundleApi import once when at least one rewrite happens", () => {
    const out = normalizeKota0AppVueLeadingSlashApis(
      sfcWith(`fetch('/api/holidays');\nfetch('/api/kota0-app/items');`),
    );
    const importCount = out.match(/from '\.\/src\/bundleApi'/g)?.length ?? 0;
    assert.equal(importCount, 1, "expected exactly one bundleApi import");
  });

  it("does not insert the import when no /api/ literals are present", () => {
    const before = sfcWith(`const x = 1;`);
    const out = normalizeKota0AppVueLeadingSlashApis(before);
    assert.equal(out, before);
  });

  it("preserves existing `from './src/bundleApi'` import (idempotent)", () => {
    const before = sfcWith(
      `import { bundleApiUrl } from './src/bundleApi';\nfetch('/api/holidays');`,
    );
    const out = normalizeKota0AppVueLeadingSlashApis(before);
    const importCount = out.match(/from '\.\/src\/bundleApi'/g)?.length ?? 0;
    assert.equal(importCount, 1, "expected exactly one bundleApi import");
    assert.ok(out.includes("bundleApiUrl('api/holidays')"));
  });

  it("rewrites @/bundleApi imports to ./src/bundleApi (workspace alias does not exist in bundles)", () => {
    const out = normalizeKota0AppVueLeadingSlashApis(
      sfcWith(`import { bundleApiUrl } from '@/bundleApi';\nfetch('/api/holidays');`),
    );
    assert.ok(out.includes(`from './src/bundleApi'`));
    assert.ok(!out.includes(`from '@/bundleApi'`));
  });

  it("rewrites double-quoted literals too", () => {
    const out = normalizeKota0AppVueLeadingSlashApis(
      sfcWith(`fetch("/api/holidays");`),
    );
    assert.ok(out.includes(`bundleApiUrl('api/holidays')`));
  });
});

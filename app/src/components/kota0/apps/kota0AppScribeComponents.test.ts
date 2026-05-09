import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeScribeComponentPath,
  extractKota0BackendScribeKeys,
  mergeScribeBundleComponentManifest,
} from "@/components/kota0/apps/kota0AppScribeComponents.ts";

test("extract forComponent and subcomponent literals", () => {
  const src = `
import { createScribeRestClient } from "@shared/scribeRestClient";
const scribe = createScribeRestClient();
const posts = scribe.forComponent("blog_posts");
const nested = scribe.subcomponent('parent', 'child');
`;
  const keys = extractKota0BackendScribeKeys(src);
  assert.deepEqual(keys, ["blog_posts", "parent/child"]);
});

test("mergeScribeBundleComponentManifest unions and drops platform keys", () => {
  const m = mergeScribeBundleComponentManifest(["blog_posts"], ["k0_app", "todo_items"], ["blog_posts"]);
  assert.ok(!m.includes("k0_app"));
  assert.ok(m.includes("blog_posts"));
  assert.ok(m.includes("todo_items"));
});

test("encodeScribeComponentPath encodes segments", () => {
  assert.equal(encodeScribeComponentPath("blog_posts"), "blog_posts");
  assert.equal(encodeScribeComponentPath("a/b"), "a/b");
});

test("extract k0_demo_greetings from default starter backend (generic forComponent)", () => {
  const src = `
import { createScribeRestClient } from "@shared/scribeRestClient";
const scribe = createScribeRestClient();
const greetings = scribe.forComponent<{ phrase: string }>("k0_demo_greetings");
`;
  const keys = extractKota0BackendScribeKeys(src);
  assert.deepEqual(keys, ["k0_demo_greetings"]);
});

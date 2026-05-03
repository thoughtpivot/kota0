import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeScribeComponentPath,
  extractPowervibeBackendScribeKeys,
  mergeScribeBundleComponentManifest,
} from "@/components/powervibe/apps/powervibeAppScribeComponents.ts";

test("extract forComponent and subcomponent literals", () => {
  const src = `
import { createScribeRestClient } from "@shared/scribeRestClient";
const scribe = createScribeRestClient();
const posts = scribe.forComponent("blog_posts");
const nested = scribe.subcomponent('parent', 'child');
`;
  const keys = extractPowervibeBackendScribeKeys(src);
  assert.deepEqual(keys, ["blog_posts", "parent/child"]);
});

test("mergeScribeBundleComponentManifest unions and drops platform keys", () => {
  const m = mergeScribeBundleComponentManifest(["blog_posts"], ["powervibe_app", "todo_items"], ["blog_posts"]);
  assert.ok(!m.includes("powervibe_app"));
  assert.ok(m.includes("blog_posts"));
  assert.ok(m.includes("todo_items"));
});

test("encodeScribeComponentPath encodes segments", () => {
  assert.equal(encodeScribeComponentPath("blog_posts"), "blog_posts");
  assert.equal(encodeScribeComponentPath("a/b"), "a/b");
});

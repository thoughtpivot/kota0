import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createScribeGatewayApp } from "@/components/kota0/gateway/ScribeGateway.ts";
import { scribeKeyRegistry } from "@/components/kota0/gateway/ScribeKeyRegistry.ts";

type UpstreamHit = { method: string; path: string; body: unknown };

async function startUpstream(): Promise<{ url: string; hits: UpstreamHit[]; close: () => Promise<void> }> {
  const hits: UpstreamHit[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let body: unknown = undefined;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      hits.push({ method: req.method ?? "", path: req.url ?? "", body });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, sawPath: req.url }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function startGateway(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = createScribeGatewayApp();
  const server: Server = createServer(app.callback());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test("ScribeGateway: per-app path prefixing, token auth, and cross-app isolation", async (t) => {
  const tmp = await mkdtemp(path.join(tmpdir(), "k0-gw-test-"));
  const registryPath = path.join(tmp, "keys.json");
  scribeKeyRegistry.configure(registryPath);

  const upstream = await startUpstream();
  const previousUpstream = process.env.SCRIBE_GATEWAY_UPSTREAM_URL;
  process.env.SCRIBE_GATEWAY_UPSTREAM_URL = upstream.url;

  const gateway = await startGateway();

  t.after(async () => {
    await gateway.close();
    await upstream.close();
    if (previousUpstream === undefined) delete process.env.SCRIBE_GATEWAY_UPSTREAM_URL;
    else process.env.SCRIBE_GATEWAY_UPSTREAM_URL = previousUpstream;
    await rm(tmp, { recursive: true, force: true });
  });

  const appA = "11111111-1111-1111-1111-111111111111";
  const appB = "22222222-2222-2222-2222-222222222222";
  const keyA = await scribeKeyRegistry.provision(appA);
  const keyB = await scribeKeyRegistry.provision(appB);
  assert.notEqual(keyA, keyB);

  await t.test("missing token → 401", async () => {
    const resp = await fetch(`${gateway.url}/chat_messages/all`);
    assert.equal(resp.status, 401);
    const body = (await resp.json()) as { error: string };
    assert.equal(body.error, "unauthorized");
  });

  await t.test("bogus token → 401", async () => {
    const resp = await fetch(`${gateway.url}/chat_messages/all`, {
      headers: { authorization: "Bearer sk-app-not-a-real-key" },
    });
    assert.equal(resp.status, 401);
  });

  await t.test("app A's token rewrites path with A's prefix only", async () => {
    upstream.hits.length = 0;
    const resp = await fetch(`${gateway.url}/chat_messages/all`, {
      headers: { authorization: `Bearer ${keyA}` },
    });
    assert.equal(resp.status, 200);
    assert.equal(upstream.hits.length, 1);
    assert.equal(upstream.hits[0].method, "GET");
    const expectedPrefix = `app_${appA.replace(/-/g, "_")}`;
    assert.equal(upstream.hits[0].path, `/${expectedPrefix}_chat_messages/all`);
  });

  await t.test("app B's token rewrites path with B's prefix only", async () => {
    upstream.hits.length = 0;
    const resp = await fetch(`${gateway.url}/chat_messages/all`, {
      headers: { authorization: `Bearer ${keyB}` },
    });
    assert.equal(resp.status, 200);
    const expectedPrefix = `app_${appB.replace(/-/g, "_")}`;
    assert.equal(upstream.hits[0].path, `/${expectedPrefix}_chat_messages/all`);
  });

  await t.test("subcomponent paths keep their /parent/child shape under the app prefix", async () => {
    upstream.hits.length = 0;
    const resp = await fetch(`${gateway.url}/parent/child/all`, {
      headers: { authorization: `Bearer ${keyA}` },
    });
    assert.equal(resp.status, 200);
    const expectedPrefix = `app_${appA.replace(/-/g, "_")}`;
    assert.equal(upstream.hits[0].path, `/${expectedPrefix}_parent/child/all`);
  });

  await t.test("app A cannot reach app B's raw table — its prefix is always forced in", async () => {
    upstream.hits.length = 0;
    // Even if A crafts a path naming B's appId table, the gateway prefixes with A's prefix.
    const sneaky = `/app_${appB.replace(/-/g, "_")}_chat_messages/all`;
    const resp = await fetch(`${gateway.url}${sneaky}`, {
      headers: { authorization: `Bearer ${keyA}` },
    });
    assert.equal(resp.status, 200);
    const expectedPrefix = `app_${appA.replace(/-/g, "_")}`;
    assert.ok(
      upstream.hits[0].path.startsWith(`/${expectedPrefix}_`),
      `expected upstream path to start with A's prefix, got ${upstream.hits[0].path}`,
    );
    // And the resulting upstream table is NOT app B's pristine table.
    assert.notEqual(upstream.hits[0].path, sneaky);
  });

  await t.test("POST body is forwarded under the rewritten path", async () => {
    upstream.hits.length = 0;
    const resp = await fetch(`${gateway.url}/chat_messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${keyA}`, "content-type": "application/json" },
      body: JSON.stringify({ data: { text: "hello" } }),
    });
    assert.equal(resp.status, 200);
    const expectedPrefix = `app_${appA.replace(/-/g, "_")}`;
    assert.equal(upstream.hits[0].method, "POST");
    assert.equal(upstream.hits[0].path, `/${expectedPrefix}_chat_messages`);
    assert.deepEqual(upstream.hits[0].body, { data: { text: "hello" } });
  });

  await t.test("revoke invalidates a previously valid token", async () => {
    await scribeKeyRegistry.revoke(appA);
    // Gateway resolve() reads in-memory map; revoke() updates it directly in this process,
    // so revocation is observable without the fs.watch round-trip in tests.
    const resp = await fetch(`${gateway.url}/chat_messages/all`, {
      headers: { authorization: `Bearer ${keyA}` },
    });
    assert.equal(resp.status, 401);
  });
});

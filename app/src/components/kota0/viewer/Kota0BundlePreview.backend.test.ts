import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { RouterContext } from "@koa/router";
import { readProxyRequestBody } from "@/components/kota0/viewer/Kota0BundlePreview.backend";

function makeCtx(opts: {
  rawBody?: unknown;
  reqStream?: NodeJS.ReadableStream;
  readable?: boolean;
  readableEnded?: boolean;
}): RouterContext {
  const req = opts.reqStream ?? new Readable({ read() { this.push(null); } });
  Object.defineProperty(req, "readable", { value: opts.readable ?? true, configurable: true });
  Object.defineProperty(req, "readableEnded", { value: opts.readableEnded ?? false, configurable: true });
  return {
    request: { rawBody: opts.rawBody },
    req,
  } as unknown as RouterContext;
}

describe("readProxyRequestBody", () => {
  it("returns bodyparser's rawBody string as a Buffer without re-draining ctx.req", async () => {
    /**
     * Regression: workspace Flight's koa-bodyparser drains ctx.req for JSON POSTs. Re-draining the
     * already-ended stream hangs forever. The helper must prefer ctx.request.rawBody.
     */
    const stream = new Readable({ read() {} });
    // Stream never emits 'end' — if the helper tried to drain it, this test would time out.
    const ctx = makeCtx({ rawBody: '{"flavour":"reuben"}', reqStream: stream, readable: false, readableEnded: true });
    const buf = await readProxyRequestBody(ctx);
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf!.toString("utf8"), '{"flavour":"reuben"}');
  });

  it("returns rawBody Buffer when bodyparser stored it as a Buffer", async () => {
    const raw = Buffer.from("hello", "utf8");
    const buf = await readProxyRequestBody(makeCtx({ rawBody: raw, readable: false, readableEnded: true }));
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf!.toString("utf8"), "hello");
  });

  it("returns undefined when no rawBody and stream already ended (e.g. GET)", async () => {
    const buf = await readProxyRequestBody(makeCtx({ readable: false, readableEnded: true }));
    assert.equal(buf, undefined);
  });

  it("returns undefined when rawBody is an empty string", async () => {
    const buf = await readProxyRequestBody(makeCtx({ rawBody: "", readable: false, readableEnded: true }));
    assert.equal(buf, undefined);
  });

  it("drains ctx.req when bodyparser did not run (e.g. multipart) and stream is still readable", async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.from("multipart-payload"));
        this.push(null);
      },
    });
    const buf = await readProxyRequestBody(makeCtx({ reqStream: stream, readable: true, readableEnded: false }));
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(buf!.toString("utf8"), "multipart-payload");
  });
});

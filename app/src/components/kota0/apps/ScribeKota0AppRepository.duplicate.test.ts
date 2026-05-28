import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  nextCopyName,
  ScribeKota0AppRepository,
} from "@/components/kota0/apps/ScribeKota0AppRepository";
import { scribe } from "@/lib/scribe";

type Row = { id: number; data: Record<string, unknown>; date_created?: string; date_modified?: string };

function buildRow(overrides: Partial<Record<string, unknown>> = {}): Row {
  return {
    id: overrides.id as number ?? 1,
    data: {
      app_id: "source-uuid",
      name: "My App",
      status: "applied",
      source: "<template>source</template>",
      backendSource: 'import { createScribeRestClient } from "@shared/scribeRestClient"; const s = createScribeRestClient(); s.forComponent("notes");',
      app_icon: "sparkles",
      bundleEnv: "API_KEY=xyz",
      ...overrides,
    } as Record<string, unknown>,
    date_created: "2026-01-01T00:00:00.000Z",
    date_modified: "2026-01-02T00:00:00.000Z",
  };
}

function installScribeFake(rowsBefore: Row[]): { posted: { data: Record<string, unknown> }[] } {
  const rows: Row[] = [...rowsBefore];
  const posted: { data: Record<string, unknown> }[] = [];
  let nextId = (rows.reduce((m, r) => Math.max(m, r.id), 0) || 0) + 1;
  (scribe as unknown as { get: (p: string) => Promise<{ data: unknown }> }).get = async () => ({ data: rows });
  (scribe as unknown as { post: (p: string, body: { data: Record<string, unknown> }) => Promise<{ data: unknown }> }).post = async (_p, body) => {
    posted.push(body);
    rows.push({ id: nextId++, data: body.data as Record<string, unknown>, date_created: new Date().toISOString(), date_modified: new Date().toISOString() });
    return { data: { ok: true } };
  };
  return { posted };
}

describe("nextCopyName", () => {
  it("appends (copy) when no collision", () => {
    assert.equal(nextCopyName("Foo", ["Foo", "Bar"]), "Foo (copy)");
  });

  it("appends (copy 2) when (copy) already taken", () => {
    assert.equal(nextCopyName("Foo", ["Foo", "Foo (copy)"]), "Foo (copy 2)");
  });

  it("increments past existing (copy N) chain", () => {
    assert.equal(
      nextCopyName("Foo", ["Foo", "Foo (copy)", "Foo (copy 2)", "Foo (copy 3)"]),
      "Foo (copy 4)",
    );
  });

  it("strips trailing (copy) on the source so duplicates do not nest", () => {
    assert.equal(nextCopyName("Foo (copy)", ["Foo", "Foo (copy)"]), "Foo (copy 2)");
  });

  it("strips trailing (copy 5) on the source so duplicates pick the next free slot", () => {
    assert.equal(
      nextCopyName("Foo (copy 5)", ["Foo", "Foo (copy)", "Foo (copy 2)"]),
      "Foo (copy 3)",
    );
  });

  it("falls back to Untitled when the source is empty", () => {
    assert.equal(nextCopyName("   ", []), "Untitled (copy)");
  });
});

describe("ScribeKota0AppRepository.duplicateApp", () => {
  beforeEach(() => {
    // Stubs are reinstalled per-test via installScribeFake.
  });

  it("happy path — fresh UUID, copied fields, (copy) suffix, status reset to draft", async () => {
    const src = buildRow();
    const { posted } = installScribeFake([src]);
    const repo = new ScribeKota0AppRepository();
    const created = await repo.duplicateApp("source-uuid");

    assert.notEqual(created.app_id, "source-uuid", "new UUID was minted");
    assert.equal(created.name, "My App (copy)");
    assert.equal(created.status, "draft", "applied → draft");
    assert.equal(created.source, src.data.source);
    assert.equal(created.backendSource, src.data.backendSource);
    assert.equal(created.bundleEnv, src.data.bundleEnv);
    assert.equal(created.app_icon, src.data.app_icon);
    assert.deepEqual(created.scribe_bundle_components, ["notes"], "scribe components are re-extracted from backendSource");

    assert.equal(posted.length, 1, "exactly one INSERT");
    const insertedData = posted[0]!.data as Record<string, unknown>;
    assert.equal(insertedData.status, "draft");
    assert.notEqual(insertedData.app_id, "source-uuid");
  });

  it("second copy increments suffix to (copy 2)", async () => {
    const src = buildRow();
    const firstCopy: Row = {
      id: 99,
      data: { ...src.data, app_id: "first-copy-uuid", name: "My App (copy)", status: "draft" },
    };
    installScribeFake([src, firstCopy]);
    const repo = new ScribeKota0AppRepository();
    const created = await repo.duplicateApp("source-uuid");

    assert.equal(created.name, "My App (copy 2)");
  });

  it("missing source throws app_not_found", async () => {
    installScribeFake([]);
    const repo = new ScribeKota0AppRepository();
    await assert.rejects(repo.duplicateApp("does-not-exist"), /app_not_found/);
  });
});

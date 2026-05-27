import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getKota0AiTurnStats,
  recordKota0AiTurnStats,
  resetKota0AiTurnStatsForTest,
} from "@/components/kota0/ai/kota0AiProvider";

describe("kota0AiTurnStats", () => {
  beforeEach(() => {
    resetKota0AiTurnStatsForTest();
  });

  it("records and reads back stats with at + modelId stamped", () => {
    recordKota0AiTurnStats({ classifierComplex: true, classifierMs: 12, totalMs: 4500 });
    const rows = getKota0AiTurnStats();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.classifierComplex, true);
    assert.equal(rows[0]!.classifierMs, 12);
    assert.equal(rows[0]!.totalMs, 4500);
    assert.equal(typeof rows[0]!.at, "string");
    assert.equal(typeof rows[0]!.modelId, "string");
    assert.ok(rows[0]!.modelId.length > 0);
  });

  it("limit clips returned rows from the tail", () => {
    for (let i = 0; i < 8; i++) recordKota0AiTurnStats({ totalMs: i });
    const tail = getKota0AiTurnStats(3);
    assert.equal(tail.length, 3);
    assert.deepEqual(tail.map((r) => r.totalMs), [5, 6, 7]);
  });

  it("caps the in-memory window so we don't grow unbounded", () => {
    for (let i = 0; i < 700; i++) recordKota0AiTurnStats({ totalMs: i });
    const all = getKota0AiTurnStats(1000);
    assert.ok(all.length <= 500, `expected <=500 rows, got ${all.length}`);
    // Oldest in window should be later than the very first record.
    assert.ok((all[0]!.totalMs ?? -1) >= 200);
  });
});

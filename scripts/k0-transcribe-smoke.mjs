#!/usr/bin/env node
/**
 * Optional smoke: POST /api/kota0/transcribe-audio with a tiny synthetic WAV (silence).
 *
 * Requires a running app (`npm run start:app`) and the same origin as the UI proxy unless you point elsewhere.
 * Skips (exit 0) when GEMINI_API_KEY or K0_SMOKE_BASE is unset so CI/local runs stay quiet.
 *
 * @example
 *   GEMINI_API_KEY=... K0_SMOKE_BASE=http://127.0.0.1:3001 node scripts/kota0-transcribe-smoke.mjs
 */

function minimalSilentWavBase64() {
  const sampleRate = 8000;
  const durationMs = 400;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf.toString("base64");
}

async function main() {
  const key = process.env.GEMINI_API_KEY?.trim();
  const base = (process.env.K0_SMOKE_BASE || "").replace(/\/$/, "");
  if (!key || !base) {
    console.log(
      "SKIP kota0-transcribe-smoke: set GEMINI_API_KEY and K0_SMOKE_BASE (e.g. http://127.0.0.1:3001)",
    );
    return;
  }

  const u = `${base}/api/kota0/transcribe-audio`;
  const body = JSON.stringify({
    audioBase64: minimalSilentWavBase64(),
    mimeType: "audio/wav",
  });

  let r;
  try {
    r = await fetch(u, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (e) {
    console.error("FAIL fetch", u, e instanceof Error ? e.message : e);
    process.exitCode = 1;
    return;
  }

  const raw = await r.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("FAIL non-JSON", r.status, raw.slice(0, 400));
    process.exitCode = 1;
    return;
  }

  if (r.status === 200 && typeof parsed.text === "string") {
    console.log("OK transcribe-audio", { status: r.status, textLength: parsed.text.length });
    return;
  }

  console.error("FAIL transcribe-audio", r.status, parsed);
  process.exitCode = 1;
}

await main();

/**
 * Scribe REST client for Flight backends (build-ai pattern).
 * `SCRIBE_URL` overrides the base URL; when unset, development defaults to `http://127.0.0.1:1337` (host Scribe after `npm run start:docker`).
 * In Docker Compose, Flight can set `SCRIBE_URL=http://scribe:1337` or rely on `/.dockerenv` rewrite when env still points at localhost.
 */
import "@/lib/env";
import axios, { type AxiosInstance } from "axios";
import { existsSync } from "node:fs";

function runningInDocker(): boolean {
  try {
    return existsSync("/.dockerenv");
  } catch {
    return false;
  }
}

function resolveScribeBaseUrl(): string {
  const fromEnv = process.env.SCRIBE_URL?.trim() ?? "";
  if (runningInDocker() && (fromEnv === "" || /\blocalhost\b|127\.0\.0\.1/.test(fromEnv))) {
    return "http://scribe:1337";
  }
  if (fromEnv !== "") {
    return fromEnv.replace(/\/$/, "");
  }
  return "http://127.0.0.1:1337";
}

export const scribe: AxiosInstance = axios.create({
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
});

scribe.interceptors.request.use((config) => {
  config.baseURL = resolveScribeBaseUrl();
  return config;
});

export function getScribeUrl(): string {
  return resolveScribeBaseUrl();
}

/**
 * Whether nVibe may call Scribe. In **production**, `SCRIBE_URL` must be set explicitly.
 * In **development**, missing `SCRIBE_URL` is OK — requests use `resolveScribeBaseUrl()` (default `http://127.0.0.1:1337` on the host).
 */
export function isScribeConfigured(): boolean {
  if (process.env.SCRIBE_URL?.trim()) return true;
  return process.env.NODE_ENV !== "production";
}

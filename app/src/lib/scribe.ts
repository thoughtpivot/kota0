/**
 * Scribe REST client for Flight backends.
 * `SCRIBE_URL` overrides the base URL; when unset, development defaults to `http://127.0.0.1:1337` (host Scribe after `npm run start:docker`).
 * In Docker Compose, set `SCRIBE_URL=http://scribe:1337`, or set `RUNNING_IN_DOCKER=1` / `DOCKER=true` when `SCRIBE_URL` still points at localhost (bundle builds cannot read `/.dockerenv`).
 *
 * **Row envelope:** Every modeled table row uses the same top-level JSON shape (`data` + audit fields). See `@shared/scribeRowEnvelope.ts`
 * (`SCRIBE_DEFAULT_ROW_JSON_SCHEMA`). POST `/{component}`, PUT `/{component}/:id`, and subcomponent PUTs are validated unless disabled.
 */
import "@/lib/env";
import axios, { type AxiosInstance } from "axios";
import {
  SCRIBE_DEFAULT_ROW_JSON_SCHEMA,
  SCRIBE_ROW_ENVELOPE_EXPLANATION,
  ScribeRowEnvelopeSchema,
  type ScribeRowEnvelope,
  type ScribeRowValidationResult,
  validateScribeRowEnvelopeForWrite,
  buildScribeRowEnvelope,
  type BuildScribeRowEnvelopeOptions,
} from "@shared/scribeRowEnvelope.ts";
import {
  createScribeRestClient,
  resolveScribeBaseUrlFromEnv,
  shouldValidateScribeWriteEnvelope,
} from "@shared/scribeRestClient.ts";

export {
  SCRIBE_DEFAULT_ROW_JSON_SCHEMA,
  SCRIBE_ROW_ENVELOPE_EXPLANATION,
  ScribeRowEnvelopeSchema,
  type ScribeRowEnvelope,
  type ScribeRowValidationResult,
  validateScribeRowEnvelopeForWrite,
  buildScribeRowEnvelope,
  type BuildScribeRowEnvelopeOptions,
  createScribeRestClient,
  resolveScribeBaseUrlFromEnv,
};

export const scribe: AxiosInstance = axios.create({
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
});

scribe.interceptors.request.use((config) => {
  config.baseURL = resolveScribeBaseUrlFromEnv();
  const url = config.url ?? "";
  const method = config.method ?? "get";
  if (shouldValidateScribeWriteEnvelope(method, url) && config.data !== undefined && config.data !== null) {
    const v = validateScribeRowEnvelopeForWrite(config.data);
    if (!v.ok) {
      const err = new Error(
        `Scribe row envelope invalid for ${method.toUpperCase()} ${url}: ${v.errors.join("; ")}. ${v.explanation}`,
      );
      err.name = "ScribeRowValidationError";
      return Promise.reject(err);
    }
    config.data = v.value;
  }
  return config;
});

export function getScribeUrl(): string {
  return resolveScribeBaseUrlFromEnv();
}

/**
 * Whether PowerVibe may call Scribe. In **production**, `SCRIBE_URL` must be set explicitly.
 * In **development**, missing `SCRIBE_URL` is OK — requests use {@link resolveScribeBaseUrlFromEnv} (default `http://127.0.0.1:1337` on the host).
 */
export function isScribeConfigured(): boolean {
  if (process.env.SCRIBE_URL?.trim()) return true;
  return process.env.NODE_ENV !== "production";
}

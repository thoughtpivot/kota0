/**
 * Scribe default row envelope — matches `@spytech/scribe` `dist/default.table.schema.json`.
 * Safe for bundle `App.backend.ts` via `import … from '@shared/scribeRowEnvelope'` (no `@/`).
 *
 * **Wire shape vs axios:** HTTP clients expose the response body as `response.data` (axios). Scribe **rows** then use a
 * property **`data`** for the domain JSON (`{ id, data: { …fields… }, date_created, … }`). `@shared/scribeRestClient`
 * normalizes list wrappers and legacy double-nested domains on read; **`forComponent().create`** expects **only** domain
 * fields — it builds this envelope for you.
 */
import { z } from "zod";

/**
 * Default Scribe table row schema (draft-07). Domain fields live inside `data`; the envelope is identical for all components.
 */
export const SCRIBE_DEFAULT_ROW_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema",
  description: "The default table schema to use for all tables",
  type: "object",
  required: ["data", "date_created", "date_modified", "created_by", "modified_by"],
  additionalProperties: false,
  properties: {
    data: { type: "object" },
    date_created: { type: "string", format: "date-time" },
    date_modified: { type: "string", format: "date-time" },
    created_by: { type: "integer" },
    modified_by: { type: "integer" },
  },
} as const;

/** Human-readable summary for logs, 502 payloads, and prompts. */
export const SCRIBE_ROW_ENVELOPE_EXPLANATION =
  "Scribe rows use a fixed envelope: required keys `data` (JSON object — all domain fields go inside), `date_created` and `date_modified` (ISO-8601 date-time strings), `created_by` and `modified_by` (integers; use 0 when no user ids). No other top-level keys. POST /{component} and PUT /{component}/:id send this JSON body.";

const isoDateTimeString = z.string().min(1).refine((s) => !Number.isNaN(Date.parse(s)), {
  message: "must be an ISO-8601 date-time string",
});

/** Validates outbound POST/PUT row bodies. */
export const ScribeRowEnvelopeSchema = z
  .object({
    data: z.record(z.string(), z.unknown()),
    date_created: isoDateTimeString,
    date_modified: isoDateTimeString,
    created_by: z.number().int(),
    modified_by: z.number().int(),
  })
  .strict();

export type ScribeRowEnvelope = z.infer<typeof ScribeRowEnvelopeSchema>;

/** Typical row returned by Scribe `GET /{component}/all` or `GET /{component}/:id` (shape varies slightly by deployment). */
export type ScribeRowRecord<TData = Record<string, unknown>> = {
  id: number;
  data: TData;
  date_created?: string;
  date_modified?: string;
  created_by?: number;
  modified_by?: number;
};

export type ScribeRowValidationResult =
  | { ok: true; value: ScribeRowEnvelope }
  | { ok: false; errors: string[]; explanation: string };

export function validateScribeRowEnvelopeForWrite(body: unknown): ScribeRowValidationResult {
  const parsed = ScribeRowEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const errors = parsed.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "root"}: ${i.message}`);
  return {
    ok: false,
    errors,
    explanation: SCRIBE_ROW_ENVELOPE_EXPLANATION,
  };
}

export type BuildScribeRowEnvelopeOptions = {
  /** Defaults to `new Date().toISOString()` for both timestamps. */
  now?: string;
  created_by?: number;
  modified_by?: number;
};

/** Build a valid POST/PUT envelope from domain `data` only. */
export function buildScribeRowEnvelope(
  data: Record<string, unknown>,
  opts?: BuildScribeRowEnvelopeOptions,
): ScribeRowEnvelope {
  const now = opts?.now ?? new Date().toISOString();
  const created_by = opts?.created_by ?? 0;
  const modified_by = opts?.modified_by ?? 0;
  return {
    data,
    date_created: now,
    date_modified: now,
    created_by,
    modified_by,
  };
}

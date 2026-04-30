import { isAxiosError } from "axios";
import { scribe } from "@/lib/scribe";

const TABLE = "nvibe_app";

export type PowervibeSourceHistoryResult =
  | { supported: true; path: string; data: unknown }
  | { supported: false; tried: string[]; note: string };

/**
 * Probe Scribe REST for row history / time-travel (package-dependent).
 * Each successful PUT on `nvibe_app/:id` should create a revision when history is enabled in Scribe.
 */
export async function probePowervibeAppSourceHistory(scribeRowId: number): Promise<PowervibeSourceHistoryResult> {
  const tried: string[] = [];
  const candidates = [
    `/${TABLE}/${scribeRowId}/history`,
    `/${TABLE}/${scribeRowId}/revisions`,
    `/${TABLE}/${scribeRowId}/versions`,
    `/${TABLE}/${scribeRowId}/audit`,
  ];
  for (const path of candidates) {
    tried.push(path);
    try {
      const res = await scribe.get(path);
      if (res.status >= 200 && res.status < 300) {
        return { supported: true, path, data: res.data };
      }
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 404) continue;
      if (isAxiosError(e) && e.response?.status === 405) continue;
    }
  }
  return {
    supported: false,
    tried,
    note:
      "No known Scribe history route responded for this row. Revisions may still exist in Postgres via Scribe internals; upgrade @spytech/scribe or expose history REST to enable listing.",
  };
}

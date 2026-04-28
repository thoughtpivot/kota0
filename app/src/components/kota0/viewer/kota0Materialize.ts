/**
 * Single canonical on-disk SFC for Vite Kota0 preview HMR.
 * Scribe holds truth; this file is the materialized head for the active app only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeKota0AppSfcForTailwindVite } from "@/subjects/kota0/kota0SfcTailwindSanitize";

export const GENERATED_DIR = path.join(process.cwd(), "app", "src", "kota0", "generated");
export const MATERIALIZED_APP_VUE = path.join(GENERATED_DIR, "App.vue");

export const DEFAULT_K0_SFC = `<script setup lang="ts">
// Hello world starter — iterate in AI or edit in Code.
// Icons: Lucide; Heroicons (@heroicons/vue/…); Phosphor (@phosphor-icons/vue); or Iconify ~icons/{collection}/{icon-id} (unplugin-icons).
// Styling: Tailwind + DaisyUI classes (btn, card, …); optional import { Button } from '@/components/ui/button'; reka-ui / Headless UI as needed.
</script>

<template>
  <div class="kota0-root flex min-h-full items-center justify-center p-6 text-neutral-800 dark:text-neutral-100">
    <p class="text-lg font-medium tracking-tight">Hello, Kota0</p>
  </div>
</template>

<style scoped>
.kota0-root {
  font-family: ui-sans-serif, system-ui, sans-serif;
}
</style>
`;

export function assertMaterializedPathAllowlisted(resolvedPath: string): void {
  const normalized = path.normalize(resolvedPath);
  if (normalized !== path.normalize(MATERIALIZED_APP_VUE)) {
    throw new Error("path_not_allowlisted");
  }
}

/** Write latest Scribe head for preview / editor sync (single file). */
export async function materializeKota0HeadToDisk(source: string): Promise<void> {
  const resolved = path.resolve(MATERIALIZED_APP_VUE);
  assertMaterializedPathAllowlisted(resolved);
  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(resolved, sanitizeKota0AppSfcForTailwindVite(source), "utf8");
}

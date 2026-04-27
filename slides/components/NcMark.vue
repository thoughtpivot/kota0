<script setup lang="ts">
/**
 * nCircle marks bundled via Vite `?url` so logos always resolve in Slidev
 * (raw markdown <img src="../branding/..."> can miss the pipeline).
 */
import horzDarkUrl from "../../branding/logos/horz-dark.svg?url";
import horzLightUrl from "../../branding/logos/horz-light.svg?url";
import sqLogoUrl from "../../branding/logos/sq-logo.png?url";

withDefaults(
  defineProps<{
    variant: "horz-dark" | "horz-light" | "sq";
    /** Square mark only — omit from a11y tree when decorative */
    decorative?: boolean;
  }>(),
  { decorative: false },
);

const srcMap = {
  "horz-dark": horzDarkUrl,
  "horz-light": horzLightUrl,
  sq: sqLogoUrl,
} as const;

const altMap = {
  "horz-dark": "nCircle Tech",
  "horz-light": "nCircle Tech",
  sq: "nCircle",
} as const;
</script>

<template>
  <img
    :src="srcMap[variant]"
    :alt="decorative ? '' : altMap[variant]"
    :aria-hidden="decorative ? 'true' : undefined"
  />
</template>

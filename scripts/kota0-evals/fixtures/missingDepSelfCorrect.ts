import type { Kota0EvalFixture } from "../types";

const LEAFLET_APP = `<script setup lang="ts">
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { onMounted, ref } from "vue";
const mapEl = ref<HTMLElement | null>(null);
onMounted(() => {
  if (!mapEl.value) return;
  L.map(mapEl.value).setView([37.78, -122.41], 12);
});
</script>

<template>
  <div ref="mapEl" class="h-[400px] w-full"></div>
</template>
`;

export const fixture: Kota0EvalFixture = {
  name: "missing-dep-self-correct",
  description:
    "App imports `leaflet` (not in workspace allowlist). Agent should: " +
    "applyChanges → restartPreview → see missing_import → addBundleDependency → restartPreview → finish. " +
    "(Eval stubs the bundle runner so no real Docker / npm runs.)",
  plan: {
    intent: "Add a leaflet map centered on San Francisco",
    changes: [
      { file: "App.vue", summary: "Add leaflet map widget", kind: "rewrite" },
    ],
    preserveExplicitly: [],
    openQuestions: [],
  },
  initialHead: {
    source: `<template><div>Starter</div></template>`,
    backendSource: `export default () => {};`,
    bundleEnv: "",
  },
  scriptedTurns: [
    {
      toolCalls: [
        { name: "applyChanges", args: { source: LEAFLET_APP } },
      ],
    },
    { toolCalls: [{ name: "restartPreview", args: {} }] },
    {
      toolCalls: [
        { name: "addBundleDependency", args: { packageName: "leaflet" } },
      ],
    },
    { toolCalls: [{ name: "restartPreview", args: {} }] },
    {
      toolCalls: [
        {
          name: "finish",
          args: { summary: "Added a leaflet map and installed the leaflet runtime dep." },
        },
      ],
    },
  ],
  expect: {
    finishCalled: true,
    sourceChanged: true,
    backendChanged: false,
    envChanged: false,
    maxSteps: 6,
    onlyTouchesPlannedFiles: true,
  },
};

import type { Kota0EvalFixture } from "../types";

const BASE_SOURCE = `<script setup lang="ts">
import { ref } from "vue";
const count = ref(0);
</script>

<template>
  <main>
    <p>Count: {{ count }}</p>
    <button @click="count++">+</button>
  </main>
</template>
`;

const PATCH_TEXT = `=== PATCH App.vue ===
@@ ... @@
 <template>
   <main>
     <p>Count: {{ count }}</p>
-    <button @click="count++">+</button>
+    <button @click="count++">+1</button>
+    <button @click="count = 0">reset</button>
   </main>
 </template>
`;

export const fixture: Kota0EvalFixture = {
  name: "incremental-modify",
  description:
    "Existing app gets a surgical patch (rename button + add reset). " +
    "Agent should: applyPatch → restartPreview → finish.",
  plan: {
    intent: "Rename + button + add reset button",
    changes: [
      { file: "App.vue", summary: "Patch buttons", kind: "modify" },
    ],
    preserveExplicitly: ["Count state and increment behavior"],
    openQuestions: [],
  },
  initialHead: {
    source: BASE_SOURCE,
    backendSource: `export default () => {};`,
    bundleEnv: "",
  },
  scriptedTurns: [
    {
      toolCalls: [
        { name: "applyPatch", args: { patchText: PATCH_TEXT } },
      ],
    },
    { toolCalls: [{ name: "restartPreview", args: {} }] },
    {
      toolCalls: [
        {
          name: "finish",
          args: { summary: "Renamed the increment button to +1 and added a reset button next to it." },
        },
      ],
    },
  ],
  expect: {
    finishCalled: true,
    sourceChanged: true,
    backendChanged: false,
    envChanged: false,
    maxSteps: 4,
    onlyTouchesPlannedFiles: true,
  },
};

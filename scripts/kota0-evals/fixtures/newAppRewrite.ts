import type { Kota0EvalFixture } from "../types";

const TODO_SOURCE = `<script setup lang="ts">
import { ref } from "vue";
const todos = ref<string[]>([]);
const draft = ref("");
function add() {
  if (!draft.value.trim()) return;
  todos.value.push(draft.value.trim());
  draft.value = "";
}
</script>

<template>
  <main class="p-4">
    <h1 class="text-xl font-bold">Todos</h1>
    <input v-model="draft" @keyup.enter="add" class="border px-2 py-1" />
    <ul class="mt-2">
      <li v-for="(t, i) in todos" :key="i">{{ t }}</li>
    </ul>
  </main>
</template>
`;

const TODO_BACKEND = `import Router from "@koa/router";
const router = new Router();
router.get("/api/kota0-app/hello", (ctx) => {
  ctx.body = { hello: "world" };
});
export default router.routes();
`;

export const fixture: Kota0EvalFixture = {
  name: "new-app-rewrite",
  description:
    "Starter app being rewritten into a todo list via a single applyChanges call. " +
    "Agent should: applyChanges → restartPreview → finish (3 steps).",
  plan: {
    intent: "Build a small todo list with add-by-enter",
    changes: [
      { file: "App.vue", summary: "Rewrite as todo list UI", kind: "rewrite" },
      { file: "App.backend.ts", summary: "Add basic backend stub", kind: "rewrite" },
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
        {
          name: "applyChanges",
          args: { source: TODO_SOURCE, backendSource: TODO_BACKEND },
        },
      ],
    },
    { toolCalls: [{ name: "restartPreview", args: {} }] },
    {
      toolCalls: [
        {
          name: "finish",
          args: { summary: "Rewrote App.vue as a small todo list and stubbed the backend." },
        },
      ],
    },
  ],
  expect: {
    finishCalled: true,
    sourceChanged: true,
    backendChanged: true,
    envChanged: false,
    maxSteps: 4,
    onlyTouchesPlannedFiles: true,
  },
};

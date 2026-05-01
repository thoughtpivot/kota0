<script setup lang="ts">
import {
  CircleStackIcon,
  CodeBracketIcon,
  LightBulbIcon,
  ServerStackIcon,
  SparklesIcon,
  ArrowRightIcon,
  PlusIcon,
} from "@heroicons/vue/24/outline";
import { Bar, Doughnut } from "vue-chartjs";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { registerHomeChartJs } from "./Home.utils";
import PowervibeAppStatusBadge from "@/components/powervibe/apps/PowervibeAppStatusBadge.vue";
import { formatPowervibeAppUpdatedAt } from "@/components/powervibe/apps/powervibeAppFormat";
import {
  buildRevisionActivityFromAppList,
  fetchPowervibeApps,
  fetchPowervibeRevisionActivity,
  type PowervibeRevisionActivityMetrics,
} from "@/components/powervibe/apps/powervibeAppApi";
import type { PowervibeAppSummary } from "@/components/powervibe/apps/powervibeAppTypes";

registerHomeChartJs();

const router = useRouter();
const apps = ref<PowervibeAppSummary[]>([]);
const loading = ref(true);
const listError = ref<string | null>(null);

const activityWindowDays = 14;
const revActivityLoading = ref(true);
const revActivity = ref<PowervibeRevisionActivityMetrics | null>(null);
const revActivityError = ref<string | null>(null);

const appCount = computed(() => apps.value.length);

/** Inferred from list fetch — no separate health API. */
const scribeLine = computed(() => {
  if (loading.value) return { label: "SYNC", detail: "Synchronizing Scribe database…", tone: "sync" as const };
  if (listError.value) return { label: "DEGRADED", detail: listError.value, tone: "bad" as const };
  return { label: "LIVE", detail: "PostgreSQL · Scribe data plane", tone: "ok" as const };
});

onMounted(async () => {
  loading.value = true;
  listError.value = null;
  revActivityError.value = null;
  revActivity.value = null;
  revActivityLoading.value = true;

  const [listR, actR] = await Promise.allSettled([
    fetchPowervibeApps(),
    fetchPowervibeRevisionActivity(activityWindowDays),
  ]);

  if (listR.status === "fulfilled" && listR.value.ok) {
    apps.value = listR.value.apps;
  } else {
    const msg =
      listR.status === "fulfilled" && !listR.value.ok ? listR.value.message : "app_list_unavailable";
    listError.value = msg;
    apps.value = [];
  }
  loading.value = false;

  if (actR.status === "fulfilled" && actR.value.ok) {
    revActivity.value = actR.value.metrics;
    revActivityError.value = null;
  } else {
    const batchFailed =
      actR.status === "rejected" ||
      (actR.status === "fulfilled" && (actR.value.ok === false));
    const batchMessage =
      actR.status === "fulfilled" && !actR.value.ok ? actR.value.message : "revision_metrics_unavailable";

    if (
      batchFailed &&
      listR.status === "fulfilled" &&
      listR.value.ok &&
      listR.value.apps.length > 0
    ) {
      try {
        revActivity.value = await buildRevisionActivityFromAppList(
          listR.value.apps,
          activityWindowDays,
        );
        revActivityError.value = null;
      } catch {
        revActivityError.value = batchMessage;
      }
    } else {
      revActivityError.value = batchMessage;
    }
  }
  revActivityLoading.value = false;
});

const goPowervibe = () => void router.push({ name: "powervibe" });
const openAppInWorkspace = (appId: string) => void router.push({ name: "powervibe", query: { app: appId } });
const scrollToApps = () => document.getElementById("home-apps")?.scrollIntoView({ behavior: "smooth" });
const scrollToAnalytics = () => document.getElementById("home-analytics")?.scrollIntoView({ behavior: "smooth" });
const scrollToPlatform = () => document.getElementById("home-platform")?.scrollIntoView({ behavior: "smooth" });

/** Grouped labels aligned with root package.json — not every dependency listed; extend template separately. */
const stackGroups: { title: string; items: string[] }[] = [
  {
    title: "Core SPA",
    items: ["Vue 3", "Vue Router", "Vite", "VueUse"],
  },
  {
    title: "Styling & UI",
    items: [
      "Tailwind CSS 4",
      "DaisyUI",
      "Headless UI Vue",
      "Reka UI",
      "Heroicons",
      "Lucide Vue",
      "Phosphor Vue",
      "CVA",
      "tailwind-merge",
      "unplugin-icons",
    ],
  },
  {
    title: "Charts",
    items: ["Chart.js", "vue-chartjs"],
  },
  {
    title: "Editing & AI assist",
    items: ["CodeMirror", "vue-codemirror", "Shiki", "markdown-it", "DOMPurify", "Google GenAI", "Zod"],
  },
  {
    title: "Server & delivery",
    items: ["Koa", "@koa/router", "Flight"],
  },
];

const statusChartData = computed(() => {
  const by: Record<string, number> = {};
  for (const a of apps.value) {
    by[a.status] = (by[a.status] ?? 0) + 1;
  }
  const labels = Object.keys(by);
  const data = Object.values(by);
  const colors: Record<string, string> = {
    active: "rgba(16, 185, 129, 0.75)",
    applied: "rgba(14, 165, 233, 0.75)",
    draft: "rgba(245, 158, 11, 0.8)",
    error: "rgba(244, 63, 94, 0.75)",
  };
  const backgroundColor = labels.map((s) => colors[s] ?? "rgba(148, 163, 184, 0.6)");
  return {
    labels: labels.length ? labels : ["—"],
    datasets: [
      {
        data: data.length ? data : [0],
        backgroundColor: data.length ? backgroundColor : ["rgba(71, 85, 105, 0.4)"],
        borderColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        hoverOffset: 6,
      },
    ],
  };
});

const fallbackDayLabels = (): string[] => {
  const n = activityWindowDays;
  const now = new Date();
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  const out: string[] = [];
  for (let j = 0; j < n; j++) {
    const d = new Date(start);
    d.setDate(d.getDate() + j);
    out.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  return out;
};

const activityChartData = computed(() => {
  const m = revActivity.value;
  const labels = m?.dayLabels ?? fallbackDayLabels();
  const n = labels.length;
  const counts = m ? [...m.dayCounts] : new Array(n).fill(0);
  return {
    labels,
    datasets: [
      {
        label: "Scribe source revisions (time travel)",
        data: counts,
        backgroundColor: "rgba(59, 130, 246, 0.45)",
        borderColor: "rgba(59, 130, 246, 0.9)",
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 28,
      },
    ],
  };
});

const chartText = "#e2e8f0";
const chartGrid = "rgba(255,255,255,0.06)";

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "58%",
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { color: chartText, font: { size: 10 }, usePointStyle: true, padding: 12 },
    },
  },
};

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: { color: chartGrid },
      ticks: { color: chartText, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
    },
    y: {
      beginAtZero: true,
      grid: { color: chartGrid },
      ticks: { color: chartText, stepSize: 1, precision: 0 },
    },
  },
  plugins: {
    legend: { display: true, labels: { color: chartText, font: { size: 10 } } },
  },
};

const hasApps = computed(() => !loading.value && !listError.value && apps.value.length > 0);

/** Shown with app-list failures — /home uses the same `/api/powervibe/*` client as the workspace. */
const powervibeFetchDevHint = computed(() => {
  if (!import.meta.env.DEV || !listError.value) return null;
  const port = typeof window !== "undefined" ? window.location.port : "";
  if (port === "3000") {
    return "Port 3000 is Flight (Koa) only — it does not serve this SPA’s /api proxy. Open http://127.0.0.1:3001 (Vite from npm run start:app), then return to /home.";
  }
  return "Restart npm run start:app after backend changes; run npm run start:docker for Scribe/Postgres. On this origin, open /api/powervibe/diagnostics — it should return JSON from Flight.";
});
</script>

<template>
  <div
    class="min-h-dvh font-sans antialiased bg-[#0F1115] text-slate-200 selection:bg-blue-500/30 selection:text-white"
  >
    <nav
      class="sticky top-0 z-50 border-b border-white/5 bg-[#0F1115]/80 backdrop-blur-xl supports-[backdrop-filter]:bg-[#0F1115]/60"
    >
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <router-link
          :to="{ name: 'home' }"
          class="powervibe-wordmark group relative flex items-baseline gap-0.5 no-underline"
        >
          <span
            class="font-display text-xl font-semibold tracking-[-0.03em] text-slate-100 sm:text-2xl"
            >PowerVibe</span
          >
          <span
            aria-hidden="true"
            class="pointer-events-none absolute -inset-x-0.5 -inset-y-1 rounded bg-blue-500/0 blur-lg transition group-hover:bg-blue-500/10"
          />
        </router-link>
        <div class="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            class="hidden h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-[#3B82F6] focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/40 md:inline-flex"
            @click="scrollToAnalytics"
          >
            Metrics
          </button>
          <button
            type="button"
            class="hidden h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-[#3B82F6] focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/40 md:inline-flex"
            @click="scrollToPlatform"
          >
            Platform
          </button>
          <button
            type="button"
            class="hidden h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-[#3B82F6] focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/40 md:inline-flex"
            @click="scrollToApps"
          >
            Directory
          </button>
          <button
            type="button"
            class="powervibe-cta h-9 rounded-md border-0 bg-[#3B82F6] px-3.5 text-white shadow-lg shadow-blue-500/25 transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-400/50"
            @click="goPowervibe"
          >
            <span class="font-display font-semibold tracking-[-0.02em]">PowerVibe</span>
            <span class="font-mono text-[0.7rem] font-medium opacity-95">.workspace</span>
          </button>
        </div>
      </div>

      <div
        class="border-b border-white/5 bg-[#0B0C10]/80 px-4 py-2.5 sm:px-6"
        aria-label="System status"
      >
        <div
          class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500"
        >
          <span class="text-slate-600">Workspace command</span>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-slate-300">
            <div class="flex items-center gap-2">
              <span class="text-slate-500">Apps</span>
              <span class="font-mono text-sm tabular-nums text-slate-100">{{ appCount }}</span>
            </div>
            <div class="flex min-w-0 max-w-sm items-center gap-2">
              <span class="shrink-0 text-slate-500">Scribe</span>
              <span
                class="font-mono text-[10px] tabular-nums"
                :class="{
                  'text-amber-400/90': scribeLine.tone === 'sync',
                  'text-rose-400/90': scribeLine.tone === 'bad',
                  'text-emerald-400/90': scribeLine.tone === 'ok',
                }"
                >{{ scribeLine.label }}</span
              >
              <span class="truncate text-[9px] font-normal normal-case tracking-normal text-slate-500">{{
                scribeLine.detail
              }}</span>
            </div>
            <div class="hidden items-center gap-2 sm:flex">
              <span class="text-slate-500">Flight</span>
              <span class="font-mono text-[10px] text-slate-400">12factor · container parity</span>
            </div>
          </div>
        </div>
      </div>
    </nav>

    <main>
      <section
        class="relative overflow-hidden border-b border-white/5 bg-gradient-to-b from-[#0F1115] to-[#0a0b0e] py-20 sm:py-28"
      >
        <div
          class="pointer-events-none absolute inset-0 opacity-[0.12]"
          style="
            background-image: radial-gradient(rgba(59, 130, 246, 0.35) 0.5px, transparent 0.5px);
            background-size: 20px 20px;
          "
        />
        <div class="relative mx-auto max-w-5xl px-4 text-center sm:px-6">
          <p
            class="mb-3 inline-flex items-center rounded border border-white/5 bg-white/[0.04] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.25em] text-slate-500"
          >
            PowerVibe · vibe-coding workspace
          </p>
          <p
            class="mb-6 text-[10px] font-medium uppercase tracking-[0.3em] text-slate-600"
          >
            PROMPT · PREVIEW · APPLY
          </p>
          <p class="mb-6 text-[11px] text-slate-500">
            From
            <a
              href="https://www.thoughtpivot.com"
              class="font-medium text-slate-400 underline-offset-4 hover:text-[#3B82F6] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              >ThoughtPivot</a
            >
            — a generic engine you can embed in bespoke programs.
          </p>
          <h1
            class="font-display text-4xl font-light leading-[1.12] tracking-tight text-slate-100 sm:text-5xl md:text-6xl"
          >
            Vibe-first web apps. <br class="hidden sm:block" />
            <span class="text-[#3B82F6]">Simple</span> by design.
          </h1>
          <p class="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            PowerVibe is intentionally <strong class="font-medium text-slate-200">single-user</strong> and
            <strong class="font-medium text-slate-200">local-first</strong>: prompts in,
            <strong class="font-medium text-slate-200">real Vue applications</strong> out — persisted through
            Scribe and materialized to disk-backed bundles. Partners use it as a repeatable vibe-coding core,
            not a locked vertical product. Hosted deploy, multi-tenant auth, and third-party integrations are
            <span class="text-slate-300">roadmap</span>, not what this PoC ships today.
          </p>
          <div class="mt-10 flex flex-wrap justify-center gap-3 sm:gap-4">
            <button
              type="button"
              class="powervibe-cta h-12 gap-0.5 rounded-md border-0 bg-[#3B82F6] px-8 text-base text-white shadow-xl shadow-blue-500/20 transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-400/50"
              @click="goPowervibe"
            >
              <span class="font-display text-lg font-semibold tracking-[-0.02em]">PowerVibe</span>
              <span class="font-mono text-sm font-medium">.workspace</span>
            </button>
            <button
              type="button"
              class="inline-flex h-12 items-center justify-center rounded-md border border-white/10 bg-transparent px-8 text-base text-slate-200 transition-colors hover:bg-white/5 focus-visible:outline focus-visible:ring-2 focus-visible:ring-slate-400/30"
              @click="scrollToApps"
            >
              App directory
            </button>
            <button
              type="button"
              class="inline-flex h-12 items-center justify-center rounded-md border border-white/10 bg-transparent px-8 text-base text-slate-200 transition-colors hover:bg-white/5 focus-visible:outline focus-visible:ring-2 focus-visible:ring-slate-400/30"
              @click="scrollToPlatform"
            >
              Platform
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="hasApps"
        id="home-analytics"
        class="border-b border-white/5 py-10 sm:py-14"
      >
        <div class="mx-auto max-w-7xl px-4 sm:px-6">
          <h2
            class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500"
          >
            Command metrics
          </h2>
          <p class="mt-1 text-sm text-slate-500">
            Derived from the live app registry. Stories with *data* — no mock latency claims.
          </p>
          <div class="mt-6 grid gap-4 lg:grid-cols-2">
            <div
              class="flex min-h-[280px] flex-col rounded-lg border border-white/5 bg-[#0B0C10] p-4"
            >
              <h3
                class="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Status mix
              </h3>
              <div class="relative min-h-0 flex-1 pt-2">
                <Doughnut
                  v-if="apps.length > 0"
                  :data="statusChartData"
                  :options="doughnutOptions"
                />
              </div>
            </div>
            <div
              class="flex min-h-[280px] flex-col rounded-lg border border-white/5 bg-[#0B0C10] p-4"
            >
              <h3
                class="text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Build activity
              </h3>
              <p
                v-if="revActivity"
                class="text-[10px] leading-relaxed text-slate-600"
              >
                <span class="font-mono tabular-nums text-slate-400">{{
                  revActivity.totalRevisions
                }}</span>
                *source* revisions in Scribe row history, bucketed by
                *snapshot* <span class="text-slate-500">(row `date_modified` / `date_created`)</span> per
                revision, last
                <span class="font-mono tabular-nums">{{ revActivity.days }}</span> local days. History on
                <span class="font-mono tabular-nums"
                  >{{ revActivity.appsWithHistory }}/{{ revActivity.appsTotal }}</span
                >
                apps. <span v-if="revActivity.usedRegistryFallback" class="text-slate-500"
                  >Gaps in row timestamps are filled with each app’s registry *last touch* to preserve revision
                  *volume*.</span
                >
                <span
                  v-else-if="revActivity.binnedRevisions < revActivity.totalRevisions"
                  class="text-slate-500"
                >
                  {{ revActivity.binnedRevisions }} of
                  {{ revActivity.totalRevisions }} revisions had resolvable event times in this run.
                </span>
              </p>
              <p
                v-else-if="revActivityError"
                class="text-[10px] text-amber-200/80"
              >
                {{ revActivityError }}
              </p>
              <p
                v-else
                class="text-[10px] text-slate-600"
              >
                {{ revActivityLoading ? "Aggregating Scribe *time-travel* (row history)…" : "—" }}
              </p>
              <div class="relative min-h-0 flex-1 pt-2">
                <Bar
                  v-if="apps.length > 0"
                  :data="activityChartData"
                  :options="barOptions"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="home-apps" class="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div class="mb-8 border-b border-white/5 pb-6">
          <h2 class="text-2xl font-light tracking-tight text-slate-100 sm:text-3xl">
            App directory
          </h2>
          <p
            class="mt-1 text-sm text-slate-500"
          >
            *IDE*-dense registry. Open a subject in <span class="font-mono text-slate-400">PowerVibe.workspace</span>.
          </p>
        </div>

        <div
          v-if="listError"
          class="rounded-lg border border-rose-500/20 bg-rose-950/30 p-6 text-center"
        >
          <p class="text-sm font-medium text-rose-300/90">{{ listError }}</p>
          <p
            v-if="powervibeFetchDevHint"
            class="mx-auto mt-3 max-w-lg text-xs leading-relaxed text-slate-500"
          >
            {{ powervibeFetchDevHint }}
          </p>
          <button
            type="button"
            class="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-white/10 px-4 text-sm text-slate-200 transition-colors hover:bg-white/5 focus-visible:outline focus-visible:ring-2 focus-visible:ring-rose-400/30"
            @click="goPowervibe"
          >
            PowerVibe.workspace
          </button>
        </div>

        <div
          v-else-if="loading"
          class="flex flex-col items-center justify-center rounded-lg border border-white/5 bg-[#0B0C10] py-24"
        >
          <div
            class="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent"
          />
          <p class="mt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
            Synchronizing with Scribe…
          </p>
        </div>

        <div
          v-else-if="apps.length === 0"
          class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-[#0B0C10]/50 py-20"
        >
          <div class="rounded-full border border-white/5 bg-white/[0.04] p-4">
            <PlusIcon class="size-8 text-slate-500" />
          </div>
          <h3
            class="mt-4 text-lg font-medium text-slate-200"
          >
            No apps in registry
          </h3>
          <p class="mt-1 max-w-md text-center text-sm text-slate-500">
            The command center has nothing to *route* yet. *Ship* your first *subject* from
            PowerVibe.workspace.
          </p>
          <button
            type="button"
            class="powervibe-cta mt-6 gap-0.5 rounded-md bg-[#3B82F6] px-4 py-2.5 text-white transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-400/50"
            @click="goPowervibe"
          >
            <span class="font-display font-semibold">PowerVibe</span>
            <span class="font-mono text-sm">.workspace</span>
          </button>
        </div>

        <div
          v-else
          class="overflow-hidden rounded-lg border border-white/5 bg-[#0B0C10] shadow-2xl shadow-black/50"
        >
          <div class="overflow-x-auto">
            <table class="w-full min-w-[42rem] text-left text-sm">
              <thead>
                <tr
                  class="border-b border-white/5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500"
                >
                  <th class="px-4 py-3 sm:px-6">Application</th>
                  <th class="px-4 py-3 sm:px-6">Status</th>
                  <th class="px-4 py-3 sm:px-6">Last build</th>
                  <th class="px-4 py-3 text-right sm:px-6">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="a in apps"
                  :key="a.app_id"
                  class="group border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                >
                  <td class="px-4 py-3.5 sm:px-6">
                    <div class="flex flex-col gap-0.5">
                      <span
                        class="cursor-pointer font-medium text-slate-100 group-hover:text-[#3B82F6] transition-colors"
                        @click="openAppInWorkspace(a.app_id)"
                        >{{ a.name }}</span
                      >
                      <code
                        class="font-mono text-[10px] text-slate-500 tabular-nums"
                        >id_{{ a.app_id.slice(0, 8) }}…</code
                      >
                    </div>
                  </td>
                  <td class="px-4 py-3.5 sm:px-6">
                    <PowervibeAppStatusBadge :status="a.status" />
                  </td>
                  <td
                    class="px-4 py-3.5 font-mono text-xs text-slate-500 tabular-nums sm:px-6"
                  >
                    {{ formatPowervibeAppUpdatedAt(a.updatedAt) }}
                  </td>
                  <td
                    class="px-4 py-3.5 text-right sm:px-6"
                  >
                    <button
                      type="button"
                      class="inline-flex h-9 items-center justify-center rounded-md px-2 text-sm font-medium text-[#3B82F6] transition-colors hover:bg-white/5 hover:text-blue-300 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500/40"
                      @click="openAppInWorkspace(a.app_id)"
                    >
                      Execute
                      <ArrowRightIcon class="ml-1.5 size-3.5" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        id="home-platform"
        class="border-t border-white/5 bg-[#0B0C10] py-16 sm:py-20"
      >
        <div class="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Platform
          </h2>
          <p class="mt-3 max-w-3xl text-lg font-light leading-relaxed text-slate-200 sm:text-xl">
            <strong class="font-semibold text-slate-100">Flight</strong> (delivery and runtime posture) and
            <strong class="font-semibold text-slate-100">Scribe</strong> (Postgres-backed registry and row
            history) are <span class="text-slate-300">ThoughtPivot technologies</span> — generic building blocks,
            the same way PowerVibe stays domain-agnostic for partners who want their own vibe-coding surface.
          </p>

          <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-lg border border-white/5 bg-[#0F1115]/80 p-4">
              <div class="mb-2 inline-flex size-9 items-center justify-center rounded-md border border-white/5 bg-white/[0.04]">
                <LightBulbIcon class="size-4 text-[#3B82F6]" />
              </div>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Subject-based thinking
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-500">
                Boundaries and artifacts read the same way for people and models — fewer ambiguous “pages.”
              </p>
            </div>
            <div class="rounded-lg border border-white/5 bg-[#0F1115]/80 p-4">
              <div class="mb-2 inline-flex size-9 items-center justify-center rounded-md border border-white/5 bg-white/[0.04]">
                <ServerStackIcon class="size-4 text-[#3B82F6]" />
              </div>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Twelve-factor habits
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-500">
                Config, logs, and parity-minded defaults — production-shaped discipline in a PoC shell.
              </p>
            </div>
            <div class="rounded-lg border border-white/5 bg-[#0F1115]/80 p-4">
              <div class="mb-2 inline-flex size-9 items-center justify-center rounded-md border border-white/5 bg-white/[0.04]">
                <CodeBracketIcon class="size-4 text-[#3B82F6]" />
              </div>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Simple architecture
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-500">
                Small surfaces, clear data paths — complexity only where the product earns it.
              </p>
            </div>
            <div class="rounded-lg border border-white/5 bg-[#0F1115]/80 p-4">
              <div class="mb-2 inline-flex size-9 items-center justify-center rounded-md border border-white/5 bg-white/[0.04]">
                <SparklesIcon class="size-4 text-[#3B82F6]" />
              </div>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
                AI grounding & skills
              </h3>
              <p class="mt-2 text-sm leading-relaxed text-slate-500">
                Repeatable prompts and tooling so assistants stay aligned with how the workspace actually works.
              </p>
            </div>
          </div>

          <div class="mt-12 grid gap-8 md:grid-cols-3">
            <div class="space-y-3">
              <div
                class="inline-flex size-11 items-center justify-center rounded-lg border border-white/5 bg-white/[0.04]"
              >
                <ServerStackIcon class="size-5 text-[#3B82F6]" />
              </div>
              <h3 class="text-sm font-semibold text-slate-200">Flight</h3>
              <p class="text-sm leading-relaxed text-slate-500">
                ThoughtPivot app server: Koa routes, embedded Vite in development, and the same delivery
                posture we use for serious workloads — not a throwaway preview shim.
              </p>
            </div>
            <div class="space-y-3">
              <div
                class="inline-flex size-11 items-center justify-center rounded-lg border border-white/5 bg-white/[0.04]"
              >
                <CodeBracketIcon class="size-5 text-[#3B82F6]" />
              </div>
              <h3 class="text-sm font-semibold text-slate-200">Scribe</h3>
              <p class="text-sm leading-relaxed text-slate-500">
                ThoughtPivot data plane on <strong class="font-medium text-slate-400">PostgreSQL</strong>:
                durable app registry, chat history, and row-level history the workspace materializes from.
              </p>
            </div>
            <div class="space-y-3">
              <div
                class="inline-flex size-11 items-center justify-center rounded-lg border border-white/5 bg-white/[0.04]"
              >
                <CircleStackIcon class="size-5 text-[#3B82F6]" />
              </div>
              <h3 class="text-sm font-semibold text-slate-200">Runtime envelope</h3>
              <p class="text-sm leading-relaxed text-slate-500">
                <strong class="font-medium text-slate-400">Docker Compose</strong> brings up Postgres, Redis,
                and Scribe locally; bundle apps use their own Flight port with Vue + Vite templates on disk.
              </p>
            </div>
          </div>

          <div class="mt-14 border-t border-white/5 pt-12">
            <h3 class="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              What ships in the workspace (today)
            </h3>
            <p class="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
              Labels mirror this repo’s dependencies — grouped for scanning, not an exhaustive package list.
              Generated apps follow the <span class="font-mono text-slate-400">powervibe-bundle</span> template
              (Vue + Vite + Flight on the bundle port). Add libraries by extending that template; not every npm
              package is pre-wired.
            </p>
            <div class="mt-8 space-y-8">
              <div v-for="g in stackGroups" :key="g.title">
                <h4 class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                  {{ g.title }}
                </h4>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span
                    v-for="item in g.items"
                    :key="item"
                    class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-slate-300"
                  >
                    {{ item }}
                  </span>
                </div>
              </div>
            </div>
            <p class="mt-10 max-w-3xl text-sm leading-relaxed text-slate-500">
              That stack is aimed at <strong class="font-medium text-slate-300">real web products</strong>
              — dashboards, internal tools, customer-facing SPAs. Need something radically different (say a 2D
              game loop with <span class="font-mono text-slate-400">Excalibur.js</span>)? Same integration pattern:
              bring the runtime, wire the bundle — it is intentionally not bundled here so the core stays small.
            </p>
          </div>
        </div>
      </section>

      <section class="border-t border-white/5 px-4 py-12 sm:px-6">
        <div class="mx-auto max-w-3xl text-center">
          <p class="text-base font-light leading-relaxed text-slate-500 sm:text-lg">
            One loop: Scribe holds truth; Flight serves it with production-shaped habits — so “vibe” stays
            accountable to something durable on disk.
          </p>
        </div>
      </section>
    </main>

    <footer
      class="border-t border-white/5 bg-[#0a0a0b] py-12 sm:py-14"
    >
      <div
        class="mx-auto max-w-2xl px-4 sm:px-6"
      >
        <h2
          class="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
        >
          About
        </h2>
        <p
          class="mt-4 text-center text-lg font-light text-slate-200"
        >
          <a
            href="https://www.thoughtpivot.com"
            class="text-slate-100 underline decoration-blue-500/30 underline-offset-4 transition hover:text-white hover:decoration-blue-400/60"
            target="_blank"
            rel="noopener noreferrer"
            >ThoughtPivot</a
          >
          builds generic infrastructure — Flight for delivery, Scribe for durable data — so teams can ship
          software with disciplined AI and clear architecture without reinventing the runtime every time.
        </p>
        <p
          class="mt-4 text-center text-sm leading-relaxed text-slate-500"
        >
          <span class="font-medium text-slate-400">PowerVibe</span> is a
          <span class="text-slate-300">vibe-first workspace engine</span> in this repo: prompt-native editing,
          preview, and apply flows on top of that stack. The command center and PowerVibe.workspace here are a
          <span class="text-slate-400">proof of concept</span> — local, single-user, no managed cloud deploy path
          — meant to be repurposed or white-labeled for partner programs.
        </p>
        <p
          class="mt-8 text-center text-[10px] text-slate-600"
        >
          &copy; {{ new Date().getFullYear() }} ThoughtPivot
          <span
            class="text-slate-500"
            >&middot; PoC &middot; not production</span
          >
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.font-display {
  font-family: var(--font-display, "DM Serif Display", ui-serif, Georgia, serif);
}

.powervibe-wordmark {
  text-shadow:
    0 0 24px rgba(59, 130, 246, 0.18),
    0 0 1px rgba(255, 255, 255, 0.08);
}

.powervibe-wordmark:hover .font-display {
  background: linear-gradient(90deg, #f8fafc 0%, #e2e8f0 45%, #3b82f6 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.powervibe-cta {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  column-gap: 0.1rem;
}
</style>

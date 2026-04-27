<script setup lang="ts">
import { inject } from "vue";
import { ncClientStripKey } from "../clientInjectKeys";

const assets = inject(ncClientStripKey, null);

if (!assets) {
  console.warn("[ClientStrip] Missing provide from slides/setup/main.ts — strip will be empty.");
}

const manifest = assets?.manifest ?? { title: "Partners", clients: [] as { id: string; name: string; logoFile: string }[] };
const logoUrls = assets?.logoUrls ?? {};

function logoUrl(logoFile: string): string {
  const entry = Object.entries(logoUrls).find(([key]) => key.endsWith(logoFile));
  return entry?.[1] ?? "";
}
</script>

<template>
  <div v-if="manifest.clients.length" class="nc-client-strip">
    <p class="nc-client-strip__label">{{ manifest.title }}</p>
    <div class="nc-client-strip__grid">
      <figure v-for="c in manifest.clients" :key="c.id" class="nc-client-strip__cell">
        <img :src="logoUrl(c.logoFile)" :alt="c.name" class="nc-client-strip__img" loading="lazy" />
      </figure>
    </div>
  </div>
  <p v-else class="nc-client-strip__label">Partner logos unavailable — check slides setup.</p>
</template>

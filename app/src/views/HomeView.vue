<script setup lang="ts">
import { RouterLink, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import horzLightUrl from "../../../branding/logos/horz-light.svg?url";

const router = useRouter();

function goNvibe() {
  void router.push({ name: "nvibe" });
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background text-foreground">
    <header
      class="flex flex-col items-center gap-8 px-6 py-20 text-center"
      style="background-color: var(--nc-hero-bg); color: var(--nc-hero-text)"
    >
      <img
        :src="horzLightUrl"
        alt="nCircle Tech"
        class="h-12 w-auto max-w-[min(100%,20rem)] md:h-14"
        width="280"
        height="56"
      />
      <h1 class="max-w-2xl text-balance font-display text-3xl font-normal leading-tight tracking-tight md:text-4xl">
        Vibe coding — plan first, build next
      </h1>
      <p class="max-w-lg text-pretty text-sm font-medium md:text-base" style="color: var(--nc-hero-subtle)">
        Open <strong>nVibe</strong> on the next screen: Prompt on the left, live Preview and Code on the right.
      </p>
      <Button type="button" size="lg" class="font-semibold" @click="goNvibe">Create new app</Button>
    </header>

    <footer class="mt-auto border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
      <RouterLink to="/marketing" class="underline-offset-4 hover:underline">nCircle marketing shell</RouterLink>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { Button } from "@/components/ui/button";
import { clientLogoUrl, clientManifest } from "@/lib/clientManifest";
import horzLightUrl from "../../../branding/logos/horz-light.svg?url";
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background text-foreground">
    <p class="border-b border-border bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground">
      <RouterLink to="/" class="font-medium text-primary underline-offset-4 hover:underline">Back to vibe app</RouterLink>
    </p>
    <header
      class="flex flex-col items-center gap-6 px-6 py-16 text-center"
      style="background-color: var(--nc-hero-bg); color: var(--nc-hero-text)"
    >
      <img
        :src="horzLightUrl"
        alt="nCircle Tech"
        class="h-12 w-auto max-w-[min(100%,20rem)] md:h-14"
        width="280"
        height="56"
      />
      <h1
        class="max-w-3xl text-balance text-3xl font-normal leading-tight tracking-tight md:text-4xl font-display"
      >
        3D Web &amp; mobile applications for AEC and manufacturing
      </h1>
      <p class="max-w-xl text-pretty text-sm font-medium md:text-base" style="color: var(--nc-hero-subtle)">
        Proof-of-concept shell — same colors, type, and marks as ncircletech.com, sourced only from
        <code class="rounded px-1 py-0.5" style="background-color: var(--nc-hero-chip-bg)">branding/</code>.
      </p>
    </header>

    <section class="border-b border-border bg-muted/40 px-6 py-12">
      <div class="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div class="max-w-xl space-y-2">
          <h2 class="text-xl font-bold tracking-tight text-foreground font-display md:text-2xl">What we do</h2>
          <p class="text-sm leading-relaxed text-muted-foreground md:text-base">
            Dedicated teams, end-to-end product development, ML/AI, and BIM modeling — aligned with how nCircle Tech
            presents its practice on the public site.
          </p>
        </div>
        <img
          :src="horzLightUrl"
          alt="nCircle Tech"
          class="h-10 w-auto self-start md:self-center"
          width="200"
          height="40"
        />
      </div>
    </section>

    <section class="px-6 py-10">
      <p class="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {{ clientManifest.title }}
      </p>
      <div
        class="mx-auto grid max-w-5xl grid-cols-2 items-center justify-items-center gap-x-8 gap-y-10 sm:grid-cols-4"
      >
        <figure
          v-for="c in clientManifest.clients"
          :key="c.id"
          class="flex h-14 w-full max-w-[8.5rem] items-center justify-center"
        >
          <img
            :src="clientLogoUrl(c.logoFile)"
            :alt="c.name"
            class="max-h-12 w-auto max-w-full object-contain opacity-90 grayscale transition hover:opacity-100 hover:grayscale-0"
            loading="lazy"
          />
        </figure>
      </div>
    </section>

    <footer class="mt-auto border-t border-border bg-card px-6 py-10">
      <div class="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
        <p class="text-sm text-muted-foreground">Ready to explore the full platform story?</p>
        <Button as="a" class="no-underline" href="https://ncircletech.com" rel="noopener noreferrer" target="_blank">
          Talk to us
        </Button>
      </div>
    </footer>
  </div>
</template>

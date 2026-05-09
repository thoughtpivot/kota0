<template>
  <div class="nc-kota0-pillars">
    <div class="nc-kota0-pillars__col" v-for="c in columns" :key="c.heading">
      <div class="nc-kota0-pillars__thumb-wrap">
        <img :src="c.img" :alt="c.alt" class="nc-kota0-pillars__img" loading="lazy" />
      </div>
      <h3 class="nc-kota0-pillars__h">{{ c.heading }}</h3>
      <p class="nc-kota0-pillars__p">{{ c.text }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const columns = [
  {
    heading: "Flight & Koa",
    text: "Lean, RESTful backend workers that scale horizontally across customer cloud appliances.",
    img: "https://static.vecteezy.com/system/resources/thumbnails/077/743/916/small_2x/blue-computer-racks-cloud-computing-center-video.jpg",
    alt: "Server room racks",
  },
  {
    heading: "Vue 3 & Tailwind",
    text: "Consumer-grade UI flexibility. Theme any app to match corporate identity in minutes.",
    img: "https://www.ropstam.com/wp-content/uploads/2024/01/Best-IDEs-for-Faster-Vue.js-Development.jpg",
    alt: "Vue development workspace",
  },
  {
    heading: "Scribe & Postgres",
    text: "Component-based data modeling — auditable, versioned, inspectable application state.",
    img: "https://www.mdpi.com/applsci/applsci-16-00009/article_deploy/html/images/applsci-16-00009-g008-550.jpg",
    alt: "Network data visualization",
  },
] as const;
</script>

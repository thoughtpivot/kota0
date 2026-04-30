<template>
  <ul class="nc-powervibe-src">
    <li v-for="r in rows" :key="r.url" class="nc-powervibe-src__row">
      <img v-if="r.thumb" :src="r.thumb" :alt="''" class="nc-powervibe-src__thumb" width="64" height="40" loading="lazy" />
      <div class="nc-powervibe-src__meta">
        <a :href="r.url" class="nc-powervibe-src__url" target="_blank" rel="noopener noreferrer">{{ r.url }}</a>
        <span class="nc-powervibe-src__host">{{ r.host }}</span>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
const rows = [
  {
    thumb: "https://www.ropstam.com/wp-content/uploads/2024/01/Best-IDEs-for-Faster-Vue.js-Development.jpg",
    url: "https://www.ropstam.com/wp-content/uploads/2024/01/Best-IDEs-for-Faster-Vue.js-Development.jpg",
    host: "ropstam.com",
  },
  {
    thumb: "https://static.vecteezy.com/system/resources/thumbnails/077/743/916/small_2x/blue-computer-racks-cloud-computing-center-video.jpg",
    url: "https://static.vecteezy.com/system/resources/thumbnails/077/743/916/small_2x/blue-computer-racks-cloud-computing-center-video.jpg",
    host: "vecteezy.com",
  },
  {
    thumb: "https://www.mdpi.com/applsci/applsci-16-00009/article_deploy/html/images/applsci-16-00009-g008-550.jpg",
    url: "https://www.mdpi.com/applsci/applsci-16-00009/article_deploy/html/images/applsci-16-00009-g008-550.jpg",
    host: "mdpi.com",
  },
  {
    thumb: "https://static.vecteezy.com/system/resources/thumbnails/065/484/194/small_2x/young-photographer-editing-photos-on-a-modern-pc-setup-in-agency-office-using-color-grading-and-retouching-technique-ideal-workspace-for-a-digital-designer-art-photography-camera-a-video.jpg",
    url: "https://static.vecteezy.com/system/resources/thumbnails/065/484/194/small_2x/young-photographer-editing-photos-on-a-modern-pc-setup-in-agency-office-using-color-grading-and-retouching-technique-ideal-workspace-for-a-digital-designer-art-photography-camera-a-video.jpg",
    host: "vecteezy.com",
  },
] as const;
</script>

<template>
  <div class="nc-kota0-trend">
    <div class="nc-kota0-trend__chart" aria-label="Conceptual trend: ownership vs. SaaS rent">
      <svg class="nc-kota0-trend__svg" viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="ncKota0TrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--nc-primary, #164194)" stop-opacity="0.3" />
            <stop offset="100%" stop-color="var(--nc-primary, #164194)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M 0 100 Q 100 90 120 70 T 200 55 T 320 20 L 400 5 L 400 120 L 0 120 Z"
          fill="url(#ncKota0TrendFill)"
        />
        <path
          d="M 0 100 Q 100 90 120 70 T 200 55 T 320 20 L 400 5"
          fill="none"
          stroke="var(--nc-primary, #164194)"
          stroke-width="2.5"
        />
      </svg>
      <div class="nc-kota0-trend__labels">
        <span>2023</span>
        <span>2025 (AI pivot)</span>
        <span>2026 (Kota0)</span>
      </div>
    </div>
    <p class="nc-kota0-trend__foot">
      <em>Enterprise buyers are shifting from “SaaS-only rent” to auditable, customer-owned application delivery for compliance and IP safety.</em>
    </p>
  </div>
</template>

import { createRouter, createWebHistory } from "vue-router";
import View from "@/components/kota0/kota0.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "kota0", component: View },
    { path: "/plan", redirect: { name: "kota0" } },
    { path: "/marketing", redirect: { name: "kota0" } },
  ],
});

import { createRouter, createWebHistory } from "vue-router";
import Kota0View from "@/subjects/kota0/Kota0View.vue";
import HomeView from "@/views/HomeView.vue";
import MarketingView from "@/views/MarketingView.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "kota0", component: Kota0View },
    { path: "/home", name: "home", component: HomeView },
    { path: "/plan", redirect: { name: "kota0" } },
    { path: "/marketing", name: "marketing", component: MarketingView },
  ],
});

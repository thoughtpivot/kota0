import { createRouter, createWebHistory } from "vue-router";
import NvibeView from "@/subjects/nvibe/NvibeView.vue";
import HomeView from "@/views/HomeView.vue";
import MarketingView from "@/views/MarketingView.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "nvibe", component: NvibeView },
    { path: "/home", name: "home", component: HomeView },
    { path: "/plan", redirect: { name: "nvibe" } },
    { path: "/marketing", name: "marketing", component: MarketingView },
  ],
});

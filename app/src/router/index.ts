import { createRouter, createWebHistory } from "vue-router";
import Home from "@/components/home/Home.vue";
import NvibeView from "@/components/nvibe/nvibe.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "nvibe", component: NvibeView },
    { path: "/home", name: "home", component: Home },
    { path: "/plan", redirect: { name: "nvibe" } },
    { path: "/marketing", redirect: { name: "home" } },
  ],
});

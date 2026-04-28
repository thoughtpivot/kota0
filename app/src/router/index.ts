import { createRouter, createWebHistory } from "vue-router";
import Home from "@/components/home/Home.vue";
import Kota0View from "@/components/kota0/kota0.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "kota0", component: Kota0View },
    { path: "/home", name: "home", component: Home },
    { path: "/plan", redirect: { name: "kota0" } },
    { path: "/marketing", redirect: { name: "home" } },
  ],
});

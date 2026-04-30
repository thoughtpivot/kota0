import { createRouter, createWebHistory } from "vue-router";
import Home from "@/components/home/Home.vue";
import PowervibeView from "@/components/powervibe/powervibe.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "powervibe", component: PowervibeView },
    { path: "/home", name: "home", component: Home },
    { path: "/plan", redirect: { name: "powervibe" } },
    { path: "/marketing", redirect: { name: "home" } },
  ],
});

import type { Ref } from "vue";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";

type AppRow = { app_id: string };

/**
 * After the app list is loaded, if `?app=<id>` matches a known app, select it and remove the
 * query param from the URL.
 */
export async function applyPowervibeAppFromQuery(
  route: RouteLocationNormalizedLoaded,
  router: Router,
  apps: Ref<readonly AppRow[]>,
  selectApp: (appId: string) => void,
): Promise<void> {
  const raw = route.query.app;
  const id = typeof raw === "string" ? raw.trim() : "";
  if (id && apps.value.some((a) => a.app_id === id)) {
    selectApp(id);
  }
  if (Object.prototype.hasOwnProperty.call(route.query, "app")) {
    await router.replace({ name: "powervibe", query: {} });
  }
}

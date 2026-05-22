import type Router from "@koa/router";
import { kota0PlatformAiCompleteText } from "@shared/kota0PlatformAi.ts";

/** Registers before any app-defined routes so duplicate paths still hit these handlers first (@koa/router uses first match). */
export function registerKota0BundleHelloRoute(router: Router): void {
  router.get("/api/kota0-app/hello", async (ctx) => {
    ctx.status = 200;
    ctx.set("Content-Type", "application/json; charset=utf-8");
    const appId = process.env.K0_APP_ID?.trim() ?? "";
    ctx.body = { ok: true, message: "Hello from Kota0 app backend", appId };
  });
}

/**
 * Smoke-test workspace platform AI from bundle Flight. Always responds with HTTP 200 and JSON so the browser
 * can show {@link kota0PlatformAiCompleteText} failures without Koa 500s (missing env, unreachable workspace, etc.).
 */
export function registerKota0BundleAiTestRoute(router: Router): void {
  router.post("/api/kota0-app/ai-test", async (ctx) => {
    ctx.status = 200;
    ctx.set("Content-Type", "application/json; charset=utf-8");
    try {
      const rawText = await kota0PlatformAiCompleteText({
        prompt: "Reply with exactly the single word: OK",
      });
      ctx.body = { rawText };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.body = { rawText: "", error: msg };
    }
  });
}

export function registerKota0BundlePlatformAiRoutes(router: Router): void {
  registerKota0BundleHelloRoute(router);
  registerKota0BundleAiTestRoute(router);
}

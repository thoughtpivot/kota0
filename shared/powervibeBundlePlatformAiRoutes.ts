import type Router from "@koa/router";
import { powervibePlatformAiCompleteText } from "@shared/powervibePlatformAi.ts";

/** Registers before any app-defined routes so duplicate paths still hit these handlers first (@koa/router uses first match). */
export function registerPowervibeBundleHelloRoute(router: Router): void {
  router.get("/api/powervibe-app/hello", async (ctx) => {
    ctx.status = 200;
    ctx.set("Content-Type", "application/json; charset=utf-8");
    ctx.body = { ok: true, message: "Hello from PowerVibe app backend" };
  });
}

/**
 * Smoke-test workspace platform AI from bundle Flight. Always responds with HTTP 200 and JSON so the browser
 * can show {@link powervibePlatformAiCompleteText} failures without Koa 500s (missing env, unreachable workspace, etc.).
 */
export function registerPowervibeBundleAiTestRoute(router: Router): void {
  router.post("/api/powervibe-app/ai-test", async (ctx) => {
    ctx.status = 200;
    ctx.set("Content-Type", "application/json; charset=utf-8");
    try {
      const rawText = await powervibePlatformAiCompleteText({
        prompt: "Reply with exactly the single word: OK",
      });
      ctx.body = { rawText };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.body = { rawText: "", error: msg };
    }
  });
}

export function registerPowervibeBundlePlatformAiRoutes(router: Router): void {
  registerPowervibeBundleHelloRoute(router);
  registerPowervibeBundleAiTestRoute(router);
}

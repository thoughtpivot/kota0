import Router, { type RouterContext } from "@koa/router";
import { type IncomingMessage, runPlan } from "./planRun";

const router = new Router();

router.post("/api/plan", async (ctx: RouterContext) => {
  try {
    const body = ctx.request.body as { messages?: IncomingMessage[] };
    const msgs = body?.messages;
    if (!Array.isArray(msgs) || msgs.length === 0) {
      ctx.status = 400;
      ctx.body = { error: "messages_required" };
      return;
    }

    const plan = await runPlan(msgs);
    ctx.status = 200;
    ctx.body = plan;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    ctx.status = 502;
    ctx.body = { error: "plan_failed", message };
  }
});

router.get("/api/health", async (ctx: RouterContext) => {
  ctx.status = 200;
  ctx.body = { ok: true };
});

export default router.routes();

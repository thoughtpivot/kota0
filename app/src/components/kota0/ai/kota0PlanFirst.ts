/** Default ON. Set `VITE_K0_PLAN_FIRST=0` to fall back to legacy single-turn chat. */
export function kota0PlanFirstEnabled(): boolean {
  const v = import.meta.env.VITE_K0_PLAN_FIRST;
  return v !== "0" && v !== "false";
}

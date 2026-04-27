/**
 * Load repo-root `.env` once when any Flight `*.backend.ts` loads.
 * Twelve-factor: production relies on injected env; local `.env` is dev-only.
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  override: false,
  quiet: true,
});

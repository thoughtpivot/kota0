import path from "node:path";
import { resolveNvibeRepoRoot } from "@/components/nvibe/viewer/nvibeMaterialize";

export function resolveNvibeBundlesRoot(): string {
  return path.join(resolveNvibeRepoRoot(), "bundles");
}

export function resolveNvibeBundleDir(appId: string): string {
  return path.join(resolveNvibeBundlesRoot(), appId);
}

export function resolveNvibeBundleTemplateDir(): string {
  return path.join(resolveNvibeRepoRoot(), "templates", "nvibe-bundle");
}

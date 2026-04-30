import path from "node:path";
import { resolvePowervibeRepoRoot } from "@/components/powervibe/viewer/powervibeMaterialize";

export function resolvePowervibeBundlesRoot(): string {
  return path.join(resolvePowervibeRepoRoot(), "bundles");
}

export function resolvePowervibeBundleDir(appId: string): string {
  return path.join(resolvePowervibeBundlesRoot(), appId);
}

export function resolvePowervibeBundleTemplateDir(): string {
  return path.join(resolvePowervibeRepoRoot(), "templates", "powervibe-bundle");
}

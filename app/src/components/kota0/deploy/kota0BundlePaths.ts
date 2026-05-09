import path from "node:path";
import { resolveKota0RepoRoot } from "@/components/kota0/viewer/kota0Materialize";

export function resolveKota0BundlesRoot(): string {
  return path.join(resolveKota0RepoRoot(), "bundles");
}

export function resolveKota0BundleDir(appId: string): string {
  return path.join(resolveKota0BundlesRoot(), appId);
}

export function resolveKota0BundleTemplateDir(): string {
  return path.join(resolveKota0RepoRoot(), "templates", "k0-bundle");
}

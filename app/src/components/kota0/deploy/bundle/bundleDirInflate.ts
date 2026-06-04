import { lstat, readlink, rm, cp } from "node:fs/promises";
import path from "node:path";

/**
 * If `dir` is a symlink, replace it with a real directory tree copied from the link target.
 * Relative symlink targets are resolved from the symlink's parent directory.
 * Returns true when a symlink was materialized.
 */
export async function ensureWritableDir(dir: string): Promise<boolean> {
  try {
    const s = await lstat(dir);
    if (!s.isSymbolicLink()) return false;
    const linkTarget = await readlink(dir);
    const resolved = path.isAbsolute(linkTarget)
      ? linkTarget
      : path.resolve(path.dirname(dir), linkTarget);
    await rm(dir, { force: true });
    await cp(resolved, dir, { recursive: true, force: true });
    return true;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") return false;
    throw e;
  }
}

/** Materialize symlinked heavy dirs before docker volume-mount (container only sees `/bundle`). */
export async function materializeBundleSymlinksForDeploy(bundleDir: string): Promise<void> {
  for (const name of ["node_modules", "dist"] as const) {
    await ensureWritableDir(path.join(bundleDir, name));
  }
}

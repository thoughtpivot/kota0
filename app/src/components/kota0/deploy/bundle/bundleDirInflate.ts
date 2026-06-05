import { chmod, cp, lstat, readdir, readlink, rm } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";

/**
 * Ensure `dir` is a real, **owner-writable** directory tree.
 *
 * If `dir` is a symlink (thin-clone bundles point `node_modules` / `dist` at the shared starter
 * cache), it is replaced with a real copy of the link target. Relative symlink targets are resolved
 * from the symlink's parent directory.
 *
 * Crucially, the copy is then made writable. The starter cache is chmod'd `0o555` (read-only) by
 * `markStarterCacheReadOnly` so accidental writes through a thin-clone symlink fail fast instead of
 * corrupting every app — but `fs.cp` faithfully preserves those read-only modes, so a fresh copy
 * (or a dir materialized by an earlier build) is itself read-only. vite's `prepareOutDir` (which
 * `rm`s + recreates `dist/assets`) and `npm install` both need to WRITE here; without restoring the
 * write bit vite dies with `EACCES` inside `emptyDir`. This also repairs an already-materialized
 * real directory (the no-symlink case), so a once-poisoned `dist` self-heals on the next build.
 *
 * Returns true when a symlink was materialized (kept for callers/tests that branch on it).
 */
export async function ensureWritableDir(dir: string): Promise<boolean> {
  let stat: Stats;
  try {
    stat = await lstat(dir);
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") return false;
    throw e;
  }

  let materialized = false;
  if (stat.isSymbolicLink()) {
    const linkTarget = await readlink(dir);
    const resolved = path.isAbsolute(linkTarget)
      ? linkTarget
      : path.resolve(path.dirname(dir), linkTarget);
    await rm(dir, { force: true });
    await cp(resolved, dir, { recursive: true, force: true });
    materialized = true;
  }

  await makeTreeOwnerWritable(dir);
  return materialized;
}

/**
 * Recursively add the owner-write bit so this process can rewrite the tree: directories get owner
 * `rwx` (needed to add/remove children), files get owner `w` (needed to overwrite in place).
 * Symlinks are skipped — their in-tree targets are visited directly. Best-effort and idempotent.
 */
async function makeTreeOwnerWritable(target: string): Promise<void> {
  let stat: Stats;
  try {
    stat = await lstat(target);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) return;
  try {
    await chmod(target, stat.isDirectory() ? stat.mode | 0o700 : stat.mode | 0o200);
  } catch {
    /* best-effort: a file we don't own shouldn't abort the build */
  }
  if (stat.isDirectory()) {
    let entries: string[];
    try {
      entries = await readdir(target);
    } catch {
      return;
    }
    await Promise.all(entries.map((name) => makeTreeOwnerWritable(path.join(target, name))));
  }
}

/** Materialize symlinked heavy dirs before docker volume-mount (container only sees `/bundle`). */
export async function materializeBundleSymlinksForDeploy(bundleDir: string): Promise<void> {
  for (const name of ["node_modules", "dist"] as const) {
    await ensureWritableDir(path.join(bundleDir, name));
  }
}

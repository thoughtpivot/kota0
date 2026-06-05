import { chmod, readdir, realpath, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

/**
 * Restore the executable bit on the bundle binaries that get **spawned** during `vite build`.
 *
 * Background: the old design ran a fresh `npm install` in every `bundles/<id>/`, so npm always
 * (re)set correct file modes — the executable binaries were guaranteed `+x`. The starter-cache
 * fast path (see `./starterBundleCache.ts`) builds `node_modules` **once** and then copies /
 * symlinks it into each bundle. That bypasses npm's mode handling: any copy step or permission
 * cycle that drops the execute bit lands the esbuild platform binary at `0644`, after which Vite's
 * `spawn(...esbuild)` dies with `EACCES` and the build fails.
 *
 * This restores the guarantee npm used to give us. It is idempotent, best-effort (individual
 * failures are swallowed), and only touches files whose mode actually needs the `+x` bit added.
 *
 * What needs `+x`:
 *  - **esbuild platform binaries** — the `esbuild` file under any nested `@esbuild/<platform>/bin`
 *    directory. Vite/esbuild spawn these directly as native executables; they are NOT reachable
 *    via `node_modules/.bin`, so fixing only `.bin` would miss them (this is the file in the
 *    original EACCES — Vite's nested copy).
 *  - **`node_modules/.bin` targets** — npm marks these `0755`; restore that so any other tool the
 *    build shells out to keeps working (matches npm's own behavior).
 *
 * Native `.node` addons (lightningcss / oxide / rollup) are intentionally ignored — they are
 * `dlopen`-ed into the process, never spawned, so they do not need the execute bit.
 *
 * Works whether `nodeModulesDir` is a real directory (deep-copy / clonefile bundles) or a symlink
 * to the shared cache (thin-clone bundles): directory reads follow the symlink and `chmod` follows
 * symlinked `.bin` entries, so repairing a thin-cloned bundle repairs the shared cache too — which
 * is correct, since "this binary must be executable" is universally true.
 */
export async function ensureBundleBinariesExecutable(nodeModulesDir: string): Promise<void> {
  if (process.platform === "win32") return; // mode bits are meaningless on Windows

  const esbuildBinaries = new Set<string>();
  const binDirs = new Set<string>();
  await collectSpawnableBinaries(nodeModulesDir, esbuildBinaries, binDirs, new Set(), 0);

  const targets = new Set<string>(esbuildBinaries);
  for (const binDir of binDirs) {
    let entries: Dirent[];
    try {
      entries = await readdir(binDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      targets.add(path.join(binDir, entry.name));
    }
  }

  await Promise.all([...targets].map((file) => addExecutableBit(file)));
}

/** Add the `+x` bits (preserving read/write bits) when missing. Follows symlinks (e.g. `.bin` entries). */
async function addExecutableBit(file: string): Promise<void> {
  try {
    const s = await stat(file);
    if (!s.isFile()) return;
    const desired = s.mode | 0o111;
    if (desired !== s.mode) {
      await chmod(file, desired);
    }
  } catch {
    /* best-effort: a dangling .bin symlink or a file we don't own shouldn't fail the build */
  }
}

/**
 * Walk only the `node_modules` -> package -> nested-`node_modules` chain (never package source
 * internals), collecting esbuild platform binaries and `.bin` directories. `realpath` + `seen`
 * guard against symlink cycles and re-visiting the shared cache through multiple links.
 */
async function collectSpawnableBinaries(
  nodeModulesDir: string,
  esbuildBinaries: Set<string>,
  binDirs: Set<string>,
  seen: Set<string>,
  depth: number,
): Promise<void> {
  if (depth > 8) return; // dependency nesting deeper than this is not real-world

  let real: string;
  try {
    real = await realpath(nodeModulesDir);
  } catch {
    return; // does not exist (e.g. a package without nested deps)
  }
  if (seen.has(real)) return;
  seen.add(real);

  let entries: Dirent[];
  try {
    entries = await readdir(nodeModulesDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = entry.name;
    if (name === ".bin") {
      binDirs.add(path.join(nodeModulesDir, name));
      continue;
    }
    if (name === "@esbuild") {
      const platformsDir = path.join(nodeModulesDir, name);
      let platforms: Dirent[];
      try {
        platforms = await readdir(platformsDir, { withFileTypes: true });
      } catch {
        platforms = [];
      }
      for (const platform of platforms) {
        esbuildBinaries.add(path.join(platformsDir, platform.name, "bin", "esbuild"));
      }
      continue;
    }
    if (name.startsWith("@")) {
      // Scope directory — descend one level to each scoped package's nested node_modules.
      const scopeDir = path.join(nodeModulesDir, name);
      let scoped: Dirent[];
      try {
        scoped = await readdir(scopeDir, { withFileTypes: true });
      } catch {
        scoped = [];
      }
      for (const pkg of scoped) {
        await collectSpawnableBinaries(
          path.join(scopeDir, pkg.name, "node_modules"),
          esbuildBinaries,
          binDirs,
          seen,
          depth + 1,
        );
      }
      continue;
    }
    // Regular package — only its nested node_modules can hold more spawnable binaries.
    await collectSpawnableBinaries(
      path.join(nodeModulesDir, name, "node_modules"),
      esbuildBinaries,
      binDirs,
      seen,
      depth + 1,
    );
  }
}

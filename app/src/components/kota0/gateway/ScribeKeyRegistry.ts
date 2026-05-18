import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type PersistedState = {
  keyToAppId: Record<string, string>;
  appIdToKey: Record<string, string>;
};

class ScribeKeyRegistry {
  private keyToAppId = new Map<string, string>();
  private appIdToKey = new Map<string, string>();
  private persistPath: string | null = null;

  /** Call once at startup with the path to the shared JSON file inside `bundles/`. */
  configure(storagePath: string): void {
    this.persistPath = storagePath;
  }

  /** Load the persisted registry from disk. Safe to call on a fresh install. */
  async load(): Promise<void> {
    if (!this.persistPath) return;
    try {
      const raw = await readFile(this.persistPath, "utf8");
      const state: PersistedState = JSON.parse(raw);
      this.keyToAppId = new Map(Object.entries(state.keyToAppId ?? {}));
      this.appIdToKey = new Map(Object.entries(state.appIdToKey ?? {}));
    } catch {
      // File missing or corrupt on first run — start with an empty registry.
    }
  }

  /**
   * Watch the persist file for changes written by other workers and reload automatically.
   * Only the gateway process calls this — platform workers only write, never watch.
   */
  /**
   * Watch the persist file for changes written by platform workers and debounce-reload.
   * If the file doesn't exist yet (first run before any app is created), retries after a delay.
   */
  startWatching(): void {
    if (!this.persistPath) return;
    const filePath = this.persistPath;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const watcher = watch(filePath, { persistent: false }, () => {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          void this.load();
        }, 50);
      });
      watcher.on("error", () => {
        setTimeout(() => this.startWatching(), 2000);
      });
    } catch {
      // File does not exist yet — retry until a worker writes the first key
      setTimeout(() => this.startWatching(), 2000);
    }
  }

  private async persist(): Promise<void> {
    if (!this.persistPath) return;
    try {
      await mkdir(path.dirname(this.persistPath), { recursive: true });
      const state: PersistedState = {
        keyToAppId: Object.fromEntries(this.keyToAppId),
        appIdToKey: Object.fromEntries(this.appIdToKey),
      };
      await writeFile(this.persistPath, JSON.stringify(state, null, 2), "utf8");
    } catch (err) {
      console.warn("[scribe-gateway] registry persist failed:", err instanceof Error ? err.message : err);
    }
  }

  /**
   * Return the existing scoped API key for `appId`, or mint a new one if absent.
   * Always reloads from disk first so concurrent workers don't overwrite each other's keys.
   *
   * Keys are intentionally stable across re-materializations: rotating the key mid-flight
   * would 401 the running bundle during the restart window. Call `revoke()` explicitly to
   * invalidate a key (e.g. when an app is deleted).
   */
  async provision(appId: string): Promise<string> {
    await this.load();
    const existing = this.appIdToKey.get(appId);
    if (existing) return existing;
    const key = `sk-app-${randomUUID()}`;
    this.keyToAppId.set(key, appId);
    this.appIdToKey.set(appId, key);
    await this.persist();
    return key;
  }

  /** Permanently revoke the key for a deleted app. Always reloads from disk first. */
  async revoke(appId: string): Promise<void> {
    await this.load();
    const key = this.appIdToKey.get(appId);
    if (!key) return;
    this.keyToAppId.delete(key);
    this.appIdToKey.delete(appId);
    await this.persist();
  }

  /** Resolve a bearer token to its owning appId. Only reliable in the gateway process (which watches the file). */
  resolve(apiKey: string): string | undefined {
    return this.keyToAppId.get(apiKey);
  }

  keyFor(appId: string): string | undefined {
    return this.appIdToKey.get(appId);
  }
}

export const scribeKeyRegistry = new ScribeKeyRegistry();

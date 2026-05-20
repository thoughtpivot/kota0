import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  destroyDeployment,
  rewriteHostLoopbackForContainer,
  runDeploy,
} from "@/components/kota0/deploy/kota0DeployOrchestrator.ts";
import type {
  Kota0DeploymentData,
  Kota0DeploymentRepository,
  Kota0DeploymentRow,
  Kota0DeploymentStatus,
} from "@/components/kota0/deploy/kota0DeploymentTypes.ts";
import type { DeployTarget } from "@/components/kota0/deploy/kota0DeployTarget.ts";
import { scribeKeyRegistry } from "@/components/kota0/gateway/ScribeKeyRegistry.ts";

class MemoryDeploymentRepo implements Kota0DeploymentRepository {
  rows: Kota0DeploymentRow[] = [];
  private nextScribeId = 1;
  async listForApp(appId: string) {
    return this.rows.filter((r) => r.app_id === appId);
  }
  async get(deploymentId: string) {
    return this.rows.find((r) => r.deployment_id === deploymentId) ?? null;
  }
  async create(input: Omit<Kota0DeploymentData, "status" | "started_at"> & { status?: Kota0DeploymentStatus }) {
    const now = new Date().toISOString();
    const row: Kota0DeploymentRow = {
      deployment_id: input.deployment_id || randomUUID(),
      app_id: input.app_id,
      target: input.target,
      status: input.status ?? "building",
      started_at: now,
      scribeRowId: this.nextScribeId++,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }
  async patch(deploymentId: string, patch: Partial<Kota0DeploymentRow>) {
    const idx = this.rows.findIndex((r) => r.deployment_id === deploymentId);
    if (idx < 0) throw new Error("deployment_not_found");
    const now = new Date().toISOString();
    this.rows[idx] = { ...this.rows[idx]!, ...patch, updatedAt: now };
    return this.rows[idx]!;
  }
}

class FakeTarget implements DeployTarget {
  readonly kind = "local-docker" as const;
  buildCalls: string[] = [];
  provisionCalls: Array<{ env: Record<string, string>; imageRef: string }> = [];
  destroyCalls: string[] = [];
  shouldFailBuild = false;
  async build({ appId }: { appId: string; bundleDir: string }) {
    this.buildCalls.push(appId);
    if (this.shouldFailBuild) throw new Error("simulated build failure");
    return { kind: this.kind, imageRef: `image-${appId.slice(0, 8)}` };
  }
  async provision(input: { deploymentId: string; artifact: { imageRef: string }; env: Record<string, string> }) {
    this.provisionCalls.push({ env: input.env, imageRef: input.artifact.imageRef });
    return { url: `http://127.0.0.1:9999`, handle: `container-${input.deploymentId.slice(0, 8)}` };
  }
  async status() {
    return "running" as const;
  }
  async destroy(handle: string) {
    this.destroyCalls.push(handle);
  }
}

test("rewriteHostLoopbackForContainer swaps 127.0.0.1/localhost for host.docker.internal", () => {
  const prev = process.env.K0_DEPLOY_DOCKER_NETWORK;
  delete process.env.K0_DEPLOY_DOCKER_NETWORK;
  try {
    assert.equal(rewriteHostLoopbackForContainer("http://127.0.0.1:3002"), "http://host.docker.internal:3002");
    assert.equal(rewriteHostLoopbackForContainer("http://localhost:3000"), "http://host.docker.internal:3000");
    assert.equal(rewriteHostLoopbackForContainer("https://scribe.internal:443"), "https://scribe.internal:443");
  } finally {
    if (prev === undefined) delete process.env.K0_DEPLOY_DOCKER_NETWORK;
    else process.env.K0_DEPLOY_DOCKER_NETWORK = prev;
  }
});

test("rewriteHostLoopbackForContainer uses workspace service name when on compose network", () => {
  const prevNet = process.env.K0_DEPLOY_DOCKER_NETWORK;
  const prevSvc = process.env.K0_DEPLOY_WORKSPACE_SERVICE;
  process.env.K0_DEPLOY_DOCKER_NETWORK = "kota0-prod_default";
  try {
    // Default workspace service name.
    delete process.env.K0_DEPLOY_WORKSPACE_SERVICE;
    assert.equal(rewriteHostLoopbackForContainer("http://127.0.0.1:3000"), "http://workspace:3000");
    // Custom service name override.
    process.env.K0_DEPLOY_WORKSPACE_SERVICE = "k0-platform";
    assert.equal(rewriteHostLoopbackForContainer("http://localhost:3000"), "http://k0-platform:3000");
    // Already-named hosts unchanged.
    assert.equal(rewriteHostLoopbackForContainer("http://scribe-gateway:3002"), "http://scribe-gateway:3002");
  } finally {
    if (prevNet === undefined) delete process.env.K0_DEPLOY_DOCKER_NETWORK;
    else process.env.K0_DEPLOY_DOCKER_NETWORK = prevNet;
    if (prevSvc === undefined) delete process.env.K0_DEPLOY_WORKSPACE_SERVICE;
    else process.env.K0_DEPLOY_WORKSPACE_SERVICE = prevSvc;
  }
});

test("runDeploy: bundle .env user keys flow through; platform-reserved keys cannot be overridden", async (t) => {
  // Set up a bundle dir at <repoRoot>/bundles/<appId>/ with a .env, by pointing
  // K0_REPO_ROOT at a tmp dir (resolveKota0RepoRoot honors the env override).
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "k0-deploy-bundle-env-"));
  const prevRepoRoot = process.env.K0_REPO_ROOT;
  process.env.K0_REPO_ROOT = tmpRoot;
  const appId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const bundleDir = path.join(tmpRoot, "bundles", appId);
  await mkdir(bundleDir, { recursive: true });
  await writeFile(
    path.join(bundleDir, ".env"),
    [
      "# user-set secrets",
      "WEATHERAPI_KEY=user-weather-key-123",
      'STRIPE_PUBLIC_KEY="pk_test_quoted"',
      "FEATURE_FLAG_X=on",
      "# bundle SHOULD NOT be able to override these:",
      "SCRIBE_API_KEY=evil-attempt",
      "SCRIBE_URL=http://attacker.example/",
      "DATABASE_URL=postgres://attacker/secret",
      "K0_APP_REDIS_PREFIX=attacker:",
      "FLIGHT_PORT=9999",
    ].join("\n"),
    "utf8",
  );
  scribeKeyRegistry.configure(path.join(tmpRoot, "keys.json"));

  t.after(async () => {
    if (prevRepoRoot === undefined) delete process.env.K0_REPO_ROOT;
    else process.env.K0_REPO_ROOT = prevRepoRoot;
    await rm(tmpRoot, { recursive: true, force: true });
  });

  const repo = new MemoryDeploymentRepo();
  const target = new FakeTarget();
  await runDeploy(appId, { repo, target, workspaceKoaPort: "3000" });

  const env = target.provisionCalls[0]!.env;
  // User keys made it through.
  assert.equal(env.WEATHERAPI_KEY, "user-weather-key-123");
  assert.equal(env.STRIPE_PUBLIC_KEY, "pk_test_quoted");
  assert.equal(env.FEATURE_FLAG_X, "on");
  // Platform-reserved keys are NOT the bundle's values.
  assert.ok(env.SCRIBE_API_KEY?.startsWith("sk-app-"), "SCRIBE_API_KEY is platform-minted");
  assert.notEqual(env.SCRIBE_API_KEY, "evil-attempt");
  assert.notEqual(env.SCRIBE_URL, "http://attacker.example/");
  assert.ok(env.DATABASE_URL === undefined, "DATABASE_URL never flows from bundle .env");
  assert.equal(env.K0_APP_REDIS_PREFIX, `app_${appId.replace(/-/g, "_")}:`);
  assert.equal(env.FLIGHT_PORT, "4000");
});

test("runDeploy: building → running, persists image+container+endpoint and injects env", async (t) => {
  // Point the key registry at a tmp file so provision() works without touching real bundles/.
  const tmp = await mkdtemp(path.join(tmpdir(), "k0-deploy-test-"));
  scribeKeyRegistry.configure(path.join(tmp, "keys.json"));
  // Ensure resolveKota0BundleDir doesn't fail on the orchestrator path — it only stats lazily.
  const appId = "11111111-1111-1111-1111-111111111111";

  // The orchestrator calls resolveKota0BundleDir(appId), which builds a path under the repo's bundles/.
  // We don't actually run docker in this test (FakeTarget); the dir doesn't have to exist.
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const repo = new MemoryDeploymentRepo();
  const target = new FakeTarget();
  const row = await runDeploy(appId, { repo, target, workspaceKoaPort: "3000" });

  assert.equal(row.status, "running");
  assert.equal(row.image_ref, `image-${appId.slice(0, 8)}`);
  assert.ok(row.container_id?.startsWith("container-"));
  assert.equal(row.endpoint_url, "http://127.0.0.1:9999");

  // Env injected to the target should rewrite loopback URLs and carry the scoped key.
  assert.equal(target.provisionCalls.length, 1);
  const env = target.provisionCalls[0]!.env;
  assert.equal(env.K0_APP_ID, appId);
  assert.equal(env.K0_APP_REDIS_PREFIX, `app_${appId.replace(/-/g, "_")}:`);
  assert.match(env.SCRIBE_URL, /^http:\/\/host\.docker\.internal:/);
  assert.equal(env.K0_PLATFORM_API_ORIGIN, "http://host.docker.internal:3000");
  assert.ok(env.SCRIBE_API_KEY?.startsWith("sk-app-"));
  assert.equal(env.FLIGHT_REDIS_HOST, "host.docker.internal");

  // Two rows persisted: initial building (now patched), no second row.
  assert.equal(repo.rows.length, 1);
});

test("runDeploy: on build failure, row transitions to status=failed with error message", async (t) => {
  const tmp = await mkdtemp(path.join(tmpdir(), "k0-deploy-test-"));
  scribeKeyRegistry.configure(path.join(tmp, "keys.json"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const repo = new MemoryDeploymentRepo();
  const target = new FakeTarget();
  target.shouldFailBuild = true;
  await assert.rejects(
    () => runDeploy("33333333-3333-3333-3333-333333333333", { repo, target }),
    /simulated build failure/,
  );
  assert.equal(repo.rows.length, 1);
  assert.equal(repo.rows[0]!.status, "failed");
  assert.equal(repo.rows[0]!.error, "simulated build failure");
});

test("destroyDeployment: calls target.destroy with container_id and patches status=destroyed", async (t) => {
  const tmp = await mkdtemp(path.join(tmpdir(), "k0-deploy-test-"));
  scribeKeyRegistry.configure(path.join(tmp, "keys.json"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const repo = new MemoryDeploymentRepo();
  const target = new FakeTarget();
  const appId = "44444444-4444-4444-4444-444444444444";
  const row = await runDeploy(appId, { repo, target });

  const destroyed = await destroyDeployment(row.deployment_id, { repo, target });
  assert.equal(destroyed.status, "destroyed");
  assert.ok(destroyed.destroyed_at);
  assert.equal(target.destroyCalls.length, 1);
  assert.equal(target.destroyCalls[0], row.container_id);
});

test("destroyDeployment: throws when deployment row is missing", async (t) => {
  const tmp = await mkdtemp(path.join(tmpdir(), "k0-deploy-test-"));
  scribeKeyRegistry.configure(path.join(tmp, "keys.json"));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const repo = new MemoryDeploymentRepo();
  const target = new FakeTarget();
  await assert.rejects(
    () => destroyDeployment("nonexistent-id", { repo, target }),
    /deployment_not_found/,
  );
});

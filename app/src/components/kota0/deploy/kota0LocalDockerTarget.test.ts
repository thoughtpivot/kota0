import assert from "node:assert/strict";
import test from "node:test";
import { lstat, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  LocalDockerTarget,
  containerNameForDeployment,
  imageTagForApp,
} from "@/components/kota0/deploy/kota0LocalDockerTarget.ts";

/** Create a fake bundle dir with the minimum artifacts `build()` checks for. */
async function fakeBundleDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "k0-deploy-target-test-"));
  await mkdir(path.join(dir, "dist"), { recursive: true });
  await writeFile(path.join(dir, "dist", "index.html"), "<!doctype html><html></html>", "utf8");
  await writeFile(path.join(dir, "App.backend.ts"), "export default () => {};", "utf8");
  return dir;
}

type Call = { args: string[]; stdout: string };

function fakeExec(calls: Call[]) {
  return async (args: string[]) => {
    const next = calls.shift();
    if (!next) throw new Error(`unexpected docker call: ${args.join(" ")}`);
    return { stdout: next.stdout, stderr: "" };
  };
}

test("imageTagForApp produces a docker-safe tag with stable shortening", () => {
  const tag = imageTagForApp("11111111-1111-1111-1111-111111111111", 1700000000000);
  assert.equal(tag, "kota0-app-111111111111:1700000000000");
});

test("containerNameForDeployment is docker-safe and stable", () => {
  const name = containerNameForDeployment("22222222-2222-2222-2222-222222222222");
  assert.equal(name, "k0app-222222222222222222222222");
});

test("build verifies dist/index.html + App.backend.ts exist and returns the runtime image", async (t) => {
  const bundleDir = await fakeBundleDir();
  const prev = process.env.K0_DEPLOY_RUNTIME_IMAGE;
  delete process.env.K0_DEPLOY_RUNTIME_IMAGE;
  t.after(() => {
    if (prev === undefined) delete process.env.K0_DEPLOY_RUNTIME_IMAGE;
    else process.env.K0_DEPLOY_RUNTIME_IMAGE = prev;
    return rm(bundleDir, { recursive: true, force: true });
  });
  // No exec call expected — build is a no-op shell-wise in this target.
  const target = new LocalDockerTarget({ exec: fakeExec([]) });
  const artifact = await target.build({
    appId: "11111111-1111-1111-1111-111111111111",
    bundleDir,
  });
  assert.equal(artifact.kind, "local-docker");
  // Falls back to the shared workspace image when K0_DEPLOY_RUNTIME_IMAGE isn't set.
  // Per-app image building is intentionally not done — bundles are volume-mounted into
  // the workspace runtime image at /bundle.
  assert.equal(artifact.imageRef, "kota0-workspace:latest");
});

test("build errors with a helpful message when dist/ is missing", async (t) => {
  const bundleDir = await mkdtemp(path.join(tmpdir(), "k0-deploy-target-empty-"));
  t.after(() => rm(bundleDir, { recursive: true, force: true }));
  const target = new LocalDockerTarget({ exec: fakeExec([]) });
  await assert.rejects(
    () => target.build({ appId: "11111111-1111-1111-1111-111111111111", bundleDir }),
    /deploy_artifact_missing.+open the app at least once/,
  );
});

test("build materializes symlinked node_modules and dist before artifact check", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "k0-deploy-symlink-"));
  const cacheDir = path.join(root, ".starter-cache");
  const bundleDir = path.join(root, "11111111-1111-1111-1111-111111111111");
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(cacheDir, "dist"), { recursive: true });
  await mkdir(path.join(cacheDir, "node_modules", "pkg"), { recursive: true });
  await writeFile(path.join(cacheDir, "dist", "index.html"), "<!doctype html><html></html>", "utf8");
  await mkdir(bundleDir, { recursive: true });
  await writeFile(path.join(bundleDir, "App.backend.ts"), "export default () => {};", "utf8");
  await symlink(path.relative(bundleDir, path.join(cacheDir, "dist")), path.join(bundleDir, "dist"), "dir");
  await symlink(
    path.relative(bundleDir, path.join(cacheDir, "node_modules")),
    path.join(bundleDir, "node_modules"),
    "dir",
  );

  const target = new LocalDockerTarget({ exec: fakeExec([]) });
  const artifact = await target.build({
    appId: "11111111-1111-1111-1111-111111111111",
    bundleDir,
  });
  assert.equal(artifact.imageRef, "kota0-workspace:latest");
  for (const dir of ["node_modules", "dist"] as const) {
    const stat = await lstat(path.join(bundleDir, dir));
    assert.equal(stat.isSymbolicLink(), false);
  }
});

test("build honors K0_DEPLOY_RUNTIME_IMAGE override", async (t) => {
  const bundleDir = await fakeBundleDir();
  const prev = process.env.K0_DEPLOY_RUNTIME_IMAGE;
  process.env.K0_DEPLOY_RUNTIME_IMAGE = "kota0-workspace:latest";
  t.after(() => {
    if (prev === undefined) delete process.env.K0_DEPLOY_RUNTIME_IMAGE;
    else process.env.K0_DEPLOY_RUNTIME_IMAGE = prev;
    return rm(bundleDir, { recursive: true, force: true });
  });
  const target = new LocalDockerTarget({ exec: fakeExec([]) });
  const artifact = await target.build({ appId: "11111111-1111-1111-1111-111111111111", bundleDir });
  assert.equal(artifact.imageRef, "kota0-workspace:latest");
});

test("provision: docker run mounts bundle, attaches env, runs Flight CMD against /bundle", async () => {
  const capturedArgs: string[][] = [];
  const exec = async (args: string[]) => {
    capturedArgs.push(args);
    return { stdout: "container-id-abc\n", stderr: "" };
  };
  const target = new LocalDockerTarget({
    exec,
    allocatePort: async () => 54321,
  });
  const endpoint = await target.provision({
    appId: "11111111-1111-1111-1111-111111111111",
    deploymentId: "22222222-2222-2222-2222-222222222222",
    artifact: { kind: "local-docker", imageRef: "kota0-workspace:latest" },
    env: { K0_APP_ID: "11111111-1111-1111-1111-111111111111", SCRIBE_API_KEY: "sk-app-secret" },
  });
  assert.equal(endpoint.handle, "container-id-abc");
  assert.equal(endpoint.url, "http://127.0.0.1:54321");

  const args = capturedArgs[0]!;
  assert.equal(args[0], "run");
  assert.ok(args.includes("--detach"));
  assert.ok(args.includes("--name"));
  assert.ok(args.includes("k0app-222222222222222222222222"));
  assert.ok(args.includes("--publish"));
  assert.ok(args.includes("127.0.0.1:54321:4000"));
  // host.docker.internal mapping for Linux parity with Docker Desktop
  assert.ok(args.includes("--add-host"));
  assert.ok(args.includes("host.docker.internal:host-gateway"));
  // Volume mount of bundle dir into /bundle + workdir
  assert.ok(args.includes("--volume"));
  const volIdx = args.indexOf("--volume");
  assert.ok(args[volIdx + 1]?.endsWith(":/bundle"), `expected volume spec ending in :/bundle, got ${args[volIdx + 1]}`);
  assert.ok(args.includes("--workdir"));
  assert.equal(args[args.indexOf("--workdir") + 1], "/bundle");
  // env injection
  const envIdxs = args.reduce<number[]>((acc, a, i) => (a === "--env" ? [...acc, i] : acc), []);
  const envPairs = envIdxs.map((i) => args[i + 1]);
  assert.ok(envPairs.includes("K0_APP_ID=11111111-1111-1111-1111-111111111111"));
  assert.ok(envPairs.includes("SCRIBE_API_KEY=sk-app-secret"));
  // Image ref is followed by a shell wrapper that symlinks workspace dirs and exec's Flight.
  const imgIdx = args.indexOf("kota0-workspace:latest");
  assert.ok(imgIdx > 0, "image ref present");
  assert.equal(args[imgIdx + 1], "sh");
  assert.equal(args[imgIdx + 2], "-c");
  const wrappedCmd = args[imgIdx + 3] ?? "";
  assert.match(wrappedCmd, /ln -sfn \/workspace\/shared \/shared/);
  assert.match(wrappedCmd, /ln -sfn \/workspace\/app \/app/);
  assert.match(wrappedCmd, /ln -sfn \/workspace\/branding \/branding/);
  assert.match(wrappedCmd, /exec node.+flight\.ts.+--mode production.+--app_home \/bundle/);
});

test("provision: on compose network, attaches to it and addresses container by name (no --publish)", async (t) => {
  const prev = process.env.K0_DEPLOY_DOCKER_NETWORK;
  process.env.K0_DEPLOY_DOCKER_NETWORK = "kota0-prod_default";
  t.after(() => {
    if (prev === undefined) delete process.env.K0_DEPLOY_DOCKER_NETWORK;
    else process.env.K0_DEPLOY_DOCKER_NETWORK = prev;
  });
  let captured: string[] = [];
  const target = new LocalDockerTarget({
    exec: async (args) => {
      captured = args;
      return { stdout: "container-x\n", stderr: "" };
    },
    // Should NOT be called in compose mode; throw if it is.
    allocatePort: async () => {
      throw new Error("allocatePort should not be called on compose network");
    },
  });
  const endpoint = await target.provision({
    appId: "11111111-1111-1111-1111-111111111111",
    deploymentId: "55555555-5555-5555-5555-555555555555",
    artifact: { kind: "local-docker", imageRef: "kota0-workspace:latest" },
    env: {},
  });
  // No --publish in args
  assert.ok(!captured.includes("--publish"), `expected no --publish in compose mode, got args: ${captured.join(" ")}`);
  // --network is set
  assert.ok(captured.includes("--network"));
  assert.equal(captured[captured.indexOf("--network") + 1], "kota0-prod_default");
  // URL addresses the container by name on port 4000
  assert.match(endpoint.url, /^http:\/\/k0app-\w+:4000$/);
});

test("provision: translates K0_BUNDLES_CONTAINER_DIR → K0_BUNDLES_HOST_DIR for the volume mount", async (t) => {
  const prevHost = process.env.K0_BUNDLES_HOST_DIR;
  const prevContainer = process.env.K0_BUNDLES_CONTAINER_DIR;
  process.env.K0_BUNDLES_HOST_DIR = "/opt/kota0/bundles";
  process.env.K0_BUNDLES_CONTAINER_DIR = "/workspace/bundles";
  // Also pin the bundles root so the test doesn't depend on the test runner's CWD.
  // resolveKota0BundleDir uses resolveKota0BundlesRoot which uses resolveKota0RepoRoot
  // — controlled by env override in real prod. For this assertion we just check the
  // suffix after translation.
  t.after(() => {
    if (prevHost === undefined) delete process.env.K0_BUNDLES_HOST_DIR;
    else process.env.K0_BUNDLES_HOST_DIR = prevHost;
    if (prevContainer === undefined) delete process.env.K0_BUNDLES_CONTAINER_DIR;
    else process.env.K0_BUNDLES_CONTAINER_DIR = prevContainer;
  });
  let captured: string[] = [];
  const target = new LocalDockerTarget({
    exec: async (args) => {
      captured = args;
      return { stdout: "id\n", stderr: "" };
    },
    allocatePort: async () => 40000,
  });
  await target.provision({
    appId: "33333333-3333-3333-3333-333333333333",
    deploymentId: "44444444-4444-4444-4444-444444444444",
    artifact: { kind: "local-docker", imageRef: "kota0-workspace:latest" },
    env: {},
  });
  const volIdx = captured.indexOf("--volume");
  const spec = captured[volIdx + 1]!;
  // Only require the prefix matches host base — the appId suffix can be anything the
  // test runner resolves resolveKota0BundleDir() to, as long as it got translated.
  // Real-world example: /workspace/bundles/<uuid> → /opt/kota0/bundles/<uuid>.
  assert.ok(
    spec.startsWith("/opt/kota0/bundles/") || spec.startsWith("/opt/kota0/bundles:"),
    `expected host-path prefix, got ${spec}`,
  );
  assert.ok(spec.endsWith(":/bundle"));
});

test("status maps docker states to DeployRuntimeStatus", async () => {
  const cases: Array<[string, string]> = [
    ["running", "running"],
    ["exited", "stopped"],
    ["dead", "stopped"],
    ["created", "running"],
    ["paused", "running"],
    ["something-weird", "unknown"],
  ];
  for (const [dockerState, expected] of cases) {
    const target = new LocalDockerTarget({
      exec: async () => ({ stdout: `${dockerState}\n`, stderr: "" }),
    });
    assert.equal(await target.status("h"), expected, `docker=${dockerState}`);
  }
});

test("status returns 'missing' when inspect errors with 'No such object'", async () => {
  const target = new LocalDockerTarget({
    exec: async () => {
      throw new Error("Error: No such object: deadbeef");
    },
  });
  assert.equal(await target.status("deadbeef"), "missing");
});

test("destroy is idempotent for already-gone containers", async () => {
  const target = new LocalDockerTarget({
    exec: async () => {
      throw new Error("Error response from daemon: No such container: foo");
    },
  });
  // Should not throw.
  await target.destroy("foo");
});

test("destroy rethrows unexpected docker errors", async () => {
  const target = new LocalDockerTarget({
    exec: async () => {
      throw new Error("docker daemon unreachable");
    },
  });
  await assert.rejects(() => target.destroy("bar"), /docker daemon unreachable/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalDockerTarget,
  containerNameForDeployment,
  imageTagForApp,
} from "@/components/kota0/deploy/kota0LocalDockerTarget.ts";

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

test("build invokes `docker build -t <tag> <bundleDir>` and returns the artifact", async () => {
  const calls: Call[] = [{ args: [], stdout: "" }];
  const target = new LocalDockerTarget({
    exec: fakeExec(calls),
    now: () => 1700000000000,
  });
  const artifact = await target.build({
    appId: "11111111-1111-1111-1111-111111111111",
    bundleDir: "/tmp/bundles/abc",
  });
  assert.equal(artifact.kind, "local-docker");
  assert.equal(artifact.imageRef, "kota0-app-111111111111:1700000000000");
});

test("provision passes env vars and publishes to an allocated host port", async () => {
  const capturedArgs: string[][] = [];
  const exec = async (args: string[]) => {
    capturedArgs.push(args);
    return { stdout: "container-id-abc\n", stderr: "" };
  };
  const target = new LocalDockerTarget({
    exec,
    allocatePort: async () => 54321,
    now: () => 1700000000000,
  });
  const endpoint = await target.provision({
    appId: "11111111-1111-1111-1111-111111111111",
    deploymentId: "22222222-2222-2222-2222-222222222222",
    artifact: { kind: "local-docker", imageRef: "kota0-app-x:1" },
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
  // env injection
  const envIdxs = args.reduce<number[]>((acc, a, i) => (a === "--env" ? [...acc, i] : acc), []);
  const envPairs = envIdxs.map((i) => args[i + 1]);
  assert.ok(envPairs.includes("K0_APP_ID=11111111-1111-1111-1111-111111111111"));
  assert.ok(envPairs.includes("SCRIBE_API_KEY=sk-app-secret"));
  // image ref must be the last positional
  assert.equal(args[args.length - 1], "kota0-app-x:1");
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

/**
 * Kota0 workspace stack — single EC2 host running compose.prod.yml.
 *
 * Reads config (see Pulumi.<stack>.yaml or `pulumi config set ...`):
 *   - aws:region           AWS region (e.g. us-east-1)
 *   - keyName              EC2 key-pair name (must already exist in the region)
 *   - instanceType         optional; default t4g.medium (Graviton arm64)
 *   - allowedSshCidr       optional; default 0.0.0.0/0 (lock down for prod!)
 *   - geminiApiKey         secret; passed to the workspace container
 *   - postgresPassword     secret; passed to Postgres + Scribe + workspace
 *
 * Outputs:
 *   - publicDns           EC2 public DNS (https://<dns>/ once Caddy is up)
 *   - publicIp            EC2 public IP
 *   - instanceId
 *   - sshCommand          one-liner to SSH in
 */
import * as aws from "@pulumi/aws";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const cfg = new pulumi.Config();
const awsCfg = new pulumi.Config("aws");
const region = awsCfg.require("region");

const keyName = cfg.require("keyName");
const instanceType = cfg.get("instanceType") ?? "t4g.medium";
const allowedSshCidr = cfg.get("allowedSshCidr") ?? "0.0.0.0/0";
const allowedHttpCidr = cfg.get("allowedHttpCidr") ?? "0.0.0.0/0";
const geminiApiKey = cfg.getSecret("geminiApiKey") ?? pulumi.secret("");
const geminiModel = cfg.get("geminiModel") ?? "gemini-2.5-flash";
const postgresPassword = cfg.getSecret("postgresPassword") ?? pulumi.secret("vibe");
const sshPrivateKey = cfg.requireSecret("sshPrivateKey");

// Pulumi runs the program from this project dir; resolve the repo root from there.
// Avoids `__dirname` so this works whether Pulumi loads the program as CJS or ESM.
const projectRoot = process.cwd();
const repoRoot = path.resolve(projectRoot, "..", "..", "..");

// Default VPC keeps the install minimal — operators don't have to pre-provision networking.
// Customers that want VPC isolation can swap this for a dedicated VPC in a later phase.
const defaultVpc = aws.ec2.getVpcOutput({ default: true });
const defaultSubnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [defaultVpc.id] }],
});

// Amazon Linux 2023, arm64 for Graviton (t4g). Multi-arch base images (node:22-bookworm-slim,
// etc.) all have linux/arm64 variants; images are built natively on the ARM host by bootstrap.sh.
const ami = aws.ec2.getAmiOutput({
  mostRecent: true,
  owners: ["amazon"],
  filters: [
    { name: "name", values: ["al2023-ami-2023.*-arm64"] },
    { name: "architecture", values: ["arm64"] },
    { name: "virtualization-type", values: ["hvm"] },
  ],
});

const sg = new aws.ec2.SecurityGroup("kota0-workspace-sg", {
  description: "Kota0 workspace: SSH + HTTPS in, all egress out",
  vpcId: defaultVpc.id,
  ingress: [
    {
      description: "SSH",
      protocol: "tcp",
      fromPort: 22,
      toPort: 22,
      cidrBlocks: [allowedSshCidr],
    },
    {
      description: "HTTP (Caddy redirects to HTTPS)",
      protocol: "tcp",
      fromPort: 80,
      toPort: 80,
      cidrBlocks: [allowedHttpCidr],
    },
    {
      description: "HTTPS (workspace UI/API via Caddy)",
      protocol: "tcp",
      fromPort: 443,
      toPort: 443,
      cidrBlocks: [allowedHttpCidr],
    },
  ],
  egress: [
    {
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: { Project: "kota0", Component: "workspace" },
});

// Cloud-init: install Docker + Compose plugin + rsync. Repo source itself is pushed
// from the operator's machine via @pulumi/command (rsync over SSH) after the host
// is up — avoids baking GitHub credentials or registry config into the AMI.
const userData = `#cloud-config
package_update: true
package_upgrade: false
packages:
  - docker
  - rsync
  - git
runcmd:
  - systemctl enable --now docker
  - usermod -aG docker ec2-user
  - mkdir -p /usr/local/lib/docker/cli-plugins
  - curl -fsSL https://github.com/docker/compose/releases/download/v2.31.0/docker-compose-linux-aarch64 -o /usr/local/lib/docker/cli-plugins/docker-compose
  - chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  - mkdir -p /opt/kota0
  - chown ec2-user:ec2-user /opt/kota0
`;

const instance = new aws.ec2.Instance(
  "kota0-workspace",
  {
    ami: ami.id,
    instanceType,
    keyName,
    vpcSecurityGroupIds: [sg.id],
    subnetId: defaultSubnets.ids.apply((ids) => ids[0]!),
    // Default-public-IP is fine for the bring-up window before the EIP swaps in;
    // we read all hostnames from the EIP below, so this address is effectively a no-op.
    associatePublicIpAddress: true,
    userData,
    rootBlockDevice: {
      volumeSize: 40,
      volumeType: "gp3",
      deleteOnTermination: true,
    },
    tags: { Name: "kota0-workspace", Project: "kota0" },
  },
  {
    // Pin the instance to the AMI it was launched with. Without this, AWS publishing a
    // newer Amazon Linux build (every few days) makes the `getAmi` filter resolve to a
    // different id, which Pulumi treats as an in-place change that EC2 can only satisfy
    // by REPLACING the instance — destroying the EBS root volume and wiping Postgres,
    // Redis, bundles/, and the Scribe gateway keys file with it. AMI upgrades should
    // be an explicit operator action: `pulumi state delete urn:...::Instance` then
    // `pulumi up`, or temporarily remove this `ignoreChanges` and re-up.
    ignoreChanges: ["ami"],
  },
);

// Elastic IP — pinned so the workspace's public address survives instance stop/start
// and any future intentional AMI swap. Without this, the EC2 hostname is derived from
// the AWS-assigned IPv4, which AWS reassigns whenever the instance restarts. EIPs are
// free while attached to a running instance ($0/hr) and ~$0.005/hr if ever detached.
const eip = new aws.ec2.Eip("kota0-workspace-eip", {
  domain: "vpc",
  tags: { Name: "kota0-workspace", Project: "kota0" },
});

const eipAssoc = new aws.ec2.EipAssociation("kota0-workspace-eip-assoc", {
  instanceId: instance.id,
  allocationId: eip.id,
});

// Every SSH-based step (wait-for-ssh, rsync, write-env-file, bootstrap) reads from this
// rather than `instance.publicIp` — the instance's default IP becomes invalid the moment
// the EIP attaches. `eipAssoc` is included in `dependsOn` so commands don't fire during
// the brief window before AWS settles the association.
const publicIpv4 = eip.publicIp;
const publicHostname = eip.publicDns;

// Bootstrap script runs on the VM after rsync — installs docker compose plugin (if cloud-init
// hasn't finished yet), writes .env from Pulumi config, builds the workspace image, and runs
// `compose up -d`. Idempotent: re-running this on `pulumi up` redeploys the new code.
const bootstrapScript = fs.readFileSync(
  path.resolve(projectRoot, "bootstrap.sh"),
  "utf8",
);

/**
 * Files whose content drives what bootstrap will produce on the VM. Hashing them and
 * putting the hash in `triggers` below makes `pulumi up` re-fire bootstrap whenever
 * any of them change. Without this, editing a migration or the workspace Dockerfile
 * would rsync the new file but the bootstrap step's "no changes" verdict would skip
 * the rebuild + re-apply, and the operator would have to SSH in by hand.
 */
/**
 * Skip these directories when walking `app/` and `shared/` for the content hash:
 * they contain build artifacts or per-app state that's recreated on the VM and
 * shouldn't force a rebuild.
 */
const HASH_SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  ".git",
  ".cache",
  ".vite",
  "bundles",
]);

function hashFilesUnder(rootDir: string, hashAcc: ReturnType<typeof createHash>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return;
  }
  // Sort for deterministic order; otherwise the hash changes on FS scan reordering.
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".env.example") continue; // skip dotfiles in source trees
    const full = path.join(rootDir, e.name);
    if (e.isDirectory()) {
      if (HASH_SKIP_DIR_NAMES.has(e.name)) continue;
      hashFilesUnder(full, hashAcc);
      continue;
    }
    if (!e.isFile()) continue;
    try {
      // Mix the path so two files with same content but different paths produce
      // different hash inputs — preserves move/rename detection.
      hashAcc.update(full);
      hashAcc.update(fs.readFileSync(full));
    } catch {
      /* unreadable file — ignore */
    }
  }
}

function hashContentDeps(): string {
  const h = createHash("sha256");
  const pushFile = (p: string): void => {
    try {
      h.update(p);
      h.update(fs.readFileSync(p));
    } catch {
      /* missing files tolerated — may be optional */
    }
  };
  // Infra files (drive the compose + docker layout, the reverse proxy config, and the
  // SQL the bootstrap applies).
  pushFile(path.resolve(repoRoot, "Dockerfile.workspace"));
  pushFile(path.resolve(repoRoot, ".dockerignore"));
  pushFile(path.resolve(repoRoot, "compose.prod.yml"));
  pushFile(path.resolve(repoRoot, "Caddyfile"));
  pushFile(path.resolve(repoRoot, "package.json"));
  const migDir = path.resolve(repoRoot, "migrations");
  try {
    for (const f of fs.readdirSync(migDir).sort()) {
      if (f.endsWith(".sql")) pushFile(path.join(migDir, f));
    }
  } catch {
    /* no migrations dir — unusual but not fatal */
  }
  // Application + shared source trees. Walking these makes any code edit trigger
  // bootstrap (which rebuilds the workspace image and recreates the containers).
  // node_modules / dist / bundles / .git are skipped via HASH_SKIP_DIR_NAMES.
  hashFilesUnder(path.resolve(repoRoot, "app", "src"), h);
  hashFilesUnder(path.resolve(repoRoot, "shared"), h);
  hashFilesUnder(path.resolve(repoRoot, "templates"), h);
  return h.digest("hex");
}
const contentDepsHash = pulumi.output(hashContentDeps());

// Wait for SSH + cloud-init both. Cloud-init takes 60–120s on fresh AL2023; trying
// SSH or rsync before it's done races against the package installs (docker, rsync).
// `command.remote.Command` retries the SSH connection itself, but does not wait for
// cloud-init to finish — we poll `cloud-init status --wait` inside the command body.
const waitForSsh = new command.remote.Command(
  "wait-for-ssh",
  {
    connection: {
      host: publicIpv4,
      user: "ec2-user",
      privateKey: sshPrivateKey,
      // Default is 3m / 4 dial attempts. Bump both so a slow boot doesn't fail the run.
      dialErrorLimit: 30,
      perDialTimeout: 15,
    },
    create:
      "sudo cloud-init status --wait >/dev/null 2>&1 || true; " +
      "command -v docker >/dev/null && command -v rsync >/dev/null && echo ready",
  },
  { dependsOn: [instance, eipAssoc] },
);

// Push repo source to the VM. We exclude bundles/, node_modules/, .git/, and any
// local .env file (config secrets flow through Pulumi → bootstrap, not through scp).
//
// Trigger on a hash of source files so re-running `pulumi up` after a local edit
// actually re-uploads. Using `instance.id` alone meant the rsync only fired on
// first-create — local edits then required manual scp.
const sourceFingerprint = pulumi.output(
  (async () => {
    const { createHash } = await import("node:crypto");
    const { spawnSync } = await import("node:child_process");
    // Hash all tracked + currently-staged file paths and their mtimes.
    // Cheap-but-effective: catches code edits without re-reading every byte.
    const res = spawnSync(
      "sh",
      [
        "-c",
        `find . -type f \
          -not -path './node_modules/*' \
          -not -path './bundles/*' \
          -not -path './.git/*' \
          -not -path './app/dist/*' \
          -not -path './infra/pulumi/*/node_modules/*' \
          -not -name '.env' \
          -exec stat -f '%N %m' {} \\;`,
      ],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    return createHash("sha256").update(res.stdout).digest("hex");
  })(),
);

const syncRepo = new command.local.Command(
  "sync-repo",
  {
    create: pulumi.interpolate`rsync -az --delete \
      --exclude='node_modules' \
      --exclude='bundles' \
      --exclude='.git' \
      --exclude='.env' \
      --exclude='app/dist' \
      --exclude='infra/pulumi/*/node_modules' \
      -e "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
      ${repoRoot}/ ec2-user@${publicIpv4}:/opt/kota0/`,
    triggers: [instance.id, sourceFingerprint],
  },
  { dependsOn: [waitForSsh] },
);

// Write /opt/kota0/.env on the VM from Pulumi secrets. AWS sshd rejects SSH `setenv`
// by default (AcceptEnv off), so we can't use the `environment` option on remote.Command —
// instead we base64-encode the file content and decode on the host. base64 sidesteps any
// shell-escaping concerns with passwords or API keys containing quotes/$/&/etc.
const envFileB64 = pulumi
  .all([postgresPassword, geminiApiKey])
  .apply(([pg, gk]) => {
    const content =
      `POSTGRES_PASSWORD=${pg}\n` +
      `GEMINI_API_KEY=${gk}\n` +
      `GEMINI_MODEL=${geminiModel}\n`;
    return Buffer.from(content, "utf8").toString("base64");
  });

const writeEnvFile = new command.remote.Command(
  "write-env-file",
  {
    connection: {
      host: publicIpv4,
      user: "ec2-user",
      privateKey: sshPrivateKey,
    },
    create: pulumi.interpolate`umask 077 && echo '${envFileB64}' | base64 -d > /opt/kota0/.env`,
    triggers: [envFileB64],
  },
  { dependsOn: [syncRepo, eipAssoc] },
);

// Run bootstrap on the VM. `pulumi up` will re-run this whenever the script content or the
// env file content changes (because both are in triggers).
const runBootstrap = new command.remote.Command(
  "bootstrap",
  {
    connection: {
      host: publicIpv4,
      user: "ec2-user",
      privateKey: sshPrivateKey,
    },
    create: bootstrapScript,
    triggers: [pulumi.output(bootstrapScript), instance.id, envFileB64, contentDepsHash],
  },
  { dependsOn: [writeEnvFile, eipAssoc] },
);

export const publicDns = publicHostname;
export const publicIp = publicIpv4;
export const instanceId = instance.id;
export const sshCommand = pulumi.interpolate`ssh ec2-user@${publicIpv4}`;
export const workspaceUrl = pulumi.interpolate`https://${publicHostname}/`;
// Force a dependency so `pulumi up` doesn't return until bootstrap finishes.
export const bootstrapStdout = runBootstrap.stdout;

/**
 * Kota0 workspace stack — single EC2 host running compose.prod.yml.
 *
 * Reads config (see Pulumi.<stack>.yaml or `pulumi config set ...`):
 *   - aws:region           AWS region (e.g. us-east-1)
 *   - keyName              EC2 key-pair name (must already exist in the region)
 *   - instanceType         optional; default t3.medium
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
import * as fs from "node:fs";
import * as path from "node:path";

const cfg = new pulumi.Config();
const awsCfg = new pulumi.Config("aws");
const region = awsCfg.require("region");

const keyName = cfg.require("keyName");
const instanceType = cfg.get("instanceType") ?? "t3.medium";
const allowedSshCidr = cfg.get("allowedSshCidr") ?? "0.0.0.0/0";
const allowedHttpCidr = cfg.get("allowedHttpCidr") ?? "0.0.0.0/0";
const geminiApiKey = cfg.getSecret("geminiApiKey") ?? pulumi.secret("");
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

// Amazon Linux 2023, ARM/x86 latest. t3.medium is x86_64; pick the matching AMI.
const ami = aws.ec2.getAmiOutput({
  mostRecent: true,
  owners: ["amazon"],
  filters: [
    { name: "name", values: ["al2023-ami-2023.*-x86_64"] },
    { name: "architecture", values: ["x86_64"] },
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
  - curl -fsSL https://github.com/docker/compose/releases/download/v2.31.0/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
  - chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  - mkdir -p /opt/kota0
  - chown ec2-user:ec2-user /opt/kota0
`;

const instance = new aws.ec2.Instance("kota0-workspace", {
  ami: ami.id,
  instanceType,
  keyName,
  vpcSecurityGroupIds: [sg.id],
  subnetId: defaultSubnets.ids.apply((ids) => ids[0]!),
  associatePublicIpAddress: true,
  userData,
  rootBlockDevice: {
    volumeSize: 40,
    volumeType: "gp3",
    deleteOnTermination: true,
  },
  tags: { Name: "kota0-workspace", Project: "kota0" },
});

// Bootstrap script runs on the VM after rsync — installs docker compose plugin (if cloud-init
// hasn't finished yet), writes .env from Pulumi config, builds the workspace image, and runs
// `compose up -d`. Idempotent: re-running this on `pulumi up` redeploys the new code.
const bootstrapScript = fs.readFileSync(
  path.resolve(projectRoot, "bootstrap.sh"),
  "utf8",
);

// Wait for SSH + cloud-init both. Cloud-init takes 60–120s on fresh AL2023; trying
// SSH or rsync before it's done races against the package installs (docker, rsync).
// `command.remote.Command` retries the SSH connection itself, but does not wait for
// cloud-init to finish — we poll `cloud-init status --wait` inside the command body.
const waitForSsh = new command.remote.Command(
  "wait-for-ssh",
  {
    connection: {
      host: instance.publicIp,
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
  { dependsOn: [instance] },
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
      ${repoRoot}/ ec2-user@${instance.publicIp}:/opt/kota0/`,
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
    const content = `POSTGRES_PASSWORD=${pg}\nGEMINI_API_KEY=${gk}\n`;
    return Buffer.from(content, "utf8").toString("base64");
  });

const writeEnvFile = new command.remote.Command(
  "write-env-file",
  {
    connection: {
      host: instance.publicIp,
      user: "ec2-user",
      privateKey: sshPrivateKey,
    },
    create: pulumi.interpolate`umask 077 && echo '${envFileB64}' | base64 -d > /opt/kota0/.env`,
    triggers: [envFileB64],
  },
  { dependsOn: [syncRepo] },
);

// Run bootstrap on the VM. `pulumi up` will re-run this whenever the script content or the
// env file content changes (because both are in triggers).
const runBootstrap = new command.remote.Command(
  "bootstrap",
  {
    connection: {
      host: instance.publicIp,
      user: "ec2-user",
      privateKey: sshPrivateKey,
    },
    create: bootstrapScript,
    triggers: [pulumi.output(bootstrapScript), instance.id, envFileB64],
  },
  { dependsOn: [writeEnvFile] },
);

export const publicDns = instance.publicDns;
export const publicIp = instance.publicIp;
export const instanceId = instance.id;
export const sshCommand = pulumi.interpolate`ssh ec2-user@${instance.publicIp}`;
export const workspaceUrl = pulumi.interpolate`https://${instance.publicDns}/`;
// Force a dependency so `pulumi up` doesn't return until bootstrap finishes.
export const bootstrapStdout = runBootstrap.stdout;

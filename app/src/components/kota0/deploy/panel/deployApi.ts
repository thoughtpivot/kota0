/** Browser-side client for the Deploy routes in Kota0.backend.ts. */
import type { DeploymentRow } from "@/components/kota0/deploy/panel/deploymentTypes";

function apiPath(path: string): string {
  const explicit = (import.meta.env.VITE_KOA_ORIGIN as string | undefined)?.trim();
  if (explicit) return `${explicit.replace(/\/$/, "")}${path}`;
  return path;
}

async function parseJson(r: Response): Promise<unknown> {
  const text = await r.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown; message?: unknown };
    if (typeof b.message === "string" && b.message.length > 0) return b.message;
    if (typeof b.error === "string" && b.error.length > 0) return b.error;
  }
  return fallback;
}

export type PostDeployResult =
  | { ok: true; deployment: DeploymentRow }
  | { ok: false; status: number; message: string };

export async function postDeploy(appId: string): Promise<PostDeployResult> {
  const r = await fetch(apiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/deploy`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = (await parseJson(r)) as { deployment?: DeploymentRow };
  if (!r.ok) {
    return { ok: false, status: r.status, message: extractMessage(body, `Deploy failed (HTTP ${r.status})`) };
  }
  if (!body || typeof body !== "object" || !body.deployment) {
    return { ok: false, status: r.status, message: "Malformed deploy response" };
  }
  return { ok: true, deployment: body.deployment };
}

export type FetchDeploymentsResult =
  | { ok: true; deployments: DeploymentRow[] }
  | { ok: false; status: number; message: string };

export async function fetchDeployments(appId: string): Promise<FetchDeploymentsResult> {
  const r = await fetch(apiPath(`/api/kota0/apps/${encodeURIComponent(appId)}/deployments`), {
    cache: "no-store",
  });
  const body = (await parseJson(r)) as { deployments?: DeploymentRow[] };
  if (!r.ok) {
    return { ok: false, status: r.status, message: extractMessage(body, `Fetch deployments failed (HTTP ${r.status})`) };
  }
  if (!body || !Array.isArray(body.deployments)) {
    return { ok: false, status: r.status, message: "Malformed deployments response" };
  }
  return { ok: true, deployments: body.deployments };
}

export type DeleteDeploymentResult =
  | { ok: true; deployment: DeploymentRow }
  | { ok: false; status: number; message: string };

export async function deleteDeployment(deploymentId: string): Promise<DeleteDeploymentResult> {
  const r = await fetch(apiPath(`/api/kota0/deployments/${encodeURIComponent(deploymentId)}`), {
    method: "DELETE",
  });
  const body = (await parseJson(r)) as { deployment?: DeploymentRow };
  if (!r.ok) {
    return { ok: false, status: r.status, message: extractMessage(body, `Destroy failed (HTTP ${r.status})`) };
  }
  if (!body || typeof body !== "object" || !body.deployment) {
    return { ok: false, status: r.status, message: "Malformed destroy response" };
  }
  return { ok: true, deployment: body.deployment };
}

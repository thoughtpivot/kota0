/** Same-origin path segment — Vite dev proxies this to bundle Flight on 127.0.0.1:4000. */
export const K0_BUNDLE_PREVIEW_PROXY_PREFIX = "/__k0_bundle";

/**
 * Same-origin path segment for **deployed** bundles. A request to
 * `<workspace>/__k0_deploy/<deploymentId>/...` is reverse-proxied by the workspace to the
 * deployed container's host port (looked up via the k0_deployment Scribe row's
 * `endpoint_url`). Lets a deployed app be reachable through the workspace's existing
 * HTTPS endpoint without a per-app domain or open security-group port.
 */
export const K0_DEPLOY_PROXY_PREFIX = "/__k0_deploy";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makePortConflictError,
  parseNpmInstallError,
  parseViteBuildError,
} from "@/components/kota0/deploy/kota0BundleBuildErrorParse";

describe("parseViteBuildError", () => {
  it("parses Rollup unresolved-import (the leaflet case) into missing_import", () => {
    const stderr = [
      "vite v7.3.3 building client environment for production...",
      "transforming...",
      "✓ 11 modules transformed.",
      '✗ Build failed in 369ms',
      "error during build:",
      '[vite]: Rollup failed to resolve import "leaflet" from "/Users/milush/Work/kota0/bundles/aaa/App.vue?vue&type=script&setup=true&lang.ts".',
      "This is most likely unintended because it can break your application at runtime.",
    ].join("\n");
    const err = parseViteBuildError(stderr);
    assert.ok(err, "expected a parsed error");
    assert.equal(err!.kind, "missing_import");
    assert.equal(err!.module, "leaflet");
    assert.match(err!.importedFrom ?? "", /App\.vue/);
    assert.ok(err!.rawLines.length > 0);
  });

  it("falls back to vite_build_error when no known pattern matches", () => {
    const stderr = [
      "vite v7.3.3 building client environment for production...",
      "✗ Build failed in 50ms",
      "error during build:",
      "SyntaxError: Unexpected token (12:5)",
    ].join("\n");
    const err = parseViteBuildError(stderr);
    assert.ok(err);
    assert.equal(err!.kind, "vite_build_error");
    assert.match(err!.message, /vite v7\.3\.3|✗ Build failed|SyntaxError/);
  });

  it("returns null on empty buffer", () => {
    assert.equal(parseViteBuildError(""), null);
  });
});

describe("parseNpmInstallError", () => {
  it("captures 404 registry errors with the module name", () => {
    const stderr = [
      "npm warn deprecated foo@1.0.0: not great",
      "npm error code E404",
      "npm error 404 Not Found - GET https://registry.npmjs.org/leafletzzz - Not found",
      "npm error 404 'leafletzzz@latest' is not in this registry.",
    ].join("\n");
    const err = parseNpmInstallError(stderr);
    assert.equal(err.kind, "npm_install_error");
    assert.equal(err.module, "leafletzzz");
    assert.match(err.message, /404/);
  });

  it("falls back to generic message on opaque errors", () => {
    const err = parseNpmInstallError("npm error EPERM operation not permitted");
    assert.equal(err.kind, "npm_install_error");
    assert.match(err.message, /npm error EPERM/);
  });
});

describe("makePortConflictError", () => {
  it("produces a port_conflict snapshot", () => {
    const err = makePortConflictError(4000, ["eaddrinuse", "Flight failed to bind"]);
    assert.equal(err.kind, "port_conflict");
    assert.match(err.message, /4000/);
    assert.deepEqual(err.rawLines, ["eaddrinuse", "Flight failed to bind"]);
  });
});

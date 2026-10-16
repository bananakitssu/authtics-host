// src/rendererTempFiles.ts
import fs from "node:fs";
import path from "node:path";
import type { BuildStyle } from "./config.js";

let activeBuildStyle: BuildStyle = "default";
let activeProjectRoot = process.cwd();

function hostjsDir(): string {
  return path.join(activeProjectRoot, ".hostjs");
}

function legacyDir(): string {
  return path.join(activeProjectRoot, ".authtics_host");
}

function artifactName(tsxPath: string, variant = "normal"): string {
  const base = path.basename(tsxPath);
  const hash = simpleHash(`${tsxPath}:${variant}`);
  return `${base}_${hash}`;
}

/**
 * Sets the output layout for this HostJS app. Call once after loading config,
 * before rendering pages, so every renderer uses the same output root.
 */
export function setBuildStyle(style: BuildStyle, projectRoot = process.cwd()): void {
  if (style !== "default" && style !== "super") {
    throw new Error('[HostJS] Invalid buildStyle. Expected "default" or "super".');
  }
  activeBuildStyle = style;
  activeProjectRoot = path.resolve(projectRoot);
  ensureTempDirs();
}

export function getBuildStyle(): BuildStyle {
  return activeBuildStyle;
}

export function getBuildOutputRoot(): string {
  return activeBuildStyle === "super" ? hostjsDir() : legacyDir();
}

export function ensureTempDirs(): void {
  if (activeBuildStyle === "default") {
    fs.mkdirSync(legacyDir(), { recursive: true });
    fs.mkdirSync(path.join(legacyDir(), "cache"), { recursive: true });
    fs.mkdirSync(path.join(legacyDir(), "dev-cache"), { recursive: true });
    return;
  }

  const dirs = [
    path.join(hostjsDir(), "cache", "bundler", "client-production"),
    path.join(hostjsDir(), "cache", "bundler", "server-production"),
    path.join(hostjsDir(), "cache", "bundler", "edge-server-production"),
    path.join(hostjsDir(), "diagnostics"),
    path.join(hostjsDir(), "server", "app"),
    path.join(hostjsDir(), "server", "pages"),
    path.join(hostjsDir(), "server", "chunks"),
    path.join(hostjsDir(), "server", "route-cache"),
    path.join(hostjsDir(), "types", "app"),
    path.join(hostjsDir(), "dev"),
    path.join(hostjsDir(), "trace"),
    path.join(hostjsDir(), "trace-build"),
  ];
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Returns the JSON metadata/cache file for a TSX source file.
 * The basename and short hash avoid collisions between similarly named routes.
 */
export function tempFileForTsx(tsxPath: string, variant = "normal"): string {
  ensureTempDirs();
  const name = artifactName(tsxPath, variant);
  const dir = activeBuildStyle === "super"
    ? path.join(hostjsDir(), "server", "route-cache")
    : path.join(legacyDir(), "cache");
  return path.join(dir, `${name}.json`);
}

export function clientBundleForTsx(tsxPath: string, variant = "normal"): string {
  ensureTempDirs();
  if (activeBuildStyle === "default") {
    return tempFileForTsx(tsxPath, variant).replace(/\.json$/, ".client.js");
  }
  return path.join(
    hostjsDir(),
    "cache",
    "bundler",
    "client-production",
    `${artifactName(tsxPath, variant)}.js`
  );
}

export function serverBundleForTsx(
  tsxPath: string,
  variant = "normal",
  tempPath?: string
): string {
  ensureTempDirs();
  if (activeBuildStyle === "default") {
    return (tempPath ?? tempFileForTsx(tsxPath, variant)).replace(/\.json$/, ".server.cjs");
  }
  return path.join(
    hostjsDir(),
    "cache",
    "bundler",
    "server-production",
    `${artifactName(tsxPath, variant)}.server.cjs`
  );
}

export function ssgHtmlForTsx(
  tsxPath: string,
  variant = "normal",
  tempPath?: string
): string {
  ensureTempDirs();
  if (activeBuildStyle === "default") {
    return (tempPath ?? tempFileForTsx(tsxPath, variant)).replace(/\.json$/, ".ssg.html");
  }
  return path.join(
    hostjsDir(),
    "server",
    "route-cache",
    `${artifactName(tsxPath, variant)}.ssg.html`
  );
}

export function tempFileForDev(): string {
  ensureTempDirs();
  return activeBuildStyle === "super"
    ? path.join(hostjsDir(), "dev", "page.cache.json")
    : path.join(legacyDir(), "dev-cache", "page.cache.json");
}

/** Returns true if the cache file exists and is at least as new as the source file. */
export function isTempUpToDate(tsxPath: string, tempPath: string): boolean {
  try {
    const srcMtime = fs.statSync(tsxPath).mtimeMs;
    const cacheMtime = fs.statSync(tempPath).mtimeMs;
    return cacheMtime >= srcMtime;
  } catch {
    return false;
  }
}

export function writeTempFile(tempPath: string, content: string): void {
  fs.mkdirSync(path.dirname(tempPath), { recursive: true });
  fs.writeFileSync(tempPath, content, "utf-8");
}

export function readTempFile(tempPath: string): string {
  return fs.readFileSync(tempPath, "utf-8");
}

/** Clears compiler and route caches without deleting manifests or diagnostics. */
export function clearCache(): void {
  if (activeBuildStyle === "default") {
    fs.rmSync(path.join(legacyDir(), "cache"), { recursive: true, force: true });
  } else {
    for (const dir of [
      path.join(hostjsDir(), "cache", "bundler"),
      path.join(hostjsDir(), "server", "route-cache"),
    ]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  ensureTempDirs();
}

/** Tiny non-cryptographic hash — good enough to avoid filename collisions. */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).slice(0, 6);
}

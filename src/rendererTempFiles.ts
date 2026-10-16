// src/rendererTempFiles.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// Directory layout:
//   <project>/.authtics_host/
//     cache/          ← compiled server+client bundles (JSON, keyed by source)
// ---------------------------------------------------------------------------

const AUTHTICS_DIR = path.join(process.cwd(), ".authtics_host");
const DEV_CACHE_DIR = path.join(AUTHTICS_DIR, "dev-cache");
const CACHE_DIR = path.join(AUTHTICS_DIR, "cache");

export function ensureTempDirs(): void {
  if (!fs.existsSync(AUTHTICS_DIR)) fs.mkdirSync(AUTHTICS_DIR, { recursive: true });
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(DEV_CACHE_DIR)) fs.mkdirSync(DEV_CACHE_DIR, { recursive: true });
}

/**
 * Returns the cache file path for a given source .tsx file.
 * Uses the basename + a short hash of the full path to avoid collisions
 * between files named the same thing in different directories.
 *
 * Example: /project/pages/about.tsx → .authtics_host/cache/about.tsx_a3f9b2.json
 */
export function tempFileForTsx(
  tsxPath: string,
  variant = "normal"
): string {
  ensureTempDirs();

  const base = path.basename(tsxPath);
  const hash = simpleHash(`${tsxPath}:${variant}`);

  return path.join(
    CACHE_DIR,
    `${base}_${hash}.json`
  );
}

export function tempFileForDev(): string {
  ensureTempDirs();
  return path.join(DEV_CACHE_DIR, "page.cache.json")
}

/**
 * Returns true if the cache file exists and is at least as new as the source file.
 */
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
  fs.writeFileSync(tempPath, content, "utf-8");
}

export function readTempFile(tempPath: string): string {
  return fs.readFileSync(tempPath, "utf-8");
}

/**
 * Wipes the entire cache directory. Useful for a `authtics clean` CLI command.
 */
export function clearCache(): void {
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  }
  ensureTempDirs();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Tiny non-cryptographic hash — good enough to avoid filename collisions. */
function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).slice(0, 6);
}
import fs from "node:fs";
import path from "node:path";
const AUTHTICS_DIR = path.join(process.cwd(), ".authtics_host");
const DEV_CACHE_DIR = path.join(AUTHTICS_DIR, "dev-cache");
const CACHE_DIR = path.join(AUTHTICS_DIR, "cache");
export function ensureTempDirs() {
    if (!fs.existsSync(AUTHTICS_DIR))
        fs.mkdirSync(AUTHTICS_DIR, { recursive: true });
    if (!fs.existsSync(CACHE_DIR))
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (!fs.existsSync(DEV_CACHE_DIR))
        fs.mkdirSync(DEV_CACHE_DIR, { recursive: true });
}
export function tempFileForTsx(tsxPath, variant = "normal") {
    ensureTempDirs();
    const base = path.basename(tsxPath);
    const hash = simpleHash(`${tsxPath}:${variant}`);
    return path.join(CACHE_DIR, `${base}_${hash}.json`);
}
export function tempFileForDev() {
    ensureTempDirs();
    return path.join(DEV_CACHE_DIR, "page.cache.json");
}
export function isTempUpToDate(tsxPath, tempPath) {
    try {
        const srcMtime = fs.statSync(tsxPath).mtimeMs;
        const cacheMtime = fs.statSync(tempPath).mtimeMs;
        return cacheMtime >= srcMtime;
    }
    catch {
        return false;
    }
}
export function writeTempFile(tempPath, content) {
    fs.writeFileSync(tempPath, content, "utf-8");
}
export function readTempFile(tempPath) {
    return fs.readFileSync(tempPath, "utf-8");
}
export function clearCache() {
    if (fs.existsSync(CACHE_DIR)) {
        fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    }
    ensureTempDirs();
}
function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(16).slice(0, 6);
}

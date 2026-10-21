#!/usr/bin/env node

import { createServer, IncomingMessage, ServerResponse, Server } from "node:http";
import { createJiti } from "jiti";
import { createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import { renderPage, CompilerType, handleSrtwsConnection, deleteSrtwsServer, handleHTML } from "./renderEngine.js";
import { getBuildOutputRoot, setBuildStyle, tempFileForDev, tempFileForTsx } from "./rendererTempFiles.js";
import { initializeSuperBuildOutput, refreshSuperRouteManifest } from "./superBuildOutput.js";
import type { BuildStyle } from "./config.js";
//import tls from 'tls';
let config_: any = {};
let uptime = 0;
let totalRequests = 0;
let users = 0;
let usersPaused = false;
let srtws: any;

const jiti = createJiti(import.meta.url);
type RouteHandler = (
  req: IncomingMessage, 
  res: ServerResponse, 
  id?: bigint | null,
  next?: Function
) => void;
const routes = new Map<string, RouteHandler | string>();
/*const routes = new Map<
  string, 
  ((req: IncomingMessage, res: ServerResponse) => void) | 
  ((req: IncomingMessage, res: ServerResponse, id: number | null, next: Function) => void) | 
  string
>();*/
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SSE clients waiting for hot reload signals
const hmrClients = new Set<ServerResponse>();

const DAT_GUESS_WINDOW_MS = 30 * 60 * 1000;
const DAT_DISTINCT_GUESS_LIMIT = 5;
const DAT_IP_BLOCK_MS = 24 * 60 * 60 * 1000;
const ACTION_RATE_WINDOW_MS = 60 * 1000;

type ActionRateRule = {
  maxRequests: number;
  windowMs: number;
  bucket: "pause" | "lifecycle";
};

const ACTION_RATE_RULES: Record<string, ActionRateRule> = {
  "/__authtics_host_apis__/set-users-paused": {
    maxRequests: 5,
    windowMs: ACTION_RATE_WINDOW_MS,
    bucket: "pause",
  },
  "/__authtics_host_apis__/restart": {
    maxRequests: 1,
    windowMs: ACTION_RATE_WINDOW_MS,
    bucket: "lifecycle",
  },
  "/__authtics_host_apis__/shutdown": {
    maxRequests: 1,
    windowMs: ACTION_RATE_WINDOW_MS,
    bucket: "lifecycle",
  },
};

const failedDatGuesses = new Map<string, Map<string, number>>();
const blockedDatIps = new Map<string, number>();
const actionRequestTimes = new Map<string, number[]>();
let datLockoutFile = "";
let lastDatSecurityCleanupAt = 0;

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clientIpForRateLimit(req: IncomingMessage): string {
  return (req.ip || req.socket.remoteAddress || "unknown").trim();
}

function persistDatLockouts(): void {
  if (!datLockoutFile) return;

  try {
    fs.mkdirSync(path.dirname(datLockoutFile), { recursive: true });
    const temporaryPath = `${datLockoutFile}.${process.pid}.tmp`;
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(Object.fromEntries(blockedDatIps)),
      { encoding: "utf8", mode: 0o600 },
    );
    try {
      fs.chmodSync(temporaryPath, 0o600);
    } catch {
      // File permissions are best-effort on platforms that don't support POSIX modes.
    }
    fs.renameSync(temporaryPath, datLockoutFile);
  } catch (error) {
    console.error("[HostJS] Could not persist DAT lockouts:", error);
  }
}

function loadDatLockouts(): void {
  if (!datLockoutFile) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(datLockoutFile, "utf8")) as Record<string, unknown>;
    const now = Date.now();

    for (const [ipHash, until] of Object.entries(parsed)) {
      if (typeof until === "number" && until > now) {
        blockedDatIps.set(ipHash, until);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[HostJS] Could not read DAT lockouts; starting with an empty lockout list.");
    }
  }
}

function cleanupDatSecurityState(now: number): void {
  if (now - lastDatSecurityCleanupAt < 60_000) return;
  lastDatSecurityCleanupAt = now;

  for (const [ipHash, guesses] of failedDatGuesses) {
    for (const [candidateHash, timestamp] of guesses) {
      if (now - timestamp >= DAT_GUESS_WINDOW_MS) guesses.delete(candidateHash);
    }
    if (guesses.size === 0) failedDatGuesses.delete(ipHash);
  }

  for (const [key, timestamps] of actionRequestTimes) {
    const recent = timestamps.filter(timestamp => now - timestamp < ACTION_RATE_WINDOW_MS);
    if (recent.length === 0) actionRequestTimes.delete(key);
    else actionRequestTimes.set(key, recent);
  }

  let removedExpiredLockout = false;
  for (const [ipHash, until] of blockedDatIps) {
    if (until <= now) {
      blockedDatIps.delete(ipHash);
      removedExpiredLockout = true;
    }
  }
  if (removedExpiredLockout) persistDatLockouts();
}

function sendDatGuardResponse(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  retryAfterSeconds?: number,
): void {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(retryAfterSeconds);
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify({ error: code, message, retryAfter: retryAfterSeconds }));
}

function recordInvalidDatGuess(ipHash: string, suppliedDat: string, now: number): boolean {
  let guesses = failedDatGuesses.get(ipHash);
  if (!guesses) {
    guesses = new Map<string, number>();
    failedDatGuesses.set(ipHash, guesses);
  }

  for (const [candidateHash, timestamp] of guesses) {
    if (now - timestamp >= DAT_GUESS_WINDOW_MS) guesses.delete(candidateHash);
  }

  guesses.set(fingerprint(suppliedDat), now);

  if (guesses.size >= DAT_DISTINCT_GUESS_LIMIT) {
    blockedDatIps.set(ipHash, now + DAT_IP_BLOCK_MS);
    failedDatGuesses.delete(ipHash);
    persistDatLockouts();
    return true;
  }

  return false;
}

function checkActionRateLimit(
  ipHash: string,
  pathname: string,
  now: number,
): number | undefined {
  const rule = ACTION_RATE_RULES[pathname];
  if (!rule) return undefined;

  // Restart and shutdown share a bucket so alternating between them can't bypass the limit.
  const key = `${ipHash}:${rule.bucket}`;
  const recent = (actionRequestTimes.get(key) ?? [])
    .filter(timestamp => now - timestamp < rule.windowMs);

  if (recent.length >= rule.maxRequests) {
    actionRequestTimes.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + rule.windowMs - now) / 1000));
  }

  recent.push(now);
  actionRequestTimes.set(key, recent);
  return undefined;
}

function guardDatApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): boolean {
  const now = Date.now();
  cleanupDatSecurityState(now);
  const ipHash = fingerprint(clientIpForRateLimit(req));
  const blockedUntil = blockedDatIps.get(ipHash);

  if (blockedUntil !== undefined) {
    if (blockedUntil > now) {
      sendDatGuardResponse(
        res,
        429,
        "DAT_IP_BLOCKED",
        "DAT-protected endpoints are temporarily unavailable from this IP.",
        Math.ceil((blockedUntil - now) / 1000),
      );
      return false;
    }
    blockedDatIps.delete(ipHash);
    persistDatLockouts();
  }

  const configuredDats: string[] =
    typeof config_.dat === "string"
      ? [config_.dat]
      : Array.isArray(config_.dat)
        ? config_.dat.filter((value: unknown): value is string => typeof value === "string")
        : [];
  const datRestrictionEnabled = config_.dat !== undefined && config_.dat !== null;
  const datMatches =
    !datRestrictionEnabled ||
    configuredDats.includes(req.dat ?? "");

  if (datRestrictionEnabled && !datMatches) {
    const justBlocked = recordInvalidDatGuess(
      ipHash,
      req.dat ?? "<missing>",
      now,
    );

    if (justBlocked) {
      sendDatGuardResponse(
        res,
        429,
        "DAT_IP_BLOCKED",
        "Too many distinct invalid DAT values. DAT-protected endpoints are blocked for 24 hours.",
        Math.ceil(DAT_IP_BLOCK_MS / 1000),
      );
    } else {
      sendDatGuardResponse(res, 401, "INVALID_DAT", "DAT authorization failed.");
    }
    return false;
  }

  if (datRestrictionEnabled) {
    failedDatGuesses.delete(ipHash);
  }

  const retryAfter = checkActionRateLimit(ipHash, pathname, now);
  if (retryAfter !== undefined) {
    sendDatGuardResponse(
      res,
      429,
      "ACTION_RATE_LIMITED",
      "This action is temporarily rate-limited. Try again later.",
      retryAfter,
    );
    return false;
  }

  return true;
}

function safeWatch(target: string, onChange: () => void): void {
  const shouldReact = (filename: string | null): boolean => {
    if (!filename) return false;
    // Never react to cache/build artifacts
    if (filename.includes('.authtics_host')) return false;
    if (filename.includes('.hostjs')) return false;
    if (filename.includes('.upm')) return false;
    if (filename.includes('.tsbuildinfo')) return false;
    if (filename.includes('.local')) return false;
    if (filename.includes('.cache')) return false;
    if (filename.includes('node_modules')) return false;
    // Only react to source file types
    return /\.(tsx?|jsx?|html|css)$/i.test(filename);
  };

  try {
    const stat = fs.statSync(target);
    if (stat.isFile()) {
      fs.watch(target, (_et, filename) => { if (shouldReact(filename ?? target)) onChange(); });
      return;
    }
    fs.watch(target, { recursive: true }, (_et, filename) => {
      if (shouldReact(filename)) onChange();
    });
  } catch (err: any) {
    if (err.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM' || err.code === 'EINVAL' || err.code === 'ENOSYS') {
      try { fs.watch(target, (_et, f) => { if (shouldReact(f)) onChange(); }); } catch { }
      try {
        for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            try {
              const sub = path.join(target, entry.name);
              fs.watch(sub, (_et, f) => { if (shouldReact(f)) onChange(); });
            } catch { }
          }
        }
      } catch { }
    }
  }
}

let hmrDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function notifyHmrClients() {
  if (hmrDebounceTimer) clearTimeout(hmrDebounceTimer);

  hmrDebounceTimer = setTimeout(() => {
    hmrDebounceTimer = null;

    for (const client of hmrClients) {
      if (client.destroyed || client.writableEnded) {
        hmrClients.delete(client);
        continue;
      }

      try {
        client.write('data: reload\n\n');
      } catch {
        hmrClients.delete(client);
        client.destroy();
      }
    }
  }, 120);
}

// ---------------------------------------------------------------------------
// MIME types for static files in public/
// ---------------------------------------------------------------------------
/*const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp4':  'video/mp4',
  '.mp3':  'audio/mpeg',
  '.txt':  'text/plain',
  '.pdf':  'application/pdf',
  '.wasm': 'application/wasm',
  '.bin':  'application/octet-stream',
  '.tsx':  'text/tsx',
  '.c':    'text/x-csrc',
  '.cpp':  'text/x-c++src',
  '.cs':   'text/x-csharp',
  '.go':   'text/x-gosrc',
  '.elf':  'application/x-elf',
  '.exe':  'application/x-msdownload',
  '.o':    'application/x-object',
  '.so':   'application/x-sharedlib',
  '.dll':  'application/x-msdownload',
  '.iso':  'application/x-iso9660-image',
  '.img':  'application/octet-stream',
  '.dmg':  'application/x-apple-diskimage',
  '.zip':  'application/zip',
  '.tar':  'application/x-tar',
  '.gz':   'application/gzip',
  '.rar':  'application/vnd.rar',
  '.7z':   'application/x-7z-compressed',
  '.yaml': 'text/yaml',
  '.yml':  'text/yaml',
  '.xml':  'application/xml',
  '.toml': 'text/toml',
  '.ini':  'text/plain',
  '.md':   'text/markdown',
};*/
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.jsx': 'text/jsx',
  '.ts': 'text/typescript',
  '.tsx': 'text/tsx',
  '.json': 'application/json',
  '.jsonld': 'application/ld+json',
  '.map': 'application/json',
  '.c': 'text/x-csrc',
  '.cpp': 'text/x-c++src',
  '.h': 'text/x-chdr',
  '.hpp': 'text/x-c++hdr',
  '.cs': 'text/x-csharp',
  '.go': 'text/x-gosrc',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.php': 'application/x-httpd-php',
  '.java': 'text/x-java-source',
  '.kt': 'text/x-kotlin',
  '.swift': 'text/x-swift',
  '.rs': 'text/rust',
  '.sh': 'application/x-sh',
  '.bat': 'application/x-msdos-program',
  '.ps1': 'application/x-powershell',
  '.pl': 'text/x-perl',
  '.r': 'text/x-rsrc',
  '.sql': 'text/x-sql',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.elf': 'application/x-elf',
  '.exe': 'application/x-msdownload',
  '.dll': 'application/x-msdownload',
  '.o': 'application/x-object',
  '.a': 'application/x-archive',
  '.so': 'application/x-sharedlib',
  '.dylib': 'application/x-apple-binary',
  '.msi': 'application/x-msi',
  '.apk': 'application/vnd.android.package-archive',
  '.bin': 'application/octet-stream',
  '.iso': 'application/x-iso9660-image',
  '.img': 'application/octet-stream',
  '.dmg': 'application/x-apple-diskimage',
  '.vmdk': 'application/x-virtualbox-vmdk',
  '.vhd': 'application/x-vhd',
  '.qcow2': 'application/x-qcow2',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.bz2': 'application/x-bzip2',
  '.xz': 'application/x-xz',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.cab': 'application/vnd.ms-cab-compressed',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.psd': 'image/vnd.adobe.photoshop',
  '.ai': 'application/postscript',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.webm': 'video/webm',
  '.flv': 'video/x-flv',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/x-m4a',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.sqlite': 'application/vnd.sqlite3',
  '.sqlite3': 'application/vnd.sqlite3',
  '.db': 'application/octet-stream',
  '.mdb': 'application/x-msaccess',
  '.obj': 'model/obj',
  '.stl': 'model/stl',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.fbx': 'application/octet-stream',
  '.dae': 'model/vnd.collada+xml',
  '.3ds': 'image/x-3ds',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};


// ---------------------------------------------------------------------------
// Augment ServerResponse with helper methods
// ---------------------------------------------------------------------------
/*function augmentRes(res: ServerResponse) {
  const r = res as any;
  r.html = (html: string) => { res.setHeader("Content-Type", "text/html"); res.end(html); };
  r.json = (data: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
  r.text = (text: string) => { res.setHeader("Content-Type", "text/plain"); res.end(text); };
  r.status = (code: number) => { res.statusCode = code; return r; };
  return r;
}*/

const getCpu = (): Promise<number> => {
  return new Promise((resolve) => {
    const start = process.cpuUsage();
    setTimeout(() => {
      const end = process.cpuUsage(start);
      const total = (end.user + end.system) / 1000;
      resolve(total);
    }, 100);
  });
};

async function getJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    // 1. Immediate exit for methods that shouldn't have a body
    const hasBody = req.headers['content-length'] || req.headers['transfer-encoding'];
    if (!hasBody && (req.method === 'GET' || req.method === 'DELETE')) {
      return resolve({} as T);
    }

    /*const MAX_SIZE = 100 * 1024 * 1024;
let currentSize = 0;*/

    const chunks: Buffer[] = [];
    
    // 2. Safety Timeout: If it takes more than 5s, kill the request
    const timeout = setTimeout(() => {
      req.destroy();
      reject(new Error('Request Timeout: Body took too long to arrive'));
    }, 5000);

    req.on('data', (chunk: Buffer) => {
      /*currentSize += chunk.length;

      if (currentSize > MAX_SIZE) {
    req.destroy(); 
    reject(new Error('Payload Too Large: Maximum 100MB allowed'));
    return;
      }*/
      
      chunks.push(chunk);
    });

    req.on('end', () => {
      clearTimeout(timeout);
      try {
        const rawData = Buffer.concat(chunks).toString();
        resolve(rawData ? JSON.parse(rawData) : {} as T);
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}




// ---------------------------------------------------------------------------
// App class
// ---------------------------------------------------------------------------
export default class App {
  server: Server | null | undefined;
  
  constructor() {
    this.server = null;
    this.startServer();
    this.post('/__authtics_host_apis__/set-users-paused', async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        usersPaused = req.body.paused as boolean;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          message: "ok"
        }))
      }
    })
    this.post('/__authtics_host_apis__/is-users-paused', async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      res.writeHead(200, { "Content-Type": "application/json" });
      if (datMatched) {res.end(JSON.stringify({
        paused: (datMatched ? false : usersPaused),
        realInfo: usersPaused
      }))}
    })
    this.post('/__authtics_host_apis__/get-dat-restriction-missing', async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      let datRestrictedEnv = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat == undefined) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        if (config_.dat !== undefined) datRestrictedEnv = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          enabled: datRestrictedEnv
        }));
      }
    });
    this.post('/__authtics_host_apis__/get-dat-matching', async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat == undefined) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        isMatching: datMatched
      }));
    })
    this.post('/__authtics_host_apis__/get-cpu_memory', async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        const { heapUsed, heapTotal, rss } = process.memoryUsage();
        const cpuUsage = await getCpu();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          cpuUsage,
          heapUsed,
          heapTotal
        }))
      }
    })
    this.post('/__authtics_host_apis__/get-user-settings', async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          showError: config_.showError !== undefined ? config_.showError : true
        }));
      }
    })
    this.post("/__authtics_host_apis__/get-server-info", async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          uptime, totalRequests, users
        }))
      }
    })
    
    this.post("/__authtics_host_apis__/restart", async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Restarting..." }));
        const { spawn } = await import('node:child_process');
        const child = spawn(process.argv[0], process.argv.slice(1), {
          detached: true,
          stdio: 'inherit'
        });
        child.unref();
        this.server?.close(() => {
          process.kill(process.pid, 'SIGTERM')
        })
      }
    })
    this.post("/__authtics_host_apis__/shutdown", async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Shutting down..." }));
        this.server?.close(() => {
          process.kill(process.pid, 'SIGTERM');
        })
      }
    })
    this.post("/__authtics_host_apis__/get-render-type", async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          renderType: config_.renderType
        }))
      }
    })

        this.post("/__authtics_host_apis__/get-compiler", async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          compiler: config_.compilerType
        }))
      }
    })

    this.post("/__authtics_host_apis__/get-host-ver", async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        const packageJsonPath = path.join(__dirname, '../package.json');
        let packageJson;
        if (fs.existsSync(packageJsonPath)) packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const packageJsonVersion = packageJson.version || "Unknown";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          version: packageJsonVersion
        }))
      }
    })
    this.post("/__authtics_host_apis__/get-file-by-pathname", async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        const pathname = req.body.pathname;
        const pagesDir = config_.autoPage === true ? path.join(process.cwd(), config_.autoPageDir || "") : undefined;
        const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        let filePath = pagesDir ? path.join(pagesDir, (safePath !== "/" ? safePath : "index")+".tsx") : undefined;
        let fileExists = filePath ? fs.existsSync(filePath) : true;
        const publicDir = config_.autoFile === true ? path.join(process.cwd(), config_.autoFileDir || "") : undefined;
        if (publicDir && !fileExists) {
      const staticPath = path.join(publicDir, pathname);
      // Make sure the resolved path is still inside publicDir (prevent traversal)
      const safePath = path.resolve(staticPath);
      if (safePath.startsWith(path.resolve(publicDir))) {
        filePath = safePath;
        fileExists = fs.existsSync(safePath) && fs.statSync(safePath).isFile();
      }
    }

        if (pathname.startsWith("/api/") && pagesDir != null && !fileExists) {
      const apiFile = path.join(pagesDir, `${pathname}.ts`);
          const apiFileTsx = path.join(pagesDir, `${pathname}.tsx`);

          filePath = fs.existsSync(apiFile) ? apiFile : fs.existsSync(apiFileTsx) ? apiFileTsx : apiFile;
          fileExists = filePath == apiFileTsx ? fs.existsSync(apiFileTsx) : fs.existsSync(apiFile);
        }

       if (!fileExists) {
          filePath = "File is unresolvable. Could be because it's not found."
        }
        
        //const fileExists = filePath ? fs.existsSync(filePath) : true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          fileExists,
          filePath: (filePath ? filePath : "Cannot find file because autoPage is disabled.")
        }))
      }
    })
    this.post("/__authtics_host_apis__/ping", async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ status: "ok" }));
      }
    })
    this.post('/__authtics_host_apis__/get-connection', async (req, res) => {
      //const reqBody = (await getJsonBody(req)) as any;
      let datMatched = false;
      if (config_.dat && config_.dat == req.dat) datMatched = true;
      if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat)) datMatched = true;
      if (datMatched) {
        /*if (req.socket instanceof tls.TLSSocket) {
          const protocol = req.socket.getProtocol();
          const cipher = req.socket.getCipher();

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            protocol,
            cipher: cipher.name,
            httpVersion: req.httpVersion
          }))
        } else {*/
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            httpVersion: req.httpVersion
          }))
        //}
      }
    });
  }

  async startServer() {
    try {
        this.server = await start();
    } catch (error) {
        console.error("[HostJS] Server failed to start: ", error);
    }
  }

  registerApp(route: string) {
    routes.set(`APP_TSX`, route);
  }

  get(routePath: string, handler: (req: IncomingMessage, res: ServerResponse) => void) {
    routes.set(`GET:${routePath}`, handler);
  }

  post(routePath: string, handler: (req: IncomingMessage, res: ServerResponse) => void) {
    routes.set(`POST:${routePath}`, handler);
  }

  put(routePath: string, handler: (req: IncomingMessage, res: ServerResponse) => void) {
    routes.set(`PUT:${routePath}`, handler);
  }

  delete(routePath: string, handler: (req: IncomingMessage, res: ServerResponse) => void) {
    routes.set(`DELETE:${routePath}`, handler);
  }

  use(handler: (req: IncomingMessage, res: ServerResponse, id: bigint | null, next: Function) => void) {
    const randomMultiplier = BigInt(Math.floor(Math.random() * 1000000000));
    let newId = randomMultiplier * 1000000000000000000000000000000n;
    routes.set(`USE:${newId}`, handler as unknown as RouteHandler);
  }

  on(method: string, handler: (...args: any[]) => void) {
    if (this.server)
      this.server.on(method, handler);
  }

  remove(method: string, routePath: string) {
    if (routes.has(`${method}:${routePath}`))
    routes.delete(`${method}:${routePath}`);
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
/*export class AppServer {
  constructor() {
    this.start()
  }

  async start() {
    
  }
}*/
async function start() {
  //console.log("🛠️  Initializing Authtics Host...");

  let config: any = {};
  try {
    const configPath = path.join(process.cwd(), "authtics_host.config.ts");
    config = await jiti.import(configPath, { default: true });
    config_ = config;
  } catch {
    //console.log("ℹ️  No config found, using defaults.");
  }
  
  const requestedBuildStyle = config.buildStyle ?? "default";
  if (requestedBuildStyle !== "default" && requestedBuildStyle !== "super") {
    throw new Error('[HostJS] Invalid buildStyle. Expected "default" or "super".');
  }
  const buildStyle: BuildStyle = requestedBuildStyle;
  setBuildStyle(buildStyle, process.cwd());
  datLockoutFile = path.join(getBuildOutputRoot(), "security", "dat-lockouts.json");
  loadDatLockouts();

  const PORT = config.port ?? 3000;
  const renderType = config.renderType ?? 'ssr';
  const showPanel = config.devMode !== false;
  const autoPaging = config.autoPage !== false;
  const compiler: CompilerType = /*config.compilerType === 'babel' ? 'babel' : */'esbuild';
  const hotReload: boolean = config.hotReload === true;

  const pagesDir = config.autoPage === true ? path.join(process.cwd(), config.autoPageDir || "") : undefined;
  const publicDir = config.autoFile === true ? path.join(process.cwd(), config.autoFileDir || "") : undefined;
  const apiDir = pagesDir ? path.join(pagesDir, "api") : undefined;

  if (buildStyle === "super") {
    initializeSuperBuildOutput(process.cwd(), config, pagesDir, publicDir);
  }

  const server = createServer(async (req, res) => {
    //const body = await getJsonBody(req) as any;
    const { url = "/", method } = req;
    const actuallyShowPanel = showPanel/* && (config.dat != undefined ? (body.dat == config.dat || (Array.isArray(config.dat) && config.dat.includes(body.dat))) : true)*/
    req.ip = (
  req.headers["x-real-ip"] as string ||
  (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
  req.socket.remoteAddress ||
  undefined
);
    req.ipType = req.ip?.includes(":") ? 6 : req.ip?.includes(".") ? 4 : 0;
    req.ua = req.headers["user-agent"] || undefined;
    let ua = req.headers["user-agent"] || "";
    let browserType = "Unknown";
let browserVersion = "Unknown";

if (ua.includes("Chrome") && !ua.includes("Edg")) {
  browserType = "Chrome";
  browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] || "Unknown";
} else if (ua.includes("Firefox")) {
  browserType = "Firefox";
  browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] || "Unknown";
} else if (ua.includes("Safari") && !ua.includes("Chrome")) {
  browserType = "Safari";
  browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] || "Unknown";
} else if (ua.includes("Edg")) {
  browserType = "Edge";
  browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1] || "Unknown";
}
    let osType = "Unknown";
let osVersion = "Unknown";

if (ua.includes("Windows NT")) {
  osType = "Windows";
  osVersion = ua.match(/Windows NT ([\d.]+)/)?.[1] || "Unknown";
} else if (ua.includes("Mac OS X")) {
  osType = "macOS";
  osVersion = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, ".") || "Unknown";
} else if (ua.includes("Android")) {
  osType = "Android";
  osVersion = ua.match(/Android ([\d.]+)/)?.[1] || "Unknown";
} else if (ua.includes("iPhone") || ua.includes("iPad")) {
  osType = "iOS";
  osVersion = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, ".") || "Unknown";
} else if (ua.includes("Linux")) {
  osType = "Linux";
}
    req.os = {
      type: osType,
      version: osVersion
    }
    req.browser = {
      type: browserType,
      version: browserVersion
    }
    req.sentTime = Date.now();
    req.body = {};
    try {
      req.body = await getJsonBody(req) as any;
    } catch (e) {
      req.body = {}
    }
    req.cookies = {};
    const raw = req.headers.cookie;
    if (raw) {
      raw.split(";").forEach(pair => {
        const [key, val] = pair.trim().split("=");
        req.cookies[key] = val;
      });
    }
    req.dat = req.cookies.dat || undefined;
    req.bodySize = JSON.stringify(req.body).length;
    req.bodyType = req.headers['content-type'] || 'text/plain';
    res.redirect = (url) => {
      res.writeHead(302, {
        'Location': url
      })
      res.end()
    }
    res.html = (content) => {
      res.setHeader("Content-Type", "text/html");
      res.end(content);
    }
    res.json = (content) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(content));
    }
    res.text = (content) => {
      res.setHeader("Content-Type", "text/plain");
      res.end(content);
    }
    res.file = (path_) => {
      const path__ = path.join(process.cwd(), path_);
      if (fs.existsSync(path__)) {
        const ext = path.extname(path__);
        const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
        res.setHeader("Content-Type", mime);
        res.end(fs.readFileSync(path__));
      }
    }
    res.status = (code) => {
      res.statusCode = code;
      return res;
    }
    res.reload = function() {
      res.writeHead(302, { Location: req.url+'/' });
      res.end();
    }
    res.setCookie = function(name: string, value: string, sameSite: string = "Lax", HttpOnly: boolean = true, Secure: boolean = true, MaxAge: number | null = null) {
      const cookieParts = [`${name}=${value}`, "Path=/"];

      if (MaxAge !== null) cookieParts.push(`Max-Age=${MaxAge}`);
      if (HttpOnly) cookieParts.push("HttpOnly");
      if (Secure) cookieParts.push("Secure");
      if (sameSite) cookieParts.push(`SameSite=${sameSite}`);

      res.setHeader("Set-Cookie", cookieParts.join("; "));
    };

    res.rmvCookie = function(name) {
      res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0`);
    }
    
    //const r = augmentRes(res);

    // Strip query string, hash, trailing slash
    let pathname = url.split("?")[0].split("#")[0];
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    pathname = safePath;
    if (pathname !== "/" && pathname.endsWith("/")) pathname = pathname.slice(0, -1);

    /*if (pathname !== "/__authtics_host_apis__/ping" && pathname !== "/__authtics_host_apis__/get-connection" && pathname !== "/__authtics_hmr__" && pathname !== "/__authtics_host_apis__/get-file-by-pathname" && pathname !== "/__authtics_host_apis__/get-is-ssr" && pathname !== "/__authtics_host_apis__/get-compiler" && pathname !== "/__authtics_host_apis__/restart" && pathname !== "/__authtics_host_apis__/shutdown" && pathname !== "/__authtics_host_apis__/get-server-info" && pathname !== "/__authtics_host_apis__/get-cpu_memory") {
      totalRequests++;
    }*/
    if (!pathname.includes('/__authtics') && !pathname.includes('/hmr') && !pathname.includes('/srtws')) {
      totalRequests++;
    }

    /*const useRoutes = Array.from(routes.entries()).filter(([key]) => key.startsWith("USE:"));
    //for (const [key, handler] of useRoutes) {
    const key = useRoutes[0] ? useRoutes[0][0] : null;
    const handler = useRoutes[0] ? useRoutes[0][1] : null;
    if (key && handler && typeof handler === 'function' && !pathname.includes('/__authtics') && !pathname.includes('/hmr') && !pathname.includes('/srtws')) {
      let id = BigInt(key.split(":")[1]);
      /*const next = (id_: bigint | null) => {
        const nK = `USE:${id_}`;
        if (routes.has(nK)) {
          const currentIndex = useRoutes.findIndex(([k]) => k === nK);
          const nextHandler = (currentIndex !== -1 && currentIndex < useRoutes.length - 1) 
            ? useRoutes[currentIndex + 1] 
            : null;
          if (nextHandler && typeof nextHandler[1] === 'function') {
            id = BigInt(nextHandler[0].split(":")[1]);
            nextHandler[1](req, res, id_, (() => {
              next(id_);
            }));
          }
        }
      }*//*
      
      handler(req, res, id, (() => {
        next(id);
      }));
    }*/

    const useRoutes =  Array.from(routes.entries()).filter(([key]) => key.startsWith("USE:"));
    if (useRoutes.length > 0 && !pathname.includes('/__authtics') && !pathname.includes('/hmr') && !pathname.includes('/srtws')) {
      let i = 0;
  
      const next = () => {
        i++; 
    
        if (i >= useRoutes.length) return; 

        const [key, handler] = useRoutes[i];
    
        if (typeof handler === 'function') {
          const id = BigInt(key.split(":")[1]);
          handler(req, res, id, next); 
        }
      };

      const [key, handler] = useRoutes[0];
      if (typeof handler === 'function') {
        const id = BigInt(key.split(":")[1]);
        handler(req, res, id, next);
      }
    }

    // ── 1. Registered routes (from app.get/post/etc.) ──────────────────────
    const routeKey = `${method}:${pathname}`;
    if (
      pathname.startsWith("/__authtics_host_apis__/") &&
      routes.has(routeKey) &&
      typeof routes.get(routeKey) === "function" &&
      !guardDatApiRequest(req, res, pathname)
    ) {
      return;
    }

    if (routes.has(routeKey)) {
      if (Array.isArray(config_.dat) && !config_.dat.includes(req.dat) && usersPaused && !routeKey.endsWith('.js')) {
        if (autoPaging) {
          const pausedTsxFile = pagesDir ? path.join(pagesDir, "_paused.tsx") : undefined;
          if (fs.existsSync(pausedTsxFile || "")) {
            try {
        let html = await renderPage(pausedTsxFile || "", url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.dat, config_.dat, config_.renderType, config_.patchForSsr);
              html = html.replace("<script>", "<script>\nwindow.__paused__ = true;")
              //console.log("has paused: %s", html.includes("__paused__"))
        res.setHeader("Content-Type", "text/html");
        return res.end(html);
      } catch (e: any) {
        console.error("[HostJS] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
            }
          }
        }
        if (config.hasPausedRoute) {
          if (!autoPaging) {
            const appTsxPath = routes.get("APP_TSX") as string;
      const appPath = path.join(process.cwd(), appTsxPath);
          if (fs.existsSync(appPath)) {
            try {
        let html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType);
              html = html.replace("<script>", "<script>\nwindow.__paused__ = true;")
              //console.log("has paused: %s", html.includes("__paused__"))
        res.setHeader("Content-Type", "text/html");
        return res.end(html);
      } catch (e: any) {
        console.error("[HostJS] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
            }
          }
          }
        }
        res.writeHead(200, {
          "Content-Type": "application/json"
        })
        return res.end(JSON.stringify({
          message: "unhandled request"
        }))
      }
      if (config_.dat !== req.dat && usersPaused && !routeKey.endsWith('.js') && !Array.isArray(config_.dat)) {
        if (autoPaging) {
          const pausedTsxFile = pagesDir ? path.join(pagesDir, "_paused.tsx") : undefined;
          if (fs.existsSync(pausedTsxFile || "")) {
            try {
        let html = await renderPage(pausedTsxFile || "", url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
              html = html.replace("<script>", "<script>\nwindow.__paused__ = true;")
              //console.log("has paused: %s", html.includes("__paused__"))
        res.setHeader("Content-Type", "text/html");
        return res.end(html);
      } catch (e: any) {
        console.error("[HostJS] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
            }
          }
        }
        if (config.hasPausedRoute) {
          if (!autoPaging) {
            const appTsxPath = routes.get("APP_TSX") as string;
      const appPath = path.join(process.cwd(), appTsxPath);
          if (fs.existsSync(appPath)) {
            try {
        let html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType);
              html = html.replace("<script>", "<script>\nwindow.__paused__ = true;")
              //console.log("has paused: %s", html.includes("__paused__"))
        res.setHeader("Content-Type", "text/html");
        return res.end(html);
      } catch (e: any) {
        console.error("[HostJS] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
            }
          }
          }
        }
        res.writeHead(200, {
          "Content-Type": "application/json"
        })
        return res.end(JSON.stringify({
          message: "unhandled request"
        }))
      }
      const handler = routes.get(routeKey);
if (typeof handler === 'string') {
  return;
} else if (typeof handler === 'function') {
  return handler(req, res);
}
    }

    // ── 2. Hot reload SSE endpoint ─────────────────────────────────────────
    // Browser connects here and waits for a 'reload' event
    if (pathname === '/hmr') {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write('data: connected\n\n');
  hmrClients.add(res);
  users++;

  const cleanup = () => {
    hmrClients.delete(res);
    users = Math.max(0, users - 1);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);

  return;
}

    if (pathname === '/srtws') {
      return
    }

    if (Array.isArray(config_.dat) && !config_.dat.includes(req.dat) && usersPaused) {
      if (autoPaging) {
          const pausedTsxFile = pagesDir ? path.join(pagesDir, "_paused.tsx") : undefined;
          if (fs.existsSync(pausedTsxFile || "")) {
            try {
        let html = await renderPage(pausedTsxFile || "", url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
              html = html.replace("<script>", "<script>\nwindow.__paused__ = true;")
              //console.log("has paused: %s", html.includes("__paused__"))
        res.setHeader("Content-Type", "text/html");
        return res.end(html);
      } catch (e: any) {
        console.error("[HostJS] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
            }
          }
      }
      if (config.hasPausedRoute) {
          if (!autoPaging) {
            const appTsxPath = routes.get("APP_TSX") as string;
      const appPath = path.join(process.cwd(), appTsxPath);
          if (fs.existsSync(appPath)) {
            try {
        let html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
              html = html.replace("<script>", "<script>\nwindow.__paused__ = true;")
              //console.log("has paused: %s", html.includes("__paused__"))
        res.setHeader("Content-Type", "text/html");
        return res.end(html);
      } catch (e: any) {
        console.error("[HostJS] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
            }
          }
          }
      }
        res.writeHead(200, {
          "Content-Type": "application/json"
        })
        return res.end(JSON.stringify({
          message: "unhandled request"
        }))
    }
    if (config.dat !== req.dat && usersPaused && !Array.isArray(config_.dat)) {
      if (autoPaging) {
          const pausedTsxFile = pagesDir ? path.join(pagesDir, "_paused.tsx") : undefined;
          if (fs.existsSync(pausedTsxFile || "")) {
            try {
        let html = await renderPage(pausedTsxFile || "", url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
              html = html.replace("<script>", "<script>\nwindow.__paused__ = true;")
              //console.log("has paused: %s", html.includes("__paused__"))
        res.setHeader("Content-Type", "text/html");
        return res.end(html);
      } catch (e: any) {
        console.error("[HostJS] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
            }
          }
      }
      if (config.hasPausedRoute) {
          if (!autoPaging) {
            const appTsxPath = routes.get("APP_TSX") as string;
      const appPath = path.join(process.cwd(), appTsxPath);
          if (fs.existsSync(appPath)) {
            try {
        let html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
              html = html.replace("<script>", "<script>\nwindow.__paused__ = true;")
              //console.log("has paused: %s", html.includes("__paused__"))
        res.setHeader("Content-Type", "text/html");
        return res.end(html);
      } catch (e: any) {
        console.error("[HostJS] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
            }
          }
          }
      }
    res.writeHead(200, {
          "Content-Type": "application/json"
        })
        return res.end(JSON.stringify({
          message: "unhandled request"
        }))
    }

    // ── 3. Public folder — serves files from /public ────────────────────────
    // e.g. GET /logo.png → public/logo.png
    if (publicDir && fs.existsSync(publicDir)) {
      const staticPath = path.join(publicDir, pathname);
      // Make sure the resolved path is still inside publicDir (prevent traversal)
      const safePath = path.resolve(staticPath);
      if (safePath.startsWith(path.resolve(publicDir)) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
        const ext = path.extname(safePath).toLowerCase();
        const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
        res.setHeader("Content-Type", mime);
        return fs.createReadStream(safePath).pipe(res);
      }
    }

    // ── 4. API routes — pages/api/*.ts files ────────────────────────────────
    // e.g. GET /api/users → pages/api/users.ts
    if (pathname.startsWith("/api/") && pagesDir != null) {
      const apiFile = path.join(pagesDir, `${pathname}.ts`);
      const apiFileTsx = path.join(pagesDir, `${pathname}.tsx`);
      const resolvedApi = fs.existsSync(apiFile) ? apiFile : fs.existsSync(apiFileTsx) ? apiFileTsx : null;

      if (resolvedApi && fs.existsSync(resolvedApi)) {
        try {
          // Use jiti to import the API route handler on the fly
          const apiModule = await jiti.import(resolvedApi, { default: true }) as any;
          const handler = apiModule.default ?? apiModule.handler ?? null;

          if (typeof handler !== 'function') {
            res.writeHead(500);
            return res.end(`[HostJS] API route ${pathname} must export a default function`);
          }

          return handler(req, res);
        } catch (e: any) {
          console.error(`[HostJS] API route error (${pathname}):`, e.message);
          res.writeHead(500);
          return res.end(JSON.stringify({ error: e.message }));
        }
      }

      // /api/ path but no matching file → 404
      //res.writeHead(404);
      //return res.end(JSON.stringify({ error: `API route not found: ${pathname}` }));
      const notFoundPath = path.join(__dirname, '404.js');
    if (fs.existsSync(notFoundPath)) {
      try {
        let html = await renderPage(notFoundPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
        res.setHeader("Content-Type", "text/html");
        res.writeHead(404);
        html = html.replace("<script>", "<script>\nwindow.__status_code__ = 404;");
        res.end(html);
      } catch (e) {
        res.writeHead(404);
        res.end(`<html><head></head><body><center><b>404</b> | Not found: ${url}</center></body></html>`);
      }
    } else {
      res.writeHead(404);
      res.end(`<html><head></head><body><center><b>404</b> | Not found: ${url}</center></body></html>`);
    }
    }

    // ── 5. TSX pages (SSR) ──────────────────────────────────────────────────
    const urlPath = pathname === "/" ? "/index" : pathname;
    const tsxPath = pagesDir ? path.join(pagesDir, `${urlPath}.tsx`) : undefined;
    const htmlPath = pagesDir ? path.join(pagesDir, `${urlPath}.html`) : undefined;

    if (srtws)
      deleteSrtwsServer()
      
    if (fs.existsSync(tempFileForTsx(tsxPath || "")) && renderType === "srtws" && !srtws) {
      srtws = handleSrtwsConnection(server, tsxPath || "", config, url, req.cookies.dat, (p) => { routes.delete(`GET:${p}`) }, (f, p) => { routes.set(`GET:${p}`, (_, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(f);
      }) });
    }

    if (tsxPath && fs.existsSync(tsxPath)) {
      try {
        const html = await renderPage(tsxPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
        res.setHeader("Content-Type", "text/html");
        return res.end(html);
      } catch (e: any) {
        console.error("[authtics] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
      }
    }

    // ── 6. Static HTML pages ────────────────────────────────────────────────
    if (htmlPath && fs.existsSync(htmlPath)) {
  const html = await handleHTML(
    fs.readFileSync(htmlPath, "utf-8"),
    actuallyShowPanel,
    config_.dat,
    req.cookies.dat,
    hotReload
  );

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.end(html);
    }

    // ── 7. App.tsx file handling ──────────────────────────────────────────────────────────────
    if (routes.has("APP_TSX")) {
      const appTsxPath = routes.get("APP_TSX") as string;
      const appPath = path.join(process.cwd(), appTsxPath);
      if (fs.existsSync(appPath)) {
        try {
          const html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
          }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
          res.setHeader("Content-Type", "text/html");
          return res.end(html);
        } catch (e: any) {
          console.error("[authtics] renderPage error:", e.message);
        res.writeHead(500);
        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
        }
      }
    }

    // ── 8. 404 ──────────────────────────────────────────────────────────────
    const notFoundPath = path.join(__dirname, '404.js');
    if (fs.existsSync(notFoundPath)) {
      try {
        let html = await renderPage(notFoundPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || "") as string, (f, p) => {
          routes.set(`GET:${p}`, (_, res) => {
            res.setHeader("Content-Type", "application/javascript");
            res.end(f);
          })
        }, (p) => { routes.delete(`GET:${p}`) }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
        res.setHeader("Content-Type", "text/html");
        res.writeHead(404);
        html = html.replace("<script>", "<script>\nwindow.__status_code__ = 404;");
        res.end(html);
      } catch (e) {
        res.writeHead(404);
        res.end(`<html><head></head><body><center><b>404</b> | Not found: ${url}</center></body></html>`);
      }
    } else {
      res.writeHead(404);
      res.end(`<html><head></head><body><center><b>404</b> | Not found: ${url}</center></body></html>`);
    }
  });

  server.listen(PORT, () => {
    //console.log(`🚀 Authtics Host live at http://localhost:${PORT}`);
    setInterval(() => {
      uptime++;
    }, 1000);
  });

  // ── Hot reload file watcher ─────────────────────────────────────────────
  if (config.hotReload === true) {
  const watchSet = new Set<string>();
  // Always watch the project root — catches root-level index.ts, config files, etc.
  watchSet.add(process.cwd());
  // If there's a dedicated pages dir, watch that too
  if (pagesDir && fs.existsSync(pagesDir)) watchSet.add(pagesDir);
  // If an APP_TSX is registered, watch its containing directory
  const appTsx = routes.get("APP_TSX") as string | undefined;
  if (appTsx) {
    const appTsxDir = path.dirname(path.join(process.cwd(), appTsx));
    if (fs.existsSync(appTsxDir)) watchSet.add(appTsxDir);
  }
  // Watch the built devPanel and 404 beside the CLI
  const devPanelBuilt = path.join(__dirname, 'devPanel.js');
  const _404Built = path.join(__dirname, '404.js');
  if (fs.existsSync(devPanelBuilt)) watchSet.add(devPanelBuilt);
  if (fs.existsSync(_404Built)) watchSet.add(_404Built);

    for (const dir of watchSet) {
    safeWatch(dir, () => {
      if (buildStyle === "super") {
        try {
          refreshSuperRouteManifest(process.cwd(), config, pagesDir, publicDir);
        } catch (error) {
          console.error("[HostJS] Failed to refresh Super route manifest:", error);
        }
      }
      notifyHmrClients();
    });
  }
  }

  return server;
}
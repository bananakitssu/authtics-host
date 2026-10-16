#!/usr/bin/env node
import { createServer } from "node:http";
import { createJiti } from "jiti";
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import { renderPage, handleSrtwsConnection, deleteSrtwsServer } from "./renderEngine.js";
import { tempFileForTsx } from "./rendererTempFiles.js";
let config_ = {};
let uptime = 0;
let totalRequests = 0;
let users = 0;
let usersPaused = false;
let srtws;
const jiti = createJiti(import.meta.url);
const routes = new Map();
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const hmrClients = new Set();
function safeWatch(target, onChange) {
    const shouldReact = (filename) => {
        if (!filename)
            return false;
        if (filename.includes('.authtics_host'))
            return false;
        if (filename.includes('.upm'))
            return false;
        if (filename.includes('.tsbuildinfo'))
            return false;
        if (filename.includes('.local'))
            return false;
        if (filename.includes('.cache'))
            return false;
        if (filename.includes('node_modules'))
            return false;
        return /\.(tsx?|jsx?|html|css)$/i.test(filename);
    };
    try {
        const stat = fs.statSync(target);
        if (stat.isFile()) {
            fs.watch(target, (_et, filename) => { if (shouldReact(filename ?? target))
                onChange(); });
            return;
        }
        fs.watch(target, { recursive: true }, (_et, filename) => {
            if (shouldReact(filename))
                onChange();
        });
    }
    catch (err) {
        if (err.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM' || err.code === 'EINVAL' || err.code === 'ENOSYS') {
            try {
                fs.watch(target, (_et, f) => { if (shouldReact(f))
                    onChange(); });
            }
            catch { }
            try {
                for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
                    if (entry.isDirectory()) {
                        try {
                            const sub = path.join(target, entry.name);
                            fs.watch(sub, (_et, f) => { if (shouldReact(f))
                                onChange(); });
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }
    }
}
let hmrDebounceTimer = null;
function notifyHmrClients() {
    if (hmrDebounceTimer)
        clearTimeout(hmrDebounceTimer);
    hmrDebounceTimer = setTimeout(() => {
        hmrDebounceTimer = null;
        for (const client of hmrClients) {
            if (client.destroyed || client.writableEnded) {
                hmrClients.delete(client);
                continue;
            }
            try {
                client.write('data: reload\n\n');
            }
            catch {
                hmrClients.delete(client);
                client.destroy();
            }
        }
    }, 120);
}
const MIME_TYPES = {
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
const getCpu = () => {
    return new Promise((resolve) => {
        const start = process.cpuUsage();
        setTimeout(() => {
            const end = process.cpuUsage(start);
            const total = (end.user + end.system) / 1000;
            resolve(total);
        }, 100);
    });
};
async function getJsonBody(req) {
    return new Promise((resolve, reject) => {
        const hasBody = req.headers['content-length'] || req.headers['transfer-encoding'];
        if (!hasBody && (req.method === 'GET' || req.method === 'DELETE')) {
            return resolve({});
        }
        const chunks = [];
        const timeout = setTimeout(() => {
            req.destroy();
            reject(new Error('Request Timeout: Body took too long to arrive'));
        }, 5000);
        req.on('data', (chunk) => {
            chunks.push(chunk);
        });
        req.on('end', () => {
            clearTimeout(timeout);
            try {
                const rawData = Buffer.concat(chunks).toString();
                resolve(rawData ? JSON.parse(rawData) : {});
            }
            catch (err) {
                reject(new Error('Invalid JSON format'));
            }
        });
        req.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}
export default class App {
    server;
    constructor() {
        this.server = null;
        this.startServer();
        this.post('/__authtics_host_apis__/set-users-paused', async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                usersPaused = req.body.paused;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    message: "ok"
                }));
            }
        });
        this.post('/__authtics_host_apis__/is-users-paused', async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            res.writeHead(200, { "Content-Type": "application/json" });
            if (datMatched) {
                res.end(JSON.stringify({
                    paused: (datMatched ? false : usersPaused),
                    realInfo: usersPaused
                }));
            }
        });
        this.post('/__authtics_host_apis__/get-dat-restriction-missing', async (req, res) => {
            let datMatched = false;
            let datRestrictedEnv = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat == undefined)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                if (config_.dat !== undefined)
                    datRestrictedEnv = true;
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    enabled: datRestrictedEnv
                }));
            }
        });
        this.post('/__authtics_host_apis__/get-dat-matching', async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat == undefined)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                isMatching: datMatched
            }));
        });
        this.post('/__authtics_host_apis__/get-cpu_memory', async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                const { heapUsed, heapTotal, rss } = process.memoryUsage();
                const cpuUsage = await getCpu();
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    cpuUsage,
                    heapUsed,
                    heapTotal
                }));
            }
        });
        this.post('/__authtics_host_apis__/get-user-settings', async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    showError: config_.showError !== undefined ? config_.showError : true
                }));
            }
        });
        this.post("/__authtics_host_apis__/get-server-info", async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    uptime, totalRequests, users
                }));
            }
        });
        this.post("/__authtics_host_apis__/restart", async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
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
                    process.kill(process.pid, 'SIGTERM');
                });
            }
        });
        this.post("/__authtics_host_apis__/shutdown", async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Shutting down..." }));
                this.server?.close(() => {
                    process.kill(process.pid, 'SIGTERM');
                });
            }
        });
        this.post("/__authtics_host_apis__/get-render-type", async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    renderType: config_.renderType
                }));
            }
        });
        this.post("/__authtics_host_apis__/get-compiler", async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    compiler: config_.compilerType
                }));
            }
        });
        this.post("/__authtics_host_apis__/get-host-ver", async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                const packageJsonPath = path.join(__dirname, '../package.json');
                let packageJson;
                if (fs.existsSync(packageJsonPath))
                    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                const packageJsonVersion = packageJson.version || "Unknown";
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    version: packageJsonVersion
                }));
            }
        });
        this.post("/__authtics_host_apis__/get-file-by-pathname", async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                const pathname = req.body.pathname;
                const pagesDir = config_.autoPage === true ? path.join(process.cwd(), config_.autoPageDir || "") : undefined;
                const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
                let filePath = pagesDir ? path.join(pagesDir, (safePath !== "/" ? safePath : "index") + ".tsx") : undefined;
                let fileExists = filePath ? fs.existsSync(filePath) : true;
                const publicDir = config_.autoFile === true ? path.join(process.cwd(), config_.autoFileDir || "") : undefined;
                if (publicDir && !fileExists) {
                    const staticPath = path.join(publicDir, pathname);
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
                    filePath = "File is unresolvable. Could be because it's not found.";
                }
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    fileExists,
                    filePath: (filePath ? filePath : "Cannot find file because autoPage is disabled.")
                }));
            }
        });
        this.post("/__authtics_host_apis__/ping", async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ status: "ok" }));
            }
        });
        this.post('/__authtics_host_apis__/get-connection', async (req, res) => {
            let datMatched = false;
            if (config_.dat && config_.dat == req.dat)
                datMatched = true;
            if (config_.dat && Array.isArray(config_.dat) && config_.dat.includes(req.dat))
                datMatched = true;
            if (datMatched) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    httpVersion: req.httpVersion
                }));
            }
        });
    }
    async startServer() {
        try {
            this.server = await start();
        }
        catch (error) {
            console.error("[HostJS] Server failed to start: ", error);
        }
    }
    registerApp(route) {
        routes.set(`APP_TSX`, route);
    }
    get(routePath, handler) {
        routes.set(`GET:${routePath}`, handler);
    }
    post(routePath, handler) {
        routes.set(`POST:${routePath}`, handler);
    }
    put(routePath, handler) {
        routes.set(`PUT:${routePath}`, handler);
    }
    delete(routePath, handler) {
        routes.set(`DELETE:${routePath}`, handler);
    }
    use(handler) {
        const randomMultiplier = BigInt(Math.floor(Math.random() * 1000000000));
        let newId = randomMultiplier * 1000000000000000000000000000000n;
        routes.set(`USE:${newId}`, handler);
    }
    on(method, handler) {
        if (this.server)
            this.server.on(method, handler);
    }
    remove(method, routePath) {
        if (routes.has(`${method}:${routePath}`))
            routes.delete(`${method}:${routePath}`);
    }
}
async function start() {
    let config = {};
    try {
        const configPath = path.join(process.cwd(), "authtics_host.config.ts");
        config = await jiti.import(configPath, { default: true });
        config_ = config;
    }
    catch {
    }
    const PORT = config.port ?? 3000;
    const renderType = config.renderType ?? 'ssr';
    const showPanel = config.devMode !== false;
    const autoPaging = config.autoPage !== false;
    const compiler = 'esbuild';
    const hotReload = config.hotReload === true;
    const pagesDir = config.autoPage === true ? path.join(process.cwd(), config.autoPageDir || "") : undefined;
    const publicDir = config.autoFile === true ? path.join(process.cwd(), config.autoFileDir || "") : undefined;
    const apiDir = pagesDir ? path.join(pagesDir, "api") : undefined;
    const server = createServer(async (req, res) => {
        const { url = "/", method } = req;
        const actuallyShowPanel = showPanel;
        req.ip = (req.headers["x-real-ip"] ||
            req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
            req.socket.remoteAddress ||
            undefined);
        req.ipType = req.ip?.includes(":") ? 6 : req.ip?.includes(".") ? 4 : 0;
        req.ua = req.headers["user-agent"] || undefined;
        let ua = req.headers["user-agent"] || "";
        let browserType = "Unknown";
        let browserVersion = "Unknown";
        if (ua.includes("Chrome") && !ua.includes("Edg")) {
            browserType = "Chrome";
            browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] || "Unknown";
        }
        else if (ua.includes("Firefox")) {
            browserType = "Firefox";
            browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] || "Unknown";
        }
        else if (ua.includes("Safari") && !ua.includes("Chrome")) {
            browserType = "Safari";
            browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] || "Unknown";
        }
        else if (ua.includes("Edg")) {
            browserType = "Edge";
            browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1] || "Unknown";
        }
        let osType = "Unknown";
        let osVersion = "Unknown";
        if (ua.includes("Windows NT")) {
            osType = "Windows";
            osVersion = ua.match(/Windows NT ([\d.]+)/)?.[1] || "Unknown";
        }
        else if (ua.includes("Mac OS X")) {
            osType = "macOS";
            osVersion = ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, ".") || "Unknown";
        }
        else if (ua.includes("Android")) {
            osType = "Android";
            osVersion = ua.match(/Android ([\d.]+)/)?.[1] || "Unknown";
        }
        else if (ua.includes("iPhone") || ua.includes("iPad")) {
            osType = "iOS";
            osVersion = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, ".") || "Unknown";
        }
        else if (ua.includes("Linux")) {
            osType = "Linux";
        }
        req.os = {
            type: osType,
            version: osVersion
        };
        req.browser = {
            type: browserType,
            version: browserVersion
        };
        req.sentTime = Date.now();
        req.body = {};
        try {
            req.body = await getJsonBody(req);
        }
        catch (e) {
            req.body = {};
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
            });
            res.end();
        };
        res.html = (content) => {
            res.setHeader("Content-Type", "text/html");
            res.end(content);
        };
        res.json = (content) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(content));
        };
        res.text = (content) => {
            res.setHeader("Content-Type", "text/plain");
            res.end(content);
        };
        res.file = (path_) => {
            const path__ = path.join(process.cwd(), path_);
            if (fs.existsSync(path__)) {
                const ext = path.extname(path__);
                const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
                res.setHeader("Content-Type", mime);
                res.end(fs.readFileSync(path__));
            }
        };
        res.status = (code) => {
            res.statusCode = code;
            return res;
        };
        res.reload = function () {
            res.writeHead(302, { Location: req.url + '/' });
            res.end();
        };
        res.setCookie = function (name, value, sameSite = "Lax", HttpOnly = true, Secure = true, MaxAge = null) {
            const cookieParts = [`${name}=${value}`, "Path=/"];
            if (MaxAge !== null)
                cookieParts.push(`Max-Age=${MaxAge}`);
            if (HttpOnly)
                cookieParts.push("HttpOnly");
            if (Secure)
                cookieParts.push("Secure");
            if (sameSite)
                cookieParts.push(`SameSite=${sameSite}`);
            res.setHeader("Set-Cookie", cookieParts.join("; "));
        };
        res.rmvCookie = function (name) {
            res.setHeader("Set-Cookie", `${name}=; Path=/; Max-Age=0`);
        };
        let pathname = url.split("?")[0].split("#")[0];
        const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        pathname = safePath;
        if (pathname !== "/" && pathname.endsWith("/"))
            pathname = pathname.slice(0, -1);
        if (!pathname.includes('/__authtics') && !pathname.includes('/hmr') && !pathname.includes('/srtws')) {
            totalRequests++;
        }
        const useRoutes = Array.from(routes.entries()).filter(([key]) => key.startsWith("USE:"));
        if (useRoutes.length > 0 && !pathname.includes('/__authtics') && !pathname.includes('/hmr') && !pathname.includes('/srtws')) {
            let i = 0;
            const next = () => {
                i++;
                if (i >= useRoutes.length)
                    return;
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
        const routeKey = `${method}:${pathname}`;
        if (routes.has(routeKey)) {
            if (Array.isArray(config_.dat) && !config_.dat.includes(req.dat) && usersPaused && !routeKey.endsWith('.js')) {
                if (autoPaging) {
                    const pausedTsxFile = pagesDir ? path.join(pagesDir, "_paused.tsx") : undefined;
                    if (fs.existsSync(pausedTsxFile || "")) {
                        try {
                            let html = await renderPage(pausedTsxFile || "", url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                                routes.set(`GET:${p}`, (_, res) => {
                                    res.setHeader("Content-Type", "application/javascript");
                                    res.end(f);
                                });
                            }, (p) => { routes.delete(`GET:${p}`); }, req.dat, config_.dat, config_.renderType, config_.patchForSsr);
                            html = html.replace("<script>", "<script>\nwindow.__paused__ = true;");
                            res.setHeader("Content-Type", "text/html");
                            return res.end(html);
                        }
                        catch (e) {
                            console.error("[HostJS] renderPage error:", e.message);
                            res.writeHead(500);
                            return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
                        }
                    }
                }
                if (config.hasPausedRoute) {
                    if (!autoPaging) {
                        const appTsxPath = routes.get("APP_TSX");
                        const appPath = path.join(process.cwd(), appTsxPath);
                        if (fs.existsSync(appPath)) {
                            try {
                                let html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                                    routes.set(`GET:${p}`, (_, res) => {
                                        res.setHeader("Content-Type", "application/javascript");
                                        res.end(f);
                                    });
                                }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType);
                                html = html.replace("<script>", "<script>\nwindow.__paused__ = true;");
                                res.setHeader("Content-Type", "text/html");
                                return res.end(html);
                            }
                            catch (e) {
                                console.error("[HostJS] renderPage error:", e.message);
                                res.writeHead(500);
                                return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
                            }
                        }
                    }
                }
                res.writeHead(200, {
                    "Content-Type": "application/json"
                });
                return res.end(JSON.stringify({
                    message: "unhandled request"
                }));
            }
            if (config_.dat !== req.dat && usersPaused && !routeKey.endsWith('.js') && !Array.isArray(config_.dat)) {
                if (autoPaging) {
                    const pausedTsxFile = pagesDir ? path.join(pagesDir, "_paused.tsx") : undefined;
                    if (fs.existsSync(pausedTsxFile || "")) {
                        try {
                            let html = await renderPage(pausedTsxFile || "", url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                                routes.set(`GET:${p}`, (_, res) => {
                                    res.setHeader("Content-Type", "application/javascript");
                                    res.end(f);
                                });
                            }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
                            html = html.replace("<script>", "<script>\nwindow.__paused__ = true;");
                            res.setHeader("Content-Type", "text/html");
                            return res.end(html);
                        }
                        catch (e) {
                            console.error("[HostJS] renderPage error:", e.message);
                            res.writeHead(500);
                            return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
                        }
                    }
                }
                if (config.hasPausedRoute) {
                    if (!autoPaging) {
                        const appTsxPath = routes.get("APP_TSX");
                        const appPath = path.join(process.cwd(), appTsxPath);
                        if (fs.existsSync(appPath)) {
                            try {
                                let html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                                    routes.set(`GET:${p}`, (_, res) => {
                                        res.setHeader("Content-Type", "application/javascript");
                                        res.end(f);
                                    });
                                }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType);
                                html = html.replace("<script>", "<script>\nwindow.__paused__ = true;");
                                res.setHeader("Content-Type", "text/html");
                                return res.end(html);
                            }
                            catch (e) {
                                console.error("[HostJS] renderPage error:", e.message);
                                res.writeHead(500);
                                return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
                            }
                        }
                    }
                }
                res.writeHead(200, {
                    "Content-Type": "application/json"
                });
                return res.end(JSON.stringify({
                    message: "unhandled request"
                }));
            }
            const handler = routes.get(routeKey);
            if (typeof handler === 'string') {
                return;
            }
            else if (typeof handler === 'function') {
                return handler(req, res);
            }
        }
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
            return;
        }
        if (Array.isArray(config_.dat) && !config_.dat.includes(req.dat) && usersPaused) {
            if (autoPaging) {
                const pausedTsxFile = pagesDir ? path.join(pagesDir, "_paused.tsx") : undefined;
                if (fs.existsSync(pausedTsxFile || "")) {
                    try {
                        let html = await renderPage(pausedTsxFile || "", url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                            routes.set(`GET:${p}`, (_, res) => {
                                res.setHeader("Content-Type", "application/javascript");
                                res.end(f);
                            });
                        }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
                        html = html.replace("<script>", "<script>\nwindow.__paused__ = true;");
                        res.setHeader("Content-Type", "text/html");
                        return res.end(html);
                    }
                    catch (e) {
                        console.error("[HostJS] renderPage error:", e.message);
                        res.writeHead(500);
                        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
                    }
                }
            }
            if (config.hasPausedRoute) {
                if (!autoPaging) {
                    const appTsxPath = routes.get("APP_TSX");
                    const appPath = path.join(process.cwd(), appTsxPath);
                    if (fs.existsSync(appPath)) {
                        try {
                            let html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                                routes.set(`GET:${p}`, (_, res) => {
                                    res.setHeader("Content-Type", "application/javascript");
                                    res.end(f);
                                });
                            }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
                            html = html.replace("<script>", "<script>\nwindow.__paused__ = true;");
                            res.setHeader("Content-Type", "text/html");
                            return res.end(html);
                        }
                        catch (e) {
                            console.error("[HostJS] renderPage error:", e.message);
                            res.writeHead(500);
                            return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
                        }
                    }
                }
            }
            res.writeHead(200, {
                "Content-Type": "application/json"
            });
            return res.end(JSON.stringify({
                message: "unhandled request"
            }));
        }
        if (config.dat !== req.dat && usersPaused && !Array.isArray(config_.dat)) {
            if (autoPaging) {
                const pausedTsxFile = pagesDir ? path.join(pagesDir, "_paused.tsx") : undefined;
                if (fs.existsSync(pausedTsxFile || "")) {
                    try {
                        let html = await renderPage(pausedTsxFile || "", url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                            routes.set(`GET:${p}`, (_, res) => {
                                res.setHeader("Content-Type", "application/javascript");
                                res.end(f);
                            });
                        }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
                        html = html.replace("<script>", "<script>\nwindow.__paused__ = true;");
                        res.setHeader("Content-Type", "text/html");
                        return res.end(html);
                    }
                    catch (e) {
                        console.error("[HostJS] renderPage error:", e.message);
                        res.writeHead(500);
                        return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
                    }
                }
            }
            if (config.hasPausedRoute) {
                if (!autoPaging) {
                    const appTsxPath = routes.get("APP_TSX");
                    const appPath = path.join(process.cwd(), appTsxPath);
                    if (fs.existsSync(appPath)) {
                        try {
                            let html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                                routes.set(`GET:${p}`, (_, res) => {
                                    res.setHeader("Content-Type", "application/javascript");
                                    res.end(f);
                                });
                            }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
                            html = html.replace("<script>", "<script>\nwindow.__paused__ = true;");
                            res.setHeader("Content-Type", "text/html");
                            return res.end(html);
                        }
                        catch (e) {
                            console.error("[HostJS] renderPage error:", e.message);
                            res.writeHead(500);
                            return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
                        }
                    }
                }
            }
            res.writeHead(200, {
                "Content-Type": "application/json"
            });
            return res.end(JSON.stringify({
                message: "unhandled request"
            }));
        }
        if (publicDir && fs.existsSync(publicDir)) {
            const staticPath = path.join(publicDir, pathname);
            const safePath = path.resolve(staticPath);
            if (safePath.startsWith(path.resolve(publicDir)) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
                const ext = path.extname(safePath).toLowerCase();
                const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
                res.setHeader("Content-Type", mime);
                return fs.createReadStream(safePath).pipe(res);
            }
        }
        if (pathname.startsWith("/api/") && pagesDir != null) {
            const apiFile = path.join(pagesDir, `${pathname}.ts`);
            const apiFileTsx = path.join(pagesDir, `${pathname}.tsx`);
            const resolvedApi = fs.existsSync(apiFile) ? apiFile : fs.existsSync(apiFileTsx) ? apiFileTsx : null;
            if (resolvedApi && fs.existsSync(resolvedApi)) {
                try {
                    const apiModule = await jiti.import(resolvedApi, { default: true });
                    const handler = apiModule.default ?? apiModule.handler ?? null;
                    if (typeof handler !== 'function') {
                        res.writeHead(500);
                        return res.end(`[HostJS] API route ${pathname} must export a default function`);
                    }
                    return handler(req, res);
                }
                catch (e) {
                    console.error(`[HostJS] API route error (${pathname}):`, e.message);
                    res.writeHead(500);
                    return res.end(JSON.stringify({ error: e.message }));
                }
            }
            const notFoundPath = path.join(__dirname, '404.js');
            if (fs.existsSync(notFoundPath)) {
                try {
                    let html = await renderPage(notFoundPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                        routes.set(`GET:${p}`, (_, res) => {
                            res.setHeader("Content-Type", "application/javascript");
                            res.end(f);
                        });
                    }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
                    res.setHeader("Content-Type", "text/html");
                    res.writeHead(404);
                    html = html.replace("<script>", "<script>\nwindow.__status_code__ = 404;");
                    res.end(html);
                }
                catch (e) {
                    res.writeHead(404);
                    res.end(`<html><head></head><body><center><b>404</b> | Not found: ${url}</center></body></html>`);
                }
            }
            else {
                res.writeHead(404);
                res.end(`<html><head></head><body><center><b>404</b> | Not found: ${url}</center></body></html>`);
            }
        }
        const urlPath = pathname === "/" ? "/index" : pathname;
        const tsxPath = pagesDir ? path.join(pagesDir, `${urlPath}.tsx`) : undefined;
        const htmlPath = pagesDir ? path.join(pagesDir, `${urlPath}.html`) : undefined;
        if (srtws)
            deleteSrtwsServer();
        if (fs.existsSync(tempFileForTsx(tsxPath || "")) && renderType === "srtws" && !srtws) {
            srtws = handleSrtwsConnection(server, tsxPath || "", config, url, req.cookies.dat, (p) => { routes.delete(`GET:${p}`); }, (f, p) => {
                routes.set(`GET:${p}`, (_, res) => {
                    res.setHeader("Content-Type", "application/javascript");
                    res.end(f);
                });
            });
        }
        if (tsxPath && fs.existsSync(tsxPath)) {
            try {
                const html = await renderPage(tsxPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                    routes.set(`GET:${p}`, (_, res) => {
                        res.setHeader("Content-Type", "application/javascript");
                        res.end(f);
                    });
                }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
                res.setHeader("Content-Type", "text/html");
                return res.end(html);
            }
            catch (e) {
                console.error("[authtics] renderPage error:", e.message);
                res.writeHead(500);
                return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
            }
        }
        if (htmlPath && fs.existsSync(htmlPath)) {
            res.setHeader("Content-Type", "text/html");
            return res.end(fs.readFileSync(htmlPath, "utf-8"));
        }
        if (routes.has("APP_TSX")) {
            const appTsxPath = routes.get("APP_TSX");
            const appPath = path.join(process.cwd(), appTsxPath);
            if (fs.existsSync(appPath)) {
                try {
                    const html = await renderPage(appPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                        routes.set(`GET:${p}`, (_, res) => {
                            res.setHeader("Content-Type", "application/javascript");
                            res.end(f);
                        });
                    }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
                    res.setHeader("Content-Type", "text/html");
                    return res.end(html);
                }
                catch (e) {
                    console.error("[authtics] renderPage error:", e.message);
                    res.writeHead(500);
                    return res.end(`<html><body><pre>500 | Render error:\n${e.message}</pre></body></html>`);
                }
            }
        }
        const notFoundPath = path.join(__dirname, '404.js');
        if (fs.existsSync(notFoundPath)) {
            try {
                let html = await renderPage(notFoundPath, url, actuallyShowPanel, compiler, hotReload, autoPaging, config.autoPageDir, (routes.get("APP_TSX") || ""), (f, p) => {
                    routes.set(`GET:${p}`, (_, res) => {
                        res.setHeader("Content-Type", "application/javascript");
                        res.end(f);
                    });
                }, (p) => { routes.delete(`GET:${p}`); }, req.cookies.dat, config_.dat, config_.renderType, config_.patchForSsr);
                res.setHeader("Content-Type", "text/html");
                res.writeHead(404);
                html = html.replace("<script>", "<script>\nwindow.__status_code__ = 404;");
                res.end(html);
            }
            catch (e) {
                res.writeHead(404);
                res.end(`<html><head></head><body><center><b>404</b> | Not found: ${url}</center></body></html>`);
            }
        }
        else {
            res.writeHead(404);
            res.end(`<html><head></head><body><center><b>404</b> | Not found: ${url}</center></body></html>`);
        }
    });
    server.listen(PORT, () => {
        setInterval(() => {
            uptime++;
        }, 1000);
    });
    if (config.hotReload === true) {
        const watchSet = new Set();
        watchSet.add(process.cwd());
        if (pagesDir && fs.existsSync(pagesDir))
            watchSet.add(pagesDir);
        const appTsx = routes.get("APP_TSX");
        if (appTsx) {
            const appTsxDir = path.dirname(path.join(process.cwd(), appTsx));
            if (fs.existsSync(appTsxDir))
                watchSet.add(appTsxDir);
        }
        const devPanelBuilt = path.join(__dirname, 'devPanel.js');
        const _404Built = path.join(__dirname, '404.js');
        if (fs.existsSync(devPanelBuilt))
            watchSet.add(devPanelBuilt);
        if (fs.existsSync(_404Built))
            watchSet.add(_404Built);
        for (const dir of watchSet) {
            safeWatch(dir, notifyHmrClients);
        }
    }
    return server;
}

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToString } from "react-dom/server";
import { tempFileForTsx, writeTempFile, readTempFile, ensureTempDirs, } from "./rendererTempFiles.js";
import { createRequire } from "node:module";
const customRequire = createRequire(import.meta.url);
import { WebSocketServer } from "ws";
let srtwsServer = null;
export function deleteSrtwsServer() {
    if (srtwsServer)
        srtwsServer.close();
    srtwsServer = null;
}
export function handleSrtwsConnection(server, tsxPath, config, reqUrl, reqDAT, rmvFileHandler, fileHandler) {
    const wss = new WebSocketServer({ noServer: true });
    srtwsServer = wss;
    server.on("upgrade", (req, socket, head) => {
        if (req.url === "/__authtics_srtws__") {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req);
            });
        }
    });
    wss.on("connection", (ws) => {
        const renderAndSend = async () => {
            const pageHtml = await renderPage(tsxPath, reqUrl, config.devMode, config.compilerType, config.hotReload, config.autoPage, config.autoPageDir, config.appDir, fileHandler, rmvFileHandler, reqDAT, config.dat, 'csr', config.patchForSsr);
            ws.send(JSON.stringify({ type: "DOM", html: pageHtml }));
        };
        ws.on("message", () => {
            try {
                renderAndSend();
            }
            catch (err) {
                console.error("[HostJS] SRTWS error:", err);
            }
        });
    });
    return true;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NODE_BUILTINS = [
    'fs', 'path', 'http', 'https', 'net', 'tls', 'os', 'url', 'dns',
    'crypto', 'stream', 'buffer', 'events', 'util', 'zlib', 'assert',
    'child_process', 'cluster', 'dgram', 'readline', 'repl', 'vm',
    'worker_threads', 'timers', 'module', 'process', 'string_decoder',
    'querystring', 'punycode', 'domain', 'constants', 'sys',
    'node:fs', 'node:path', 'node:http', 'node:https', 'node:net', 'node:tls',
    'node:os', 'node:url', 'node:dns', 'node:crypto', 'node:stream',
    'node:buffer', 'node:events', 'node:util', 'node:zlib', 'node:assert',
    'node:child_process', 'node:cluster', 'node:dgram', 'node:readline',
    'node:repl', 'node:vm', 'node:worker_threads', 'node:timers',
    'node:module', 'node:process', 'node:string_decoder', 'node:querystring',
    'express', 'jiti',
];
const SRTWS_CLIENT_SCRIPT = `<script>
(function() {
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const ws = new WebSocket(protocol + window.location.host + '/__authtics_srtws__');

  ws.onmessage = function(event) {
  const msg = JSON.parse(event.data);
  if (msg.type === 'DOM') {
    document.documentElement.innerHTML = msg.html;
    const scripts = document.documentElement.querySelectorAll('script');
    
    scripts.forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }
};


  ws.onopen = function() {
    ws.send(JSON.stringify({}));
  };
})();
</script>`;
const nodeStubPlugin = {
    name: 'browser-node-stub',
    setup(build) {
        const escapedNames = NODE_BUILTINS.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const filter = new RegExp(`^(${escapedNames.join('|')})$`);
        build.onResolve({ filter }, args => ({
            path: args.path,
            namespace: 'browser-node-stub',
        }));
        build.onLoad({ filter: /.*/, namespace: 'browser-node-stub' }, () => ({
            contents: `
        const stub = new Proxy({}, { get: () => () => undefined });
        export default stub;
      `,
            loader: 'js',
        }));
    },
};
async function buildWithEsbuild(virtualContent, resolveDir, platform, patchForServer = false, options = {}) {
    const toFwdSlash = (p) => p.split(path.sep).join('/');
    const isNode = platform === 'node';
    const sourceMaps = options.sourceMaps === true;
    const result = await esbuild.build({
        stdin: {
            contents: virtualContent,
            resolveDir,
            sourcefile: `virtual-entry-${platform}.jsx`,
        },
        bundle: true,
        write: false,
        format: isNode ? 'cjs' : 'iife',
        platform,
        jsx: 'automatic',
        target: isNode ? ['node18'] : ['es2020'],
        sourcemap: sourceMaps ? "inline" : false,
        sourcesContent: sourceMaps,
        minify: options.minify ?? !sourceMaps,
        treeShaking: true,
        banner: (isNode && patchForServer) ? {
            js: `if (typeof globalThis.window === "undefined") {
    const noop = () => {};

    const createStorageMock = () => {
      let store = {};
      return {
        getItem: (key) => store[key] ?? null,
        setItem: (key, val) => { store[key] = String(val); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
        key: (i) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; },
      };
    };

    const mockLocalStorage = createStorageMock();
    const mockSessionStorage = createStorageMock();

    const mockElement = {
      setAttribute: noop,
      getAttribute: () => null,
      removeAttribute: noop,
      style: {},
      appendChild: (node) => node,
      removeChild: (node) => node,
      addEventListener: noop,
      removeEventListener: noop,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    };

    const mockDocument = {
      createElement: () => mockElement,
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      getElementsByTagName: () => [],
      getElementsByClassName: () => [],
      cookie: "",
      body: mockElement,
      documentElement: mockElement,
      addEventListener: noop,
      removeEventListener: noop,
    };

    const mockNavigator = {
      userAgent: "Mozilla/5.0 (Server-Side)",
      language: "en-US",
      languages: ["en-US"],
      onLine: true,
      clipboard: { writeText: async () => {}, readText: async () => "" },
    };


    globalThis.document = globalThis.document || mockDocument;
    globalThis.navigator = globalThis.navigator || mockNavigator;
    globalThis.localStorage = globalThis.localStorage || mockLocalStorage;
    globalThis.sessionStorage = globalThis.sessionStorage || mockSessionStorage;

    globalThis.window = new Proxy(globalThis, {
      get: (target, prop) => {
        if (prop in target) return target[prop];
        if (prop === 'document') return globalThis.document;
        if (prop === 'navigator') return globalThis.navigator;
        if (prop === 'localStorage') return globalThis.localStorage;
        if (prop === 'sessionStorage') return globalThis.sessionStorage;
        if (prop === 'addEventListener' || prop === 'removeEventListener') return noop;
        if (prop === 'location') return { href: '', search: '', pathname: '/', origin: '', assign: noop, replace: noop };
        if (prop === 'matchMedia') return () => ({ matches: false, addEventListener: noop, removeEventListener: noop, dispatchEvent: noop });
        if (prop === 'getComputedStyle') return () => ({ getPropertyValue: () => '' });
        if (prop === 'requestAnimationFrame' || prop === 'cancelAnimationFrame') return (cb) => setTimeout(cb, 0);
        return undefined;
      }
    });
  }`
        } : undefined,
        plugins: isNode ? [] : [nodeStubPlugin],
        external: isNode
            ? ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'react/jsx-dev-runtime',
                'node:http', 'node:path', 'node:fs', 'node:url', 'tls',
                toFwdSlash(path.join(__dirname, 'cli.js')),
                toFwdSlash(path.join(__dirname, 'config.js')),
                toFwdSlash(path.join(__dirname, 'renderEngine.js')),
                toFwdSlash(path.join(__dirname, 'rendererTempFiles.js'))]
            : [
                toFwdSlash(path.join(__dirname, 'cli.js')),
                toFwdSlash(path.join(__dirname, 'config.js')),
                toFwdSlash(path.join(__dirname, 'renderEngine.js')),
                toFwdSlash(path.join(__dirname, 'rendererTempFiles.js'))
            ],
    });
    return result.outputFiles[0].text;
}
export function findFileUpwards(startDir, relativePath) {
    let dir = path.resolve(startDir);
    const root = path.parse(dir).root;
    while (true) {
        const candidate = path.join(dir, relativePath);
        if (fs.existsSync(candidate))
            return candidate;
        if (dir === root)
            break;
        dir = path.dirname(dir);
    }
    return null;
}
function resolveDevPanelPath() {
    const nextToCli = path.join(__dirname, "devPanel.js");
    if (fs.existsSync(nextToCli))
        return nextToCli;
    return null;
}
const devPanelPath = resolveDevPanelPath();
function resolveTemplate(appDir, autoPageDir, autoPaging) {
    let nextToCli;
    if (autoPaging) {
        nextToCli = path.join(process.cwd(), autoPageDir || "", "_template.html");
    }
    else {
        nextToCli = path.join(process.cwd(), appDir || "", "../", "_template.html");
    }
    return nextToCli;
}
function buildHtml(opts) {
    const { pageHtml, clientCode, devPanelContainer, templatePath, hotReload, fileName, datRestricted, devMode, renderMode } = opts;
    const configScript = `<script>window.__authtics_config__={datRestricted:${datRestricted ? 'true' : 'false'},devMode:${devMode !== false ? 'true' : 'false'}};</script>`;
    const hmrScript = hotReload ? HMR_SCRIPT : '';
    const srtwsScript = renderMode === 'srtws' ? SRTWS_CLIENT_SCRIPT : '';
    if (templatePath && fs.existsSync(templatePath)) {
        let template = fs.readFileSync(templatePath, "utf-8");
        const contentTag = /<authtics_host_content\s*\/>/i;
        if (contentTag.test(template)) {
            template = template.replace(contentTag, `<div id="root">${pageHtml}</div>\n    ${devPanelContainer}`);
            template = template.includes("</body>")
                ? template.replace("</body>", `  ${configScript}${srtwsScript}${fileName ? `<script src="${fileName}"></script>` : `<script>${clientCode}</script>`}\n${hmrScript}</body>`)
                : template + `\n${configScript}${srtwsScript}${fileName ? `<script src="${fileName}"></script>` : `<script>${clientCode}</script>`}\n${hmrScript}`;
            return template;
        }
        console.warn('[authtics] _template.html has no <authtics_host_content /> — using default layout.');
    }
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="root">${pageHtml}</div>
    ${devPanelContainer}
    ${configScript}
    ${renderMode === 'srtws' ? '' : (fileName ? `<script src="${fileName}"></script>` : `<script>${clientCode}</script>`)}
    ${srtwsScript}
    ${hmrScript}
  </body>
</html>`;
}
function isCacheValid(tsxPath, tempPath, serverCjsPath, templatePath, devPanelPath) {
    if (!fs.existsSync(tempPath) || !fs.existsSync(serverCjsPath))
        return false;
    try {
        const cacheMtime = fs.statSync(tempPath).mtimeMs;
        if (fs.statSync(tsxPath).mtimeMs > cacheMtime)
            return false;
        if (templatePath && fs.existsSync(templatePath) && fs.statSync(templatePath).mtimeMs > cacheMtime)
            return false;
        if (devPanelPath && fs.existsSync(devPanelPath) && fs.statSync(devPanelPath).mtimeMs > cacheMtime)
            return false;
        return true;
    }
    catch {
        return false;
    }
}
const HMR_SCRIPT = `<script>
(function () {
  var es = null;
  var disposed = false;
  var reloading = false;

  function connect() {
    if (disposed || reloading || es) return;

    es = new EventSource('/hmr');

    es.onopen = function () { };

    es.onmessage = function (event) {
      if (event.data !== 'reload' || disposed || reloading) return;

      reloading = true;

      es.onmessage = null;
      es.onerror = null;
      es.close();
      es = null;

      window.location.reload();
    };

    es.onerror = function () {
      if (disposed || reloading) return;
    };
  }

  function dispose() {
    if (disposed) return;

    disposed = true;

    if (es) {
      es.onmessage = null;
      es.onerror = null;
      es.close();
      es = null;
    }
  }
  window.addEventListener('pagehide', dispose, { once: true });
  window.addEventListener('unload', dispose, { once: true });

  connect();
})();
</script>`;
export async function renderPage(tsxPath, reqUrl, showPanel = true, compiler = 'esbuild', hotReload = false, autoPaging = true, autoPageDir, appDir, fileHandler, rmvFileHandler, reqDAT, configDAT, renderMode = 'ssr', patchForServer = false) {
    ensureTempDirs();
    if (!fs.existsSync(tsxPath)) {
        throw new Error(`renderPage: source file not found: ${tsxPath}`);
    }
    const datMatches = configDAT === undefined ||
        configDAT === reqDAT ||
        (Array.isArray(configDAT) && configDAT.includes(reqDAT ?? ""));
    const usesDevPanel = showPanel &&
        devPanelPath !== null &&
        datMatches;
    const enableDiagnostics = usesDevPanel;
    const templatePath = resolveTemplate(appDir, autoPageDir, autoPaging);
    const cacheVariant = [
        usesDevPanel ? "panel" : "normal",
        enableDiagnostics ? "mapped" : "fast",
        compiler,
    ].join("-");
    const tempPath = tempFileForTsx(tsxPath, cacheVariant);
    const serverCjsPath = tempPath.replace(/\.json$/, ".server.cjs");
    const ssgHtmlPath = tempPath.replace(/\.json$/, ".ssg.html");
    if (renderMode === 'ssg' && isCacheValid(tsxPath, ssgHtmlPath, serverCjsPath, templatePath, devPanelPath)) {
        try {
            return fs.readFileSync(ssgHtmlPath, "utf-8");
        }
        catch {
        }
    }
    let clientCode;
    let serverCode;
    let freshWrite = false;
    if (isCacheValid(tsxPath, tempPath, serverCjsPath, templatePath, devPanelPath) && autoPaging) {
        try {
            const parsed = JSON.parse(readTempFile(tempPath));
            clientCode = parsed.clientCode;
            serverCode = fs.readFileSync(serverCjsPath, "utf-8");
        }
        catch {
        }
    }
    const serverCodeDisabled = renderMode === 'csr' || renderMode === 'srtws';
    if (!clientCode || (!serverCode && !serverCodeDisabled)) {
        const virtualServer = `
      ${usesDevPanel ? `import DevPanel from ${JSON.stringify(devPanelPath)};` : ""}
      import Page from ${JSON.stringify(tsxPath)};
      export default Page;
      ${usesDevPanel ? `export { DevPanel };` : ""}
    `;
        const virtualClient = `
      import React from "react";
      import { ${renderMode === 'csr' ? 'createRoot' : 'hydrateRoot'} } from "react-dom/client";
      ${usesDevPanel ? `import DevPanel from ${JSON.stringify(devPanelPath)};` : ""}
      import Page from ${JSON.stringify(tsxPath)};

      ${usesDevPanel ? `
      const panelEl = document.getElementById("authtics-dev-panel-root");
      if (panelEl) ${renderMode === 'csr' ? `createRoot(panelEl).render(React.createElement(DevPanel));` : `hydrateRoot(panelEl, React.createElement(DevPanel));`}
      ` : ""}
      const rootEl = document.getElementById("root");
      if (rootEl) {
        ${renderMode === 'csr'
            ? `createRoot(rootEl).render(React.createElement(Page));`
            : `hydrateRoot(rootEl, React.createElement(Page));`}
      }
    `;
        if (compiler === 'esbuild') {
            if (!serverCodeDisabled)
                serverCode = await buildWithEsbuild(virtualServer, process.cwd(), 'node', patchForServer, { sourceMaps: enableDiagnostics, minify: !enableDiagnostics });
            if (renderMode !== 'srtws') {
                clientCode = await buildWithEsbuild(virtualClient, process.cwd(), 'browser', patchForServer, { sourceMaps: enableDiagnostics, minify: !enableDiagnostics });
            }
            else {
                clientCode = "";
            }
        }
        if (serverCode)
            await fs.promises.writeFile(serverCjsPath, serverCode || "", "utf-8");
        writeTempFile(tempPath, JSON.stringify({ clientCode }));
        freshWrite = true;
    }
    fileHandler ? fileHandler(clientCode || "", `/${path.basename(tempPath).replace(".json", ".js").replace(".tsx_", ".").toLowerCase()}`) : null;
    let pageHtml = "";
    let devPanelContainer = usesDevPanel
        ? `<div id="authtics-dev-panel-root"></div>`
        : "";
    if (!serverCodeDisabled) {
        const absoluteServerPath = path.resolve(serverCjsPath);
        delete customRequire.cache[absoluteServerPath];
        const serverModule = customRequire(absoluteServerPath);
        const exports = serverModule.__esModule ? serverModule.default : serverModule;
        const PageComponent = exports?.default?.default ??
            exports?.default ??
            exports?.Page ??
            exports?.page ??
            (typeof exports === 'function' ? exports : null);
        const DevPanelComponent = usesDevPanel ? (exports.DevPanel ?? null) : null;
        if (!PageComponent) {
            throw new Error(`renderPage: no default export found in ${tsxPath}`);
        }
        pageHtml = renderToString(React.createElement(PageComponent));
        const devPanelHtml = DevPanelComponent
            ? renderToString(React.createElement(DevPanelComponent))
            : "";
        devPanelContainer = usesDevPanel
            ? `<div id="authtics-dev-panel-root">${devPanelHtml}</div>`
            : "";
    }
    const finalHtml = buildHtml({ pageHtml, clientCode: clientCode || "", devPanelContainer, templatePath, hotReload,
        fileName: `/${path.basename(tempPath).replace(".json", ".js").replace(".tsx_", ".").toLowerCase()}`,
        datRestricted: configDAT !== undefined,
        devMode: showPanel,
        renderMode
    });
    if (renderMode === 'ssg') {
        await fs.promises.writeFile(ssgHtmlPath, finalHtml, "utf-8");
    }
    return finalHtml;
}

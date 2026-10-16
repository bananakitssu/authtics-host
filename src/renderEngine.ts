// src/renderEngine.ts
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
//import { createRequire } from "node:module";
import * as esbuild from "esbuild";
//import * as babel from "@babel/core";
//import * as babelPresetEnv from "@babel/preset-env";
//import * as babelPresetReact from "@babel/preset-react";
//import * as babelPresetTypescript from "@babel/preset-typescript";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  tempFileForTsx,
  clientBundleForTsx,
  serverBundleForTsx,
  ssgHtmlForTsx,
  getBuildStyle,
  getBuildTrigger,
  //isTempUpToDate,
  writeTempFile,
  readTempFile,
  ensureTempDirs,
} from "./rendererTempFiles.js";
import { createRequire } from "node:module";
const customRequire = createRequire(import.meta.url);

import { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
let srtwsServer: WebSocketServer | null = null;

export function deleteSrtwsServer() {
  if (srtwsServer)
    srtwsServer.close();
  srtwsServer = null;
}

export function handleSrtwsConnection(
  server: any,
  tsxPath: string,
  config: any,
  reqUrl?: string,
  reqDAT?: string,
  rmvFileHandler?: (p: string) => void,
  fileHandler?: (f: string, p: string) => void
) {
  const wss = new WebSocketServer({ noServer: true });
  srtwsServer = wss;

  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    if (req.url === "/__authtics_srtws__") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    //let state = {};

    const renderAndSend = async () => {
      //const pageHtml = renderToString(React.createElement(PageComponent/*, state*/));
      const pageHtml = await renderPage(tsxPath, reqUrl, config.devMode, config.compilerType, config.hotReload, config.autoPage, config.autoPageDir, config.appDir, fileHandler, rmvFileHandler, reqDAT, config.dat, 'csr', config.patchForSsr);
      ws.send(JSON.stringify({ type: "DOM", html: pageHtml }));
    };

    ws.on("message", (/*rawMessage*/) => {
      try {
        /*const { event, payload } = JSON.parse(rawMessage.toString());
        state = { ...state, ...payload };*/
        renderAndSend();
      } catch (err) {
        console.error("[HostJS] SRTWS error:", err);
      }
    });
  });

  return true;
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename);
//const __dirname = fileURLToPath(new URL(".", import.meta.url));
//const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Compiler type
// ---------------------------------------------------------------------------
export type CompilerType = 'esbuild'/* | 'babel'*/;
export type RenderMode = 'ssr' | 'csr' | 'ssg' | 'srtws'; // Server-Side Rendering, Client-Side Rendering, Static Site Generation, Site Rendering Through WebSockets

const NODE_BUILTINS = [
  'fs', 'path', 'http', 'https', 'net', 'tls', 'os', 'url', 'dns',
  'crypto', 'stream', 'buffer', 'events', 'util', 'zlib', 'assert',
  'child_process', 'cluster', 'dgram', 'readline', 'repl', 'vm',
  'worker_threads', 'timers', 'module', 'process', 'string_decoder',
  'querystring', 'punycode', 'domain', 'constants', 'sys',
  // node: prefixed variants
  'node:fs', 'node:path', 'node:http', 'node:https', 'node:net', 'node:tls',
  'node:os', 'node:url', 'node:dns', 'node:crypto', 'node:stream',
  'node:buffer', 'node:events', 'node:util', 'node:zlib', 'node:assert',
  'node:child_process', 'node:cluster', 'node:dgram', 'node:readline',
  'node:repl', 'node:vm', 'node:worker_threads', 'node:timers',
  'node:module', 'node:process', 'node:string_decoder', 'node:querystring',
  // common non-Node things that shouldn't enter the browser bundle
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

const nodeStubPlugin: esbuild.Plugin = {
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

// ---------------------------------------------------------------------------
// Babel compiler (optional — only used if compilerType: 'babel' in config)
// Lazily required so babel doesn't need to be installed for esbuild users.
// ---------------------------------------------------------------------------
/*async function buildWithBabel(
  entryPath: string,
  virtualContent: string,
  platform: 'node' | 'browser'
): Promise<string> {
  /*let babel: any;
  try {
    babel = require('@babel/core');
  } catch {
    throw new Error(
      '[authtics] compilerType is "babel" but @babel/core is not installed.\n' +
      'Run: npm install --save-dev @babel/core @babel/preset-env @babel/preset-react @babel/preset-typescript'
    );
  }*/

  /*const presets: any[] = [
    [babelPresetEnv, {
      targets: platform === 'node' ? { node: 'current' } : { browsers: '>0.5%, not dead' },
      modules: platform === 'node' ? 'commonjs' : false,
    }],
    //[babelPresetReact, { runtime: 'automatic' }],
    //[babelPresetTypescript, {}],
  ];

  const result = await babel.transformAsync(virtualContent, {
    filename: entryPath,
    presets,
    sourceMaps: false,
  });

  if (!result?.code) throw new Error('[authtics] Babel produced no output');
  return result.code;
}*/

// ---------------------------------------------------------------------------
// esbuild compiler (default)
// ---------------------------------------------------------------------------
/*async function buildWithEsbuild(
  virtualContent: string,
  resolveDir: string,
  platform: 'node' | 'browser'
): Promise<string> {
  const toFwdSlash = (p: string) => p.split(path.sep).join('/');
  const isNode = platform === 'node';

  const result = await esbuild.build({
    stdin: {
      contents: virtualContent,
      resolveDir,
      sourcefile: `virtual-entry-${platform}.jsx`,
    },
    bundle: true,
    write: false,
    // Server: CJS so require() works (e.g. lucide-react)
    // Client: IIFE so it runs as a plain <script> tag
    format: isNode ? 'cjs' : 'iife',
    platform,
    jsx: 'automatic',
    sourcemap: isNode ? false : /*'inline'*//*false,
    target: isNode ? ['node18'] : ['es2020'],
    minify: true,
    treeShaking: true,
    // Server: externalize React to avoid duplicate instance → "Invalid hook call"
    // Client: bundle React in so the browser needs no CDN or importmap
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
         toFwdSlash(path.join(__dirname, 'rendererTempFiles.js'))],
  });

  return result.outputFiles[0].text;
}*/

async function buildWithEsbuild(
  virtualContent: string,
  resolveDir: string,
  platform: 'node' | 'browser',
  patchForServer = false,
  options: {
    sourceMaps?: boolean;
    minify?: boolean;
  } = {}
): Promise<string> {
  const toFwdSlash = (p: string) => p.split(path.sep).join('/');
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
         toFwdSlash(path.join(__dirname, 'rendererTempFiles.js'))],
  });

  return result.outputFiles[0].text;
}

// ---------------------------------------------------------------------------
// Resolve devPanel.tsx
// ---------------------------------------------------------------------------
export function findFileUpwards(startDir: string, relativePath: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, relativePath);
    if (fs.existsSync(candidate)) return candidate;
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return null;
}

function resolveDevPanelPath(): string | null {
  /*const fromCwd = findFileUpwards(process.cwd(), path.join("src", "devPanel.tsx"));
  if (fromCwd) return fromCwd;
  const fromParent = findFileUpwards(path.join(process.cwd(), ".."), path.join("src", "devPanel.tsx"));
  if (fromParent) return fromParent;*/
  const nextToCli = path.join(__dirname, "devPanel.js");
  if (fs.existsSync(nextToCli)) return nextToCli;
  return null;
}

const devPanelPath = resolveDevPanelPath();

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------
function resolveTemplate(appDir?: string, autoPageDir?: string, autoPaging?: boolean): string | null {
  /*const pagesDir = path.join(process.cwd(), "pages");
  let dir = path.dirname(tsxPath);
  while (true) {
    const candidate = path.join(dir, "_template.html");
    if (fs.existsSync(candidate)) return candidate;
    if (dir === pagesDir || dir === path.dirname(pagesDir)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }*/
  let nextToCli;
  if (autoPaging) {
    nextToCli = path.join(process.cwd(), autoPageDir || "", "_template.html");
  } else {
    nextToCli = path.join(process.cwd(), appDir || "", "../", "_template.html");
  }
  return nextToCli;
}

function buildHtml(opts: {
  pageHtml: string;
  clientCode: string;
  devPanelContainer: string;
  templatePath: string | null;
  hotReload?: boolean;
  fileName?: string;
  datRestricted?: boolean;
  devMode?: boolean;
  renderMode?: RenderMode;
}): string {
  const { pageHtml, clientCode, devPanelContainer, templatePath, hotReload, fileName, datRestricted, devMode, renderMode } = opts;
  // Inline config for the devPanel — never contains secrets, only booleans
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

// ---------------------------------------------------------------------------
// Cache validity
// ---------------------------------------------------------------------------
function isCacheValid(
  tsxPath: string,
  tempPath: string,
  serverCjsPath: string,
  templatePath: string | null,
  devPanelPath: string | null,
  clientBundlePath?: string,
  serverBundleRequired = true
): boolean {
  if (!fs.existsSync(tempPath) || (serverBundleRequired && !fs.existsSync(serverCjsPath))) return false;
  if (clientBundlePath && !fs.existsSync(clientBundlePath)) return false;
  try {
    const cacheMtime = fs.statSync(tempPath).mtimeMs;
    // Page file changed?
    if (fs.statSync(tsxPath).mtimeMs > cacheMtime) return false;
    // Template changed?
    if (templatePath && fs.existsSync(templatePath) && fs.statSync(templatePath).mtimeMs > cacheMtime) return false;
    // DevPanel changed?
    if (devPanelPath && fs.existsSync(devPanelPath) && fs.statSync(devPanelPath).mtimeMs > cacheMtime) return false;
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// renderPage
// ---------------------------------------------------------------------------
// Small script injected into every page when hotReload is enabled.
// It opens an SSE connection to /__authtics_hmr__ and reloads on signal.
/*const HMR_SCRIPT = `<script>(function(){
  var reloading=false;
  var es=new EventSource('/hmr');
  es.onmessage=function(e){
    if(e.data==='reload'&&!reloading){
      reloading=true;
      es.close();
      window.location.reload();
    }
  };
  es.onerror=function(){
    // onerror fires on both server-down AND on page-unload (SSE closed by navigation).
    // Guard with reloading so a navigate-away never schedules a second reload.
    if(!reloading){
      setTimeout(function(){
        if(!reloading){reloading=true;window.location.reload();}
      },1500);
    }
  };
})();</script>`;*/

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

export async function renderPage(
  tsxPath: string,
  reqUrl?: string,
  showPanel = true,
  compiler: CompilerType = 'esbuild',
  hotReload = false,
  autoPaging = true,
  autoPageDir?: string,
  appDir?: string,
  fileHandler?: (f: string, p: string) => void,
  rmvFileHandler?: (p: string) => void,
  reqDAT?: string | undefined,
  configDAT?: string | string[] | undefined,
  renderMode: RenderMode = 'ssr',
  patchForServer = false
): Promise<string> {
  ensureTempDirs();

  if (!fs.existsSync(tsxPath)) {
    throw new Error(`renderPage: source file not found: ${tsxPath}`);
  }

  const datMatches =
    configDAT === undefined ||
    configDAT === reqDAT ||
    (Array.isArray(configDAT) && configDAT.includes(reqDAT ?? ""));

  const usesDevPanel =
    showPanel &&
    devPanelPath !== null &&
    datMatches;

  const enableDiagnostics =
    usesDevPanel;
  /*if (usesDevPanel) {
    // If no DAT restriction is configured, always allow.
    // If DAT restriction IS set, only include the devPanel for requests that carry a matching DAT.
    let datMatched = configDAT === undefined;
    if (configDAT && configDAT === reqDAT) datMatched = true;
    if (configDAT && Array.isArray(configDAT) && configDAT.includes(reqDAT ?? "")) datMatched = true;
    if (!datMatched) usesDevPanel = false;
  }*/
  const templatePath = resolveTemplate(appDir, autoPageDir, autoPaging);

  /*console.log(`[authtics] compiler     = ${compiler}`);
  console.log(`[authtics] devPanelPath = ${devPanelPath ?? "(not found)"}`);
  console.log(`[authtics] usesDevPanel = ${usesDevPanel}`);
  console.log(`[authtics] template     = ${templatePath ?? "(none, using default)"}`);*/

  const cacheVariant = [
    usesDevPanel ? "panel" : "normal",
    enableDiagnostics ? "mapped" : "fast",
    compiler,
  ].join("-");

  const tempPath = tempFileForTsx(tsxPath, cacheVariant);
  const separateClientBundle = getBuildStyle() === "super";
  const clientBundlePath = clientBundleForTsx(tsxPath, cacheVariant);
  const serverCjsPath = serverBundleForTsx(tsxPath, cacheVariant, tempPath);
  const ssgHtmlPath = ssgHtmlForTsx(tsxPath, cacheVariant, tempPath);
  const requiredClientBundlePath = separateClientBundle ? clientBundlePath : undefined;
  const serverCodeDisabled = renderMode === 'csr' || renderMode === 'srtws';

  // Fast-path: Return cached static HTML if SSG mode is active and valid
  if (renderMode === 'ssg' && isCacheValid(tsxPath, ssgHtmlPath, serverCjsPath, templatePath, devPanelPath, requiredClientBundlePath)) {
    try {
      return fs.readFileSync(ssgHtmlPath, "utf-8");
    } catch {
      // If reading fails, proceed to rebuild
    }
  }

  let clientCode: string | undefined;
  let serverCode: string | undefined;
  let freshWrite = false;

  if (isCacheValid(tsxPath, tempPath, serverCjsPath, templatePath, devPanelPath, requiredClientBundlePath, !serverCodeDisabled) && (autoPaging || getBuildTrigger() === "prebuilt")) {
    try {
      const parsed = JSON.parse(readTempFile(tempPath));
      if (separateClientBundle) {
        const expectedBundleRef = path.relative(process.cwd(), clientBundlePath);
        clientCode = parsed.clientBundle === expectedBundleRef
          ? fs.readFileSync(clientBundlePath, "utf-8")
          : undefined;
      } else {
        clientCode = parsed.clientCode;
      }
      serverCode = serverCodeDisabled ? undefined : fs.readFileSync(serverCjsPath, "utf-8");
      //console.log(`[authtics] using cached bundle for ${path.basename(tsxPath)}`);
    } catch {
      // corrupt — rebuild
    }
  }

  if (clientCode === undefined || (!serverCode && !serverCodeDisabled)) {
    //console.log(`[authtics] building bundle (${compiler}) for ${path.basename(tsxPath)}...`);

    const virtualServer = `
      ${usesDevPanel ? `import DevPanel from ${JSON.stringify(devPanelPath)};` : ""}
      import Page from ${JSON.stringify(tsxPath)};
      export default Page;
      ${usesDevPanel ? `export { DevPanel };` : ""}
    `;

    /*const virtualClient = `
      import React from "react";
      import { hydrateRoot } from "react-dom/client";
      ${usesDevPanel ? `import DevPanel from ${JSON.stringify(devPanelPath)};` : ""}
      import Page from ${JSON.stringify(tsxPath)};

      ${usesDevPanel ? `
      const panelEl = document.getElementById("authtics-dev-panel-root");
      if (panelEl) hydrateRoot(panelEl, React.createElement(DevPanel));
      ` : ""}
      const rootEl = document.getElementById("root");
      if (rootEl) hydrateRoot(rootEl, React.createElement(Page));
    `;*/
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
        ${
          renderMode === 'csr'
            ? `createRoot(rootEl).render(React.createElement(Page));`
            : `hydrateRoot(rootEl, React.createElement(Page));`
        }
      }
    `;

    /*if (compiler === 'babel') {
      serverCode = await buildWithBabel(tsxPath, virtualServer, 'node');
      clientCode = await buildWithBabel(tsxPath, virtualClient, 'browser');
    } else {*/
    if (compiler === 'esbuild') {
      if (!serverCodeDisabled) serverCode = await buildWithEsbuild(virtualServer, process.cwd(), 'node', patchForServer, { sourceMaps: enableDiagnostics, minify: !enableDiagnostics });
      if (renderMode !== 'srtws') {
        clientCode = await buildWithEsbuild(virtualClient, process.cwd(), 'browser', patchForServer, { sourceMaps: enableDiagnostics, minify: !enableDiagnostics });
      } else {
        clientCode = "";
      }
    }

    /*fs.writeFileSync(serverCjsPath, serverCode || "", "utf-8");
    writeTempFile(tempPath, JSON.stringify({ clientCode }));
    freshWrite = true;*/
    if (serverCode) await fs.promises.writeFile(serverCjsPath, serverCode, "utf-8");
    if (separateClientBundle) {
      await fs.promises.writeFile(clientBundlePath, clientCode ?? "", "utf-8");
      writeTempFile(tempPath, JSON.stringify({
        clientBundle: path.relative(process.cwd(), clientBundlePath),
      }));
    } else {
      writeTempFile(tempPath, JSON.stringify({ clientCode }));
    }
    freshWrite = true;
    //console.log(`[authtics] bundle cached for ${path.basename(tsxPath)}`);
  }

  fileHandler ? fileHandler(clientCode || "", `/${path.basename(tempPath).replace(".json", ".js").replace(".tsx_", ".").toLowerCase()}`) : null;

  let pageHtml = "";
  let devPanelContainer = usesDevPanel
    ? `<div id="authtics-dev-panel-root"></div>`
    : "";

  if (!serverCodeDisabled) {
    const absoluteServerPath = path.resolve(serverCjsPath);
    delete customRequire.cache[absoluteServerPath];

  // SSR
  /*const serverModule = await import(freshWrite ? `${serverCjsPath}?t=${Date.now()}` : serverCjsPath);
  const exports = serverModule.default ?? serverModule;*/
    const serverModule = customRequire(absoluteServerPath);
  /*const exports = serverModule.default ?? serverModule;
  const PageComponent = exports.default ?? exports.Page ?? exports.page ?? null;*/
    const exports = serverModule.__esModule ? serverModule.default : serverModule;
  const PageComponent = 
    exports?.default?.default ?? 
    exports?.default ?? 
    exports?.Page ?? 
    exports?.page ?? 
    (typeof exports === 'function' ? exports : null);
    const DevPanelComponent = usesDevPanel ? (exports.DevPanel ?? null) : null;

    if (!PageComponent) {
      throw new Error(`renderPage: no default export found in ${tsxPath}`);
    }

  /*const pageHtml = renderToString(React.createElement(PageComponent));
  const devPanelHtml = DevPanelComponent
    ? renderToString(React.createElement(DevPanelComponent))
    : "";
  const devPanelContainer = usesDevPanel
    ? `<div id="authtics-dev-panel-root">${devPanelHtml}</div>`
    : "";*/

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

  // Write static HTML cache if rendering mode is SSG
  if (renderMode === 'ssg') {
    await fs.promises.writeFile(ssgHtmlPath, finalHtml, "utf-8");
  }

  /*return buildHtml({ pageHtml, clientCode: clientCode || "", devPanelContainer, templatePath, hotReload,
    fileName: `/${path.basename(tempPath).replace(".json", ".js").replace(".tsx_", ".").toLowerCase()}`,
    datRestricted: configDAT !== undefined,
    devMode: showPanel,   // showPanel already reflects config.devMode
  });*/
  return finalHtml;
}
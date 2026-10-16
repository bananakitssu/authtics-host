import fs from "node:fs";
import path from "node:path";
import type { AuthticsConfig } from "./config.js";

export type HostJSRouteKind = "page" | "api" | "static";

export interface HostJSRouteRecord {
  pathname: string;
  kind: HostJSRouteKind;
  source: string;
}

const HOSTJS_DIR = ".hostjs";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readJson(filePath: string): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function toProjectPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".hostjs") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(fullPath));
    else if (entry.isFile()) result.push(fullPath);
  }
  return result;
}

function routePathFromFile(relativePath: string): string {
  const withoutExtension = relativePath.replace(/\.(?:tsx?|jsx?|html)$/i, "");
  if (withoutExtension.toLowerCase() === "index") return "/";
  return `/${withoutExtension.split(path.sep).join("/")}`;
}

function collectRoutes(
  projectRoot: string,
  pagesDir: string | undefined,
  publicDir: string | undefined
): HostJSRouteRecord[] {
  const routes: HostJSRouteRecord[] = [];

  if (pagesDir) {
    for (const filePath of walkFiles(pagesDir)) {
      const relativePath = path.relative(pagesDir, filePath);
      const normalized = relativePath.split(path.sep).join("/");
      const lower = normalized.toLowerCase();

      if (lower === "_template.html" || lower === "_paused.tsx") continue;

      if (/^api\/.+\.(?:ts|tsx)$/i.test(normalized)) {
        const pathname = `/${normalized.replace(/\.(?:tsx?)$/i, "")}`;
        routes.push({ pathname, kind: "api", source: toProjectPath(projectRoot, filePath) });
        continue;
      }

      if (/\.(?:tsx|html)$/i.test(normalized)) {
        routes.push({
          pathname: routePathFromFile(relativePath),
          kind: "page",
          source: toProjectPath(projectRoot, filePath),
        });
      }
    }
  }

  if (publicDir) {
    for (const filePath of walkFiles(publicDir)) {
      routes.push({
        pathname: `/${path.relative(publicDir, filePath).split(path.sep).join("/")}`,
        kind: "static",
        source: toProjectPath(projectRoot, filePath),
      });
    }
  }

  const unique = new Map<string, HostJSRouteRecord>();
  for (const route of routes) {
    unique.set(`${route.kind}:${route.pathname}`, route);
  }

  return [...unique.values()].sort((a, b) =>
    a.pathname.localeCompare(b.pathname) || a.kind.localeCompare(b.kind)
  );
}

function typeUnion(values: string[]): string {
  const unique = [...new Set(values)].sort();
  return unique.length ? unique.map((value) => JSON.stringify(value)).join(" | ") : "never";
}

/**
 * Creates the Super build layout and refreshes its project metadata/manifests.
 * This does not replace HostJS's live router; manifests describe the routes that
 * can be discovered from the configured pages and public directories.
 */
export function initializeSuperBuildOutput(
  projectRoot: string,
  config: AuthticsConfig,
  pagesDir?: string,
  publicDir?: string
): void {
  const root = path.resolve(projectRoot);
  const outputDir = path.join(root, HOSTJS_DIR);
  const projectPackage = readJson(path.join(root, "package.json"));
  const pagesEnabled = config.autoPage === true;
  const filesEnabled = config.autoFile === true;
  const effectivePagesDir = pagesEnabled
    ? pagesDir ?? path.join(root, config.autoPageDir || "")
    : undefined;
  const effectivePublicDir = filesEnabled
    ? publicDir ?? path.join(root, config.autoFileDir || "")
    : undefined;
  const routes = collectRoutes(root, effectivePagesDir, effectivePublicDir);

  fs.mkdirSync(outputDir, { recursive: true });

  writeJson(path.join(outputDir, "package.json"), {
    schemaVersion: 1,
    framework: "@bananacool467/authtics-host",
    frameworkName: "Authtics Host",
    shortName: "HostJS",
    buildStyle: "super",
    project: {
      name: typeof projectPackage.name === "string" ? projectPackage.name : path.basename(root),
      version: typeof projectPackage.version === "string" ? projectPackage.version : null,
    },
  });

  writeJson(path.join(outputDir, "diagnostics", "framework.json"), {
    name: "Authtics Host",
    shortName: "HostJS",
    buildStyle: "super",
    schemaVersion: 1,
  });

  // A new server start begins a fresh in-memory build/diagnostic session.
  writeJson(path.join(outputDir, "diagnostics", "build-diagnostics.json"), {
    version: 1,
    diagnostics: [],
  });

  writeJson(path.join(outputDir, "server", "routes-manifest.json"), {
    version: 1,
    generatedBy: "HostJS",
    buildStyle: "super",
    pagesDirectory: effectivePagesDir ? toProjectPath(root, effectivePagesDir) : null,
    publicDirectory: effectivePublicDir ? toProjectPath(root, effectivePublicDir) : null,
    routes,
  });

  writeJson(path.join(outputDir, "server", "middleware-manifest.json"), {
    version: 1,
    middleware: [],
  });

  const pageRoutes = routes.filter((route) => route.kind === "page").map((route) => route.pathname);
  const apiRoutes = routes.filter((route) => route.kind === "api").map((route) => route.pathname);
  const staticRoutes = routes.filter((route) => route.kind === "static").map((route) => route.pathname);

  const routeDeclarations = `// Generated by HostJS buildStyle: "super". Do not edit.
export type HostJSPageRoute = ${typeUnion(pageRoutes)};
export type HostJSApiRoute = ${typeUnion(apiRoutes)};
export type HostJSStaticRoute = ${typeUnion(staticRoutes)};
`;
  fs.mkdirSync(path.join(outputDir, "types", "app"), { recursive: true });
  fs.writeFileSync(path.join(outputDir, "types", "routes.d.ts"), routeDeclarations, "utf-8");
  fs.writeFileSync(
    path.join(outputDir, "types", "validator.ts"),
    `// Generated by HostJS buildStyle: "super". Do not edit.
import type { HostJSPageRoute, HostJSApiRoute, HostJSStaticRoute } from "./routes.js";

const pageRoutes = ${JSON.stringify([...new Set(pageRoutes)].sort())} as const;
const apiRoutes = ${JSON.stringify([...new Set(apiRoutes)].sort())} as const;
const staticRoutes = ${JSON.stringify([...new Set(staticRoutes)].sort())} as const;

export function isHostJSPageRoute(value: string): value is HostJSPageRoute {
  return (pageRoutes as readonly string[]).includes(value);
}

export function isHostJSApiRoute(value: string): value is HostJSApiRoute {
  return (apiRoutes as readonly string[]).includes(value);
}

export function isHostJSStaticRoute(value: string): value is HostJSStaticRoute {
  return (staticRoutes as readonly string[]).includes(value);
}
`,
    "utf-8"
  );
  fs.writeFileSync(
    path.join(outputDir, "types", "app", "routes.d.ts"),
    `// Generated by HostJS buildStyle: "super". Do not edit.
export type { HostJSPageRoute, HostJSApiRoute, HostJSStaticRoute } from "../routes.js";
`,
    "utf-8"
  );

  const traceDir = path.join(outputDir, "trace");
  const traceBuildDir = path.join(outputDir, "trace-build");
  fs.mkdirSync(traceDir, { recursive: true });
  fs.mkdirSync(traceBuildDir, { recursive: true });
}

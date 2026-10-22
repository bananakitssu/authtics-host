import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { mapGeneratedLocation } from "../dist/devPanel.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(projectRoot, "dist", "cli.js");
const errorMarker = "cached-tsx-source-map-error";
const pageSource = `export default function Page() {
  return (
    <main>
      {(() => {
        throw new Error("${errorMarker}");
      })()}
    </main>
  );
}
`;

function childHasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function reservePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function createFixture(buildStyle) {
  const fixtureRoot = await fs.mkdtemp(path.join(projectRoot, ".source-map-location-"));
  const pagesDir = path.join(fixtureRoot, "pages");
  const port = await reservePort();
  await fs.mkdir(pagesDir);
  await fs.writeFile(path.join(pagesDir, "index.tsx"), pageSource);
  await fs.writeFile(
    path.join(fixtureRoot, "authtics_host.config.ts"),
    `export default {
  port: ${port},
  renderType: "csr",
  devMode: true,
  autoPage: true,
  autoPageDir: "pages",
  autoFile: false,
  buildStyle: ${JSON.stringify(buildStyle)}
};\n`,
  );
  const serverEntryPath = path.join(fixtureRoot, "server.mjs");
  await fs.writeFile(
    serverEntryPath,
    `import App from ${JSON.stringify(pathToFileURL(cliPath).href)};\nnew App();\n`,
  );

  return { fixtureRoot, port, serverEntryPath };
}

async function startFixtureServer(fixture) {
  const child = spawn(process.execPath, [fixture.serverEntryPath], {
    cwd: fixture.fixtureRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (output += chunk));

  try {
    const baseUrl = `http://127.0.0.1:${fixture.port}`;
    const deadline = Date.now() + 20_000;
    let lastFailure = "Server did not become ready.";
    while (Date.now() < deadline) {
      if (childHasExited(child)) {
        throw new Error(
          `Server exited with code ${child.exitCode} and signal ${child.signalCode}.\n${output}`,
        );
      }

      try {
        const response = await fetch(`${baseUrl}/`);
        const html = await response.text();
        if (response.ok) {
          const scriptUrl = html.match(/<script src="([^"]+\.js)"><\/script>/)?.[1];
          assert.ok(scriptUrl, `Rendered page did not include its JavaScript bundle.\n${html}`);
          return { child, baseUrl, scriptUrl, output };
        }
        lastFailure = `Page returned HTTP ${response.status}:\n${html}`;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`${lastFailure}\n${output}`);
  } catch (error) {
    await stopFixtureServer({ child });
    throw error;
  }
}

async function stopFixtureServer(server) {
  if (!childHasExited(server.child)) {
    const exited = once(server.child, "exit");
    server.child.kill("SIGTERM");
    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
    ]);
    if (!stopped && !childHasExited(server.child)) {
      const forceExit = once(server.child, "exit");
      server.child.kill("SIGKILL");
      await forceExit;
    }
  }
}

async function findClientMapPath(fixtureRoot, buildStyle) {
  const cacheRoot = buildStyle === "default"
    ? path.join(fixtureRoot, ".authtics_host", "cache")
    : path.join(fixtureRoot, ".hostjs", "cache", "bundler", "client-production");
  const mapFiles = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.name.endsWith(".js.map")) mapFiles.push(entryPath);
    }
  }
  await visit(cacheRoot);
  assert.equal(mapFiles.length, 1, "Expected one cached client source map.");
  return mapFiles[0];
}

async function verifyBrowserErrorMapping(server, expectedSourceLine = 5) {
  const scriptResponse = await fetch(new URL(server.scriptUrl, server.baseUrl));
  assert.equal(scriptResponse.status, 200);
  const generatedCode = await scriptResponse.text();

  assert.match(
    generatedCode,
    /\/\/[#@]\s*sourceMappingURL=(?!data:)[^\s]+/,
    "The generated JavaScript should reference an external source map.",
  );
  assert.doesNotMatch(
    generatedCode,
    /sourceMappingURL=data:|data:application\/json[^,\s]*;base64,/i,
    "The generated JavaScript must not embed its source map as base64.",
  );

  const markerIndex = generatedCode.indexOf(errorMarker);
  assert.notEqual(markerIndex, -1, "The browser bundle should contain the deliberate error.");
  const generatedThrowIndex = generatedCode.lastIndexOf("throw", markerIndex);
  assert.notEqual(generatedThrowIndex, -1, "Could not locate the generated throw statement.");
  const prefix = generatedCode.slice(0, generatedThrowIndex);
  const generatedLine = prefix.split("\n").length;
  const generatedColumn = generatedThrowIndex - prefix.lastIndexOf("\n");

  const mappedLocation = await mapGeneratedLocation({
    file: scriptResponse.url,
    line: generatedLine,
    column: generatedColumn,
    mapped: false,
  });

  assert.equal(mappedLocation.mapped, true, "The DevPanel should map the browser error.");
  assert.match(mappedLocation.file, /pages\/index\.tsx$/);
  assert.equal(mappedLocation.line, expectedSourceLine);
  assert.equal(mappedLocation.column, 9);
  assert.match(mappedLocation.sourceText, /throw new Error\("cached-tsx-source-map-error"\)/);
}

for (const buildStyle of ["default", "super"]) {
  test(`${buildStyle} build maps browser errors after a fresh build and a disk-cache hit`, async () => {
    const fixture = await createFixture(buildStyle);
    let server;
    try {
      server = await startFixtureServer(fixture);
      await verifyBrowserErrorMapping(server);
      const mapPath = await findClientMapPath(fixture.fixtureRoot, buildStyle);
      const initialMapMtime = (await fs.stat(mapPath, { bigint: true })).mtimeNs;

      // A new process has no in-memory asset routes; it must reuse the cached
      // bundle and restore its map from disk without rebuilding either file.
      await stopFixtureServer(server);
      server = await startFixtureServer(fixture);
      await verifyBrowserErrorMapping(server);
      assert.equal(
        (await fs.stat(mapPath, { bigint: true })).mtimeNs,
        initialMapMtime,
        "The cache-hit request should reuse the existing source map.",
      );

      // A missing sidecar must invalidate the otherwise-valid JavaScript
      // cache and produce a matching map before the asset is served.
      await stopFixtureServer(server);
      await fs.unlink(mapPath);
      server = await startFixtureServer(fixture);
      await verifyBrowserErrorMapping(server);
      const restoredMapMtime = (await fs.stat(mapPath, { bigint: true })).mtimeNs;
      assert.notEqual(
        restoredMapMtime,
        initialMapMtime,
        "A missing cached map should be rebuilt rather than silently reused.",
      );

      // Changing the TSX source must rebuild the bundle and map together so a
      // valid JavaScript URL cannot keep pointing at an outdated map.
      await stopFixtureServer(server);
      const sourcePath = path.join(fixture.fixtureRoot, "pages", "index.tsx");
      await fs.writeFile(
        sourcePath,
        pageSource.replace("        throw new Error", "        // Shift the mapped error down one line.\n        throw new Error"),
      );
      const future = new Date(Date.now() + 2_000);
      await fs.utimes(sourcePath, future, future);
      server = await startFixtureServer(fixture);
      await verifyBrowserErrorMapping(server, 6);
      assert.notEqual(
        (await fs.stat(mapPath, { bigint: true })).mtimeNs,
        restoredMapMtime,
        "A changed TSX source should replace its cached source map.",
      );
    } finally {
      if (server) await stopFixtureServer(server);
      await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
    }
  });
}

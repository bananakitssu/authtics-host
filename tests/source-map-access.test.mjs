import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(projectRoot, "dist", "cli.js");
const allowedDat = "source-map-test-dat";
const sourceMarker = "source-map-source-content-test-marker";

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

async function startFixtureServer(dat) {
  const fixtureRoot = await fs.mkdtemp(path.join(projectRoot, ".source-map-access-"));
  const pagesDir = path.join(fixtureRoot, "pages");
  const port = await reservePort();
  await fs.mkdir(pagesDir);
  await fs.writeFile(
    path.join(fixtureRoot, "authtics_host.config.ts"),
    `export default {
  port: ${port},
  renderType: "csr",
  devMode: true,
  autoPage: true,
  autoPageDir: "pages",
  autoFile: false,
  dat: ${dat === undefined ? "undefined" : JSON.stringify(dat)}
};\n`,
  );
  await fs.writeFile(
    path.join(pagesDir, "index.tsx"),
    `export default function Page() {
  return <main>${sourceMarker}</main>;
}\n`,
  );
  const serverEntryPath = path.join(fixtureRoot, "server.mjs");
  await fs.writeFile(
    serverEntryPath,
    `import App from ${JSON.stringify(pathToFileURL(cliPath).href)};\nnew App();\n`,
  );
  const child = spawn(process.execPath, [serverEntryPath], {
    cwd: fixtureRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (output += chunk));
  child.stderr.setEncoding("utf8").on("data", (chunk) => (output += chunk));

  try {
    const deadline = Date.now() + 20_000;
    let lastFailure = "Server did not become ready.";
    while (Date.now() < deadline) {
      if (childHasExited(child)) {
        throw new Error(
          `Server exited with code ${child.exitCode} and signal ${child.signalCode}.\n${output}`,
        );
      }

      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
          headers: dat === undefined ? {} : { cookie: `dat=${dat}` },
        });
        const html = await response.text();
        if (response.ok) {
          const scriptUrl = html.match(/<script src="([^"]+\.js)"><\/script>/)?.[1];
          assert.ok(scriptUrl, `Rendered page did not include its JavaScript bundle.\n${html}`);
          return {
            baseUrl: `http://127.0.0.1:${port}`,
            child,
            fixtureRoot,
            mapUrl: `${scriptUrl}.map`,
          };
        }
        lastFailure = `Page returned HTTP ${response.status}:\n${html}`;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`${lastFailure}\n${output}`);
  } catch (error) {
    child.kill("SIGKILL");
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    throw error;
  }
}

async function stopFixtureServer(fixture) {
  if (!childHasExited(fixture.child)) {
    const exited = once(fixture.child, "exit");
    fixture.child.kill("SIGTERM");
    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
    ]);
    if (!stopped && !childHasExited(fixture.child)) {
      const forceExit = once(fixture.child, "exit");
      fixture.child.kill("SIGKILL");
      await forceExit;
    }
  }
  await fs.rm(fixture.fixtureRoot, { recursive: true, force: true });
}

async function assertValidSourceMap(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/i);
  const sourceMap = await response.json();
  assert.equal(sourceMap.version, 3);
  assert.ok(Array.isArray(sourceMap.sourcesContent));
  assert.ok(
    sourceMap.sourcesContent.some((content) => content?.includes(sourceMarker)),
    "The source map should contain the original page source for this regression test.",
  );
}

test("DAT-protected source maps deny missing and incorrect tokens but allow the configured DAT", async () => {
  const fixture = await startFixtureServer(allowedDat);
  try {
    const missingDatResponse = await fetch(`${fixture.baseUrl}${fixture.mapUrl}`);
    assert.equal(missingDatResponse.status, 404);
    assert.equal(await missingDatResponse.text(), "");

    const incorrectDatResponse = await fetch(`${fixture.baseUrl}${fixture.mapUrl}`, {
      headers: { cookie: "dat=wrong-source-map-test-dat" },
    });
    assert.equal(incorrectDatResponse.status, 404);
    assert.equal(await incorrectDatResponse.text(), "");

    const matchingDatResponse = await fetch(`${fixture.baseUrl}${fixture.mapUrl}`, {
      headers: { cookie: `dat=${allowedDat}` },
    });
    await assertValidSourceMap(matchingDatResponse);
  } finally {
    await stopFixtureServer(fixture);
  }
});

test("unrestricted projects can load valid external source maps without a DAT", async () => {
  const fixture = await startFixtureServer(undefined);
  try {
    const response = await fetch(`${fixture.baseUrl}${fixture.mapUrl}`);
    await assertValidSourceMap(response);
  } finally {
    await stopFixtureServer(fixture);
  }
});

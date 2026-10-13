import { chromium } from "playwright";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { consumerRehearsal } from "./browser-flows.mjs";
import { lifecycleConsumer } from "./lifecycle-consumer.mjs";
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const zip =
  process.env.ROUNDRELAY_ZIP ??
  path.resolve(`artifacts/roundrelay-${version}-web.zip`);
const consumer = await mkdtemp(path.join(tmpdir(), "roundrelay-consumer-"));
await promisify(execFile)("unzip", ["-q", zip, "-d", consumer]);
assert.ok(!(await readdir(consumer)).includes("node_modules"));
const server = spawn(process.execPath, ["serve.mjs", "--port", "0"], {
  cwd: consumer,
  stdio: ["ignore", "pipe", "pipe"],
});
let errors = "";
server.stderr.on("data", (data) => {
  errors += data;
});
const url = await new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Consumer server did not start: " + errors)),
    10000,
  );
  server.stdout.on("data", (data) => {
    const match = String(data).match(/ROUNDRELAY_URL=(\S+)/);
    if (match) {
      clearTimeout(timeout);
      resolve(match[1]);
    }
  });
  server.once("exit", (code) => {
    clearTimeout(timeout);
    reject(new Error(`Consumer server exited ${code}: ${errors}`));
  });
});
const browser = await chromium.launch();
try {
  const result = await consumerRehearsal(browser, url);
  const lifecycle = await lifecycleConsumer(
    browser,
    url,
    path.join(consumer, "rehearsal-fixtures"),
  );
  for (const route of [
    "/%2e%2e/package.json",
    "/..%2fLICENSE",
    "/serve.mjs",
    "/sample-event.json",
    "/node_modules/react/index.js",
  ]) {
    const response = await fetch(url + route.slice(1));
    assert.ok(response.status >= 400, route);
  }
  const response = await fetch(url);
  assert.ok(
    response.headers
      .get("content-security-policy")
      .includes("script-src 'self'"),
  );
  await writeFile(
    "artifacts/consumer-test.json",
    JSON.stringify(
      {
        ...result,
        lifecycle,
        artifact: path.basename(zip),
        buildInfo: JSON.parse(
          await readFile(path.join(consumer, "build-info.json"), "utf8"),
        ),
        browser: browser.version(),
        testedAt: new Date().toISOString(),
        isolatedExtraction: true,
        noNodeModules: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: final ZIP extracted outside sources; full consumer rehearsal, paths, and CSP verified.",
  );
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

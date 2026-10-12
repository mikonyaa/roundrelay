import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const url = process.env.ROUNDRELAY_URL ?? "http://127.0.0.1:4179/";
const browser = await chromium.launch({
  args: [
    "--renderer-process-limit=1",
    "--disable-site-isolation-trials",
    "--disable-features=SpareRendererForSitePerProcess",
  ],
});
let stoppedPid;
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "Try 24-person sample" }).click();
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await page.getByText("Saved locally", { exact: true }).waitFor();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const p = JSON.parse(await readFile(await (await download).path(), "utf8"));
  const deadline = p.rounds[0].timer.deadlineEpochMs;
  const cdp = await browser.newBrowserCDPSession();
  const info = await cdp.send("SystemInfo.getProcessInfo");
  const renderers = info.processInfo.filter((p) => p.type === "renderer");
  assert.equal(
    renderers.length,
    1,
    "Only pause a single renderer proven to belong to this fresh, isolated browser",
  );
  const pid = renderers[0].id;
  assert.ok(pid > 1);
  const wallStart = Date.now(),
    monoStart = process.hrtime.bigint();
  process.kill(pid, "SIGSTOP");
  stoppedPid = pid;
  await new Promise((resolve) => setTimeout(resolve, 3200));
  const externalElapsedMs = Number(process.hrtime.bigint() - monoStart) / 1e6;
  process.kill(pid, "SIGCONT");
  stoppedPid = undefined;
  await page.waitForTimeout(350);
  const text = await page.getByTestId("timer").innerText();
  const [m, s] = text.split(":").map(Number);
  const displayedSeconds = m * 60 + s;
  const expectedSeconds = Math.ceil(Math.max(0, deadline - Date.now()) / 1000);
  assert.ok(externalElapsedMs >= 3100);
  assert.ok(Math.abs(displayedSeconds - expectedSeconds) <= 1);
  assert.ok(Date.now() - wallStart >= 3100);
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/suspension-test.json",
    JSON.stringify(
      {
        passed: true,
        method:
          "SIGSTOP/SIGCONT of the sole renderer in a newly launched isolated Chromium",
        externalElapsedMs,
        displayedSeconds,
        expectedSeconds,
        browser: browser.version(),
        platform: process.platform,
        hardwareSleepTested: false,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: own Chromium renderer stopped for ${Math.round(externalElapsedMs)} ms; timer ${displayedSeconds}s agrees with independent wall deadline ${expectedSeconds}s.`,
  );
} finally {
  if (stoppedPid) process.kill(stoppedPid, "SIGCONT");
  await browser.close();
}

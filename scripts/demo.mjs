import { chromium } from "playwright";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const url = process.env.ROUNDRELAY_URL ?? "http://127.0.0.1:4179/";
await mkdir("docs/media", { recursive: true });
await mkdir(".local/demo-video", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: {
    dir: ".local/demo-video",
    size: { width: 1440, height: 1000 },
  },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const started = Date.now();
let projector;
let projectorStart;
let projectorEnd;
try {
  await page.goto(url);
  await page.getByRole("button", { name: "Try 24-person sample" }).click();
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await page.getByText("Saved locally", { exact: true }).waitFor();
  await page.screenshot({ path: "docs/media/01-running.png" });
  await pause(2500);
  await page.getByRole("button", { name: "Finish round" }).click();
  await page.getByLabel("Select Aster (p01)", { exact: true }).check();
  await page.getByLabel("Select Birch (p02)", { exact: true }).check();
  await page.getByRole("button", { name: "Mark selected absent" }).click();
  await pause(2000);
  await page.getByRole("button", { name: "Preview repair" }).click();
  await page.getByRole("heading", { name: "Your future repair" }).waitFor();
  await page.locator(".repair-preview").scrollIntoViewIfNeeded();
  await pause(4000);
  await page.screenshot({ path: "docs/media/02-preview.png" });
  await page.getByRole("button", { name: "Apply future repair" }).click();
  await page.getByText("Saved locally", { exact: true }).waitFor();
  await page.locator(".history-section").scrollIntoViewIfNeeded();
  await pause(2000);
  await page.screenshot({ path: "docs/media/03-history.png" });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  const applied = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  await writeFile(
    "examples/rehearsal-after-repair.json",
    JSON.stringify(applied, null, 2) + "\n",
  );
  await page
    .getByRole("button", { name: "Start round 2", exact: true })
    .click();
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open projector" }).click();
  projector = await popup;
  await projector.setViewportSize({ width: 1920, height: 1080 });
  await projector
    .getByText("Round 2 / 4 · New perspectives", { exact: true })
    .waitFor();
  projectorStart = (Date.now() - started) / 1000;
  await projector.screenshot({ path: "docs/media/04-projector.png" });
  await pause(3500);
  projectorEnd = (Date.now() - started) / 1000;
  await page.bringToFront();
  await page.getByRole("button", { name: "Print routes" }).click();
  await pause(3000);
  await page.screenshot({ path: "docs/media/05-print.png" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: "examples/printable-routes-24.pdf",
    format: "A4",
    printBackground: true,
  });
  const remaining = 25000 - (Date.now() - started);
  if (remaining > 0) await pause(remaining);
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await context.close();
  await browser.close();
}
const source = await page.video().path();
await copyFile(source, "docs/media/rehearsal.webm");
try {
  await promisify(execFile)("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    source,
    "-loop",
    "1",
    "-i",
    "docs/media/04-projector.png",
    "-filter_complex",
    `[0:v]trim=0:${projectorStart},setpts=PTS-STARTPTS,fps=25,format=yuv420p[a];[1:v]scale=1440:810,pad=1440:1000:0:95:color=0x15251e,trim=duration=${projectorEnd - projectorStart},setpts=PTS-STARTPTS,fps=25,format=yuv420p[b];[0:v]trim=start=${projectorEnd},setpts=PTS-STARTPTS,fps=25,format=yuv420p[c];[a][b][c]concat=n=3:v=1:a=0[out]`,
    "-map",
    "[out]",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "docs/media/rehearsal.mp4",
  ]);
  console.log(
    "Recorded actual browser rehearsal with an explicitly edited real projector snapshot: docs/media/rehearsal.mp4",
  );
} catch {
  console.log(
    "MP4 conversion unavailable; actual WebM and screenshot sequence recorded.",
  );
}

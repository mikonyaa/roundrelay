import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { sampleProject } from "../../src/model/sample";
import type { EventProject } from "../../src/model/schema";
import { protectionFingerprint, futureState } from "../../src/history";

async function saved(page: Page) {
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
}
async function backup(page: Page): Promise<EventProject> {
  await saved(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download backup" }).click(),
  ]);
  return JSON.parse(
    await readFile((await download.path())!, "utf8"),
  ) as EventProject;
}
async function openSample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try 24-person sample" }).click();
  await saved(page);
}
async function importPlan(page: Page, project: EventProject) {
  await page.goto("/");
  await page.getByRole("button", { name: "Import your plan" }).click();
  await page.getByLabel("Event JSON").fill(JSON.stringify(project));
  await page.getByRole("button", { name: "Preview JSON", exact: true }).click();
  await page
    .getByRole("button", { name: "Open reviewed plan", exact: true })
    .click();
  await saved(page);
}
async function leaveTwo(page: Page) {
  await page.getByLabel("Select Aster (p01)", { exact: true }).check();
  await page.getByLabel("Select Birch (p02)", { exact: true }).check();
  await page
    .getByRole("button", { name: "Mark selected absent", exact: true })
    .click();
  await saved(page);
}
async function preview(page: Page) {
  await page
    .getByRole("button", { name: "Preview repair", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your future repair" }),
  ).toBeVisible();
}

test("vertical rehearsal: frozen round, zero-move diff, apply, undo, projector, print and backup", async ({
  page,
}) => {
  await mkdir("output/playwright", { recursive: true });
  await openSample(page);
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await saved(page);
  const [projector] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Open projector" }).click(),
  ]);
  await expect(
    projector.getByRole("heading", {
      name: "Small circles, fresh perspectives",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish round", exact: true }).click();
  await saved(page);
  const before = await backup(page);
  await leaveTwo(page);
  await preview(page);
  await expect(
    page.getByText(
      "Verified: current and completed rounds preserved; timer control state unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/desktop-preview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Apply future repair", exact: true })
    .click();
  const applied = await backup(page);
  expect(protectionFingerprint(applied)).toBe(protectionFingerprint(before));
  expect(applied.rounds[1].assignments.length).toBe(22);
  expect(applied.repairHistory.at(-1)?.moved).toBe(0);
  await page
    .getByRole("button", { name: "Undo last repair", exact: true })
    .click();
  const undone = await backup(page);
  expect(futureState(undone)).toEqual(futureState(before));
  await page
    .getByRole("button", { name: "Start round 2", exact: true })
    .click();
  await expect(
    projector.getByText("Round 2 / 4 · New perspectives", { exact: true }),
  ).toBeVisible();
  await projector.setViewportSize({ width: 1280, height: 720 });
  await projector.screenshot({ path: "output/playwright/projector-1280.png" });
  const wideProjector = await page.context().newPage();
  await wideProjector.setViewportSize({ width: 1920, height: 1080 });
  await wideProjector.goto(projector.url());
  await expect(
    wideProjector.getByRole("heading", {
      name: "Small circles, fresh perspectives",
    }),
  ).toBeVisible();
  await wideProjector.screenshot({
    path: "output/playwright/projector-1920.png",
  });
  await wideProjector.close();
  await page.getByRole("button", { name: "Print routes", exact: true }).click();
  await expect(page.locator(".route")).toHaveCount(24);
  await page.screenshot({
    path: "output/playwright/print-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to conductor" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "output/playwright/mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("running late arrival preserves assignments/status/timer; draft reload/cancel/apply/undo is complete", async ({
  page,
}) => {
  const sample = sampleProject();
  sample.rounds.forEach((r) => {
    r.assignments = r.assignments.filter((a) => a.participantId !== "p01");
  });
  sample.availability
    .filter((a) => a.participantId === "p01")
    .forEach((a) => {
      a.available = false;
    });
  await importPlan(page, sample);
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  const before = await backup(page);
  await page.getByLabel("Select Aster (p01)", { exact: true }).check();
  await page.getByRole("button", { name: "Mark selected present" }).click();
  await page.getByText("Edit future group bounds", { exact: false }).click();
  await page.getByLabel("Field maximum", { exact: true }).fill("7");
  await saved(page);
  await page.reload();
  await expect(page.getByTestId("timer")).toBeVisible();
  if (
    await page.getByRole("button", { name: "Recover saved event" }).isVisible()
  ) {
    await page.waitForTimeout(5500);
    await page.getByRole("button", { name: "Recover saved event" }).click();
  }
  await saved(page);
  expect(
    (await backup(page)).conductor.pendingDraft?.futureGroupChanges[0].maxSize,
  ).toBe(7);
  await preview(page);
  await page.getByRole("button", { name: "Apply future repair" }).click();
  const applied = await backup(page);
  expect(protectionFingerprint(applied)).toBe(protectionFingerprint(before));
  expect(applied.rounds[1].groups[0].maxSize).toBe(7);
  await page.getByRole("button", { name: "Undo last repair" }).click();
  expect(futureState(await backup(page))).toEqual(futureState(before));
  await leaveTwo(page);
  await page.getByRole("button", { name: "Cancel entire draft" }).click();
  expect(futureState(await backup(page))).toEqual(futureState(before));
});

test("capacity proof differs from budget exhaustion, and preview becomes stale after a timer command", async ({
  page,
}) => {
  const p = sampleProject();
  p.constraints.mustSeparate.push({ participantIds: ["p01", "p05"] });
  await importPlan(page, p);
  await page.getByText("Edit future group bounds").click();
  await page.getByLabel("Field maximum").fill("7");
  await page.getByText("Bounded search settings", { exact: true }).click();
  await page.getByLabel("Iteration budget").fill("0");
  await page.getByRole("button", { name: "Preview repair" }).click();
  await expect(
    page.getByRole("heading", { name: "Unsolved within this budget" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply future repair" }),
  ).toBeDisabled();
  await page.getByLabel("Field maximum").fill("1");
  await page.getByRole("button", { name: "Preview repair" }).click();
  await expect(
    page.getByRole("heading", { name: "Proven capacity contradiction" }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/error.png",
    fullPage: true,
  });
});

test("stale preview and started-round undo are disabled; keyboard avoids form input", async ({
  page,
}) => {
  await openSample(page);
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await leaveTwo(page);
  await preview(page);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Apply future repair" }),
  ).toBeDisabled();
  await preview(page);
  await page.getByRole("button", { name: "Apply future repair" }).click();
  await page.getByRole("button", { name: "Finish round" }).click();
  await page
    .getByRole("button", { name: "Start round 2", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo last repair" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Undo is unavailable because an affected round has started.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByText("Bounded search settings", { exact: true }).click();
  await page.getByLabel("Planner seed").focus();
  await page.keyboard.press("Alt+s");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.locator(".brand").focus();
  await page.keyboard.press("Alt+s");
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
});

test("timer survives real reload/background and expiry remains a running round", async ({
  page,
  context,
}) => {
  await importPlan(page, sampleProject(24, 4, 7000));
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  const before = await backup(page);
  const wallStart = Date.now();
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await new Promise((resolve) => setTimeout(resolve, 1800));
  await page.reload();
  await expect(page.getByTestId("timer")).toBeVisible();
  const seconds = Number(
    (await page.getByTestId("timer").textContent())!.split(":")[1],
  );
  const expected = Math.ceil(
    Math.max(0, before.rounds[0].timer!.deadlineEpochMs! - Date.now()) / 1000,
  );
  expect(Math.abs(seconds - expected)).toBeLessThanOrEqual(1);
  expect(Date.now() - wallStart).toBeGreaterThan(1700);
  await new Promise((resolve) => setTimeout(resolve, 5500));
  await expect(page.getByTestId("timer")).toHaveText("00:00");
  await expect(
    page.getByRole("button", { name: "Finish round" }),
  ).toBeVisible();
  await other.close();
});

test("two conductor tabs cannot race writers; owner close permits explicit recovery", async ({
  page,
  context,
}) => {
  await openSample(page);
  const second = await context.newPage();
  await second.goto("/");
  await expect(
    second.getByText("Read-only conductor.", { exact: true }),
  ).toBeVisible();
  await expect(
    second.getByRole("button", { name: "Start round 1", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await saved(page);
  await expect(
    second.getByRole("button", { name: "Pause", exact: true }),
  ).toBeDisabled();
  await page.close();
  await second.waitForTimeout(5500);
  await second.getByRole("button", { name: "Recover saved event" }).click();
  await expect(
    second.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
});

test("malformed imports, oversized files and inert HTML cannot replace the current event", async ({
  page,
}) => {
  await openSample(page);
  const before = await backup(page);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("Event JSON").fill("{");
  await page.getByRole("button", { name: "Preview JSON" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Choose JSON").setInputFiles({
    name: "too-large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(2097153, 32),
  });
  await expect(
    page.getByText("Input exceeds the 2 MiB limit", { exact: true }),
  ).toBeVisible();
  expect(await backup(page)).toEqual(before);
  const injected = sampleProject();
  injected.participants[0].publicLabel = "<img src=x onerror=alert(1)>";
  await page.getByLabel("Event JSON").fill(JSON.stringify(injected));
  await page.getByRole("button", { name: "Preview JSON" }).click();
  await page
    .getByRole("button", { name: "Replace open event with reviewed plan" })
    .click();
  expect(await page.locator("img").count()).toBe(0);
  await expect(
    page.getByText("<img src=x onerror=alert(1)>", { exact: true }).first(),
  ).toBeVisible();
});

test("quoted CSV preview preserves two same labels and reports stable assignments", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import your plan" }).click();
  await page.getByLabel("participants.csv", { exact: true }).setInputFiles({
    name: "participants.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      '\uFEFFparticipant_id,public_label\r\np01,"Sage, 星"\r\np02,"Sage, 星"\r\n',
    ),
  });
  await page.getByLabel("assignments.csv", { exact: true }).setInputFiles({
    name: "assignments.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "round,group,participant_id\r\n1,g1,p02\r\n1,g1,p01\r\n",
    ),
  });
  await page.getByLabel("Group minimum").fill("1");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Open reviewed plan" }).click();
  const p = await backup(page);
  expect(p.participants.map((x) => x.publicLabel)).toEqual([
    "Sage, 星",
    "Sage, 星",
  ]);
  expect(p.rounds[0].assignments.map((a) => a.participantId)).toEqual([
    "p02",
    "p01",
  ]);
});

test("privacy canary absent from channel, projector DOM/URL/requests/print; snapshot refresh and stale heartbeat", async ({
  page,
  context,
}) => {
  const p = sampleProject();
  p.participants[0].privateNote = "PRIVATE_NOTE_CANARY_492";
  p.constraints.mustSeparate.push({
    participantIds: ["p01", "p02"],
    reason: "PRIVATE_REASON_CANARY_492",
  });
  await importPlan(page, p);
  await context.addInitScript(() => {
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      if (location.hash.startsWith("#/projector"))
        throw new Error("Projector must not read IndexedDB");
      return original(...args);
    };
  });
  const [projector] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Open projector" }).click(),
  ]);
  await expect(projector.getByRole("heading", { name: p.title })).toBeVisible();
  const session = new URLSearchParams(projector.url().split("?")[1]).get(
    "session",
  )!;
  const observer = await context.newPage();
  await observer.goto("/#/projector?session=" + session);
  const messages = await observer.evaluate(async (sessionId) => {
    const channel = new BroadcastChannel("roundrelay-public-v1-" + sessionId);
    const received: unknown[] = [];
    channel.onmessage = (event) => received.push(event.data);
    channel.postMessage({ version: 1, type: "request-snapshot" });
    await new Promise((resolve) => setTimeout(resolve, 1300));
    channel.close();
    return JSON.stringify(received);
  }, session);
  expect(messages).toContain("snapshot");
  expect(messages).not.toContain("PRIVATE_");
  expect(messages).not.toContain("participantId");
  expect(messages).not.toContain("repairHistory");
  expect(await projector.content()).not.toContain("PRIVATE_");
  expect(projector.url()).not.toContain("PRIVATE_");
  await projector.reload();
  await expect(projector.getByRole("heading", { name: p.title })).toBeVisible();
  await page.getByRole("button", { name: "Print routes" }).click();
  expect(await page.content()).not.toContain("PRIVATE_");
  await page.close();
  await expect(
    projector.getByText("Disconnected / stale", { exact: false }),
  ).toBeVisible({ timeout: 15000 });
  await observer.close();
});

test("blocked projector popup explains retry", async ({ page }) => {
  await openSample(page);
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole("button", { name: "Open projector" }).click();
  await expect(
    page.getByText("Popup blocked.", { exact: false }),
  ).toBeVisible();
});

test("60 people, long labels, measured worker cancellation, projector pagination and print fit", async ({
  page,
  browserName,
}) => {
  const p = sampleProject(60, 6, 300000, true);
  await importPlan(page, p);
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  const [projector] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Open projector" }).click(),
  ]);
  await projector.setViewportSize({ width: 1280, height: 720 });
  await expect(
    projector.getByText("Page 1 of 12", { exact: true }),
  ).toBeVisible();
  await projector.screenshot({
    path: "output/playwright/long-projector-1280.png",
  });
  await projector.getByRole("button", { name: "Next page" }).click();
  await expect(
    projector.getByText("Page 2 of 12", { exact: true }),
  ).toBeVisible();
  expect(
    await projector.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await projector.evaluate(
      () =>
        document.querySelector(".projector-controls")!.getBoundingClientRect()
          .bottom <= innerHeight,
    ),
  ).toBe(true);
  await page.getByText("Edit future group bounds").click();
  await page.getByLabel("Field enabled").uncheck();
  await page.getByRole("button", { name: "Preview repair" }).click();
  await expect(
    page.getByRole("heading", { name: "Proven capacity contradiction" }),
  ).toBeVisible();
  await page.getByLabel("Field enabled").check();
  await page.getByLabel("Field minimum").fill("11");
  await page.getByLabel("Field maximum").fill("12");
  await page.getByText("Bounded search settings", { exact: true }).click();
  await page.getByLabel("Iteration budget").fill("200000");
  await page.getByRole("button", { name: "Preview repair" }).click();
  const cancel = page.getByRole("button", {
    name: "Cancel calculation",
    exact: true,
  });
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(
    page.getByText("Calculation cancelled.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Print routes" }).click();
  await expect(page.locator(".route")).toHaveCount(60);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/playwright/long-label-print.png",
    fullPage: true,
    scale: "css",
  });
  if (browserName === "chromium") {
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: "output/playwright/routes-60.pdf",
      format: "A4",
      printBackground: true,
    });
  }
});

test("storage error exposes unsaved backup without losing event", async ({
  page,
}) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new Error("Synthetic storage quota failure");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try 24-person sample" }).click();
  await expect(
    page.getByText("Unsaved · download a backup", { exact: true }),
  ).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download backup" }).click(),
  ]);
  expect(download.suggestedFilename()).toContain("sample-24");
});

import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { lifecycleProject } from "../fixtures/lifecycle";
import type { EventProject } from "../../src/model/schema";

async function open(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Import your plan", exact: true })
    .click();
  await page.getByLabel("Event JSON").fill(JSON.stringify(lifecycleProject()));
  await page.getByRole("button", { name: "Preview JSON", exact: true }).click();
  await page
    .getByRole("button", { name: "Open reviewed plan", exact: true })
    .click();
  await saved(page);
}
async function saved(page: Page) {
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
}
async function backup(page: Page): Promise<EventProject> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download backup" }).click(),
  ]);
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}
async function hide(page: Page) {
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
  );
}
async function show(page: Page) {
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
}

test("RR-3: a previous connection cannot save after the same owner reclaims", async ({
  page,
}) => {
  await page.goto("/#/projector?session=ea9aef42-522d-4df7-9c19-919747413a1e");
  const result = await page.evaluate(async (project) => {
    const modulePath = "/src/storage/index.ts";
    const { ProjectStorage } = await import(modulePath);
    const storage = new ProjectStorage();
    await storage.open();
    const initial = await storage.claim();
    await storage.save(project, initial.generation);
    const oldFence = storage.fence;
    await storage.release();
    await storage.open();
    const resumed = await storage.claim();
    const stale = { ...project, revision: 21, title: "STALE WRITE" };
    const staleAccepted = await storage
      .save(stale, resumed.generation, oldFence)
      .then(
        () => true,
        () => false,
      );
    const committed = await storage.read();
    await storage.release();
    return { staleAccepted, project: committed?.project };
  }, lifecycleProject());
  expect(result.staleAccepted).toBe(false);
  expect(result.project).toEqual(lifecycleProject());
});

test("RR-3: synthetic hide/show reopens storage, preserves edits and keeps one writer", async ({
  page,
  context,
}) => {
  await open(page);
  await page.getByText("Edit future group bounds").click();
  await page.getByLabel("East maximum").fill("3");
  await saved(page);
  const before = await backup(page);
  await hide(page);
  await page.waitForTimeout(1800);
  await show(page);
  await saved(page);
  expect(await backup(page)).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Cancel entire draft", exact: true }),
  ).toBeEnabled();
  const second = await context.newPage();
  await second.goto("/");
  await expect(
    second.getByText("Read-only conductor.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel entire draft", exact: true })
    .click();
  await saved(page);
  expect((await backup(page)).conductor.pendingDraft).toBeNull();
  await second.close();
});

test("RR-3: immediate hide/show fences queued writes and resumes the latest edit", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Select PUBLIC A (a)", { exact: true }).check();
  await page.evaluate(() => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Mark selected absent")!;
    button.click();
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await saved(page);
  const resumed = await backup(page);
  expect(resumed.conductor.pendingDraft?.availabilityChanges).toEqual([
    { participantId: "a", roundId: "round-1", available: false },
    { participantId: "a", roundId: "round-2", available: false },
  ]);
  await page
    .getByRole("button", { name: "Cancel entire draft", exact: true })
    .click();
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "ALPHA", exact: true }),
  ).toBeVisible();
  if (
    await page.getByRole("button", { name: "Recover saved event" }).isVisible()
  ) {
    await page.waitForTimeout(5500);
    await page.getByRole("button", { name: "Recover saved event" }).click();
  }
  await saved(page);
  expect((await backup(page)).conductor.pendingDraft).toBeNull();
});

test("RR-3: returning suspended conductor cannot take a lease from an active second tab", async ({
  page,
  context,
}) => {
  await open(page);
  await hide(page);
  await page.waitForTimeout(300);
  const second = await context.newPage();
  await second.goto("/");
  await saved(second);
  await second.getByText("Edit future group bounds").click();
  await second.getByLabel("East maximum").fill("3");
  await saved(second);
  const committed = await backup(second);
  await show(page);
  await expect(
    page.getByText("Read-only conductor.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recover saved event" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel entire draft", exact: true }),
  ).toBeDisabled();
  expect(await backup(second)).toEqual(committed);
  await second.close();
  await page.waitForTimeout(5500);
  await page.getByRole("button", { name: "Recover saved event" }).click();
  await saved(page);
  expect(await backup(page)).toEqual(committed);
  await page
    .getByRole("button", { name: "Cancel entire draft", exact: true })
    .click();
  await saved(page);
});

test("RR-3: storage claim reopens an idempotently released connection", async ({
  page,
}) => {
  await page.goto("/#/projector?session=ea9aef42-522d-4df7-9c19-919747413a1e");
  const result = await page.evaluate(async (project) => {
    const modulePath = "/src/storage/index.ts";
    const { ProjectStorage } = (await import(
      modulePath
    )) as typeof import("../../src/storage");
    const storage = new ProjectStorage();
    await Promise.all([storage.open(), storage.open()]);
    const initial = await storage.claim();
    await storage.save(project, initial.generation);
    await Promise.all([storage.release(), storage.release()]);
    const resumed = await storage.claim();
    await storage.release();
    return resumed;
  }, lifecycleProject());
  expect(result.owned).toBe(true);
  expect(result.project).toEqual(lifecycleProject());
});

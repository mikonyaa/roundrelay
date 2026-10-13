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

test("closed connection exposes an unsaved backup and recover reopens it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Withhold polling so the command itself must expose failure, before any retry timer.
    const interval = window.setInterval.bind(window);
    Object.defineProperty(window, "setInterval", {
      value(handler: TimerHandler, timeout?: number, ...args: unknown[]) {
        return Reflect.apply(interval, window, [
          timeout === 1500 ? () => {} : handler,
          timeout,
          ...args,
        ]);
      },
    });
    const original = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => {
      const request = original(...args);
      request.addEventListener("success", () => {
        (window as unknown as { rrDatabase: IDBDatabase }).rrDatabase =
          request.result;
      });
      return request;
    };
  });
  await open(page);
  await page.evaluate(() => {
    const db = (window as unknown as { rrDatabase: IDBDatabase }).rrDatabase;
    db.onversionchange?.call(
      db,
      new IDBVersionChangeEvent("versionchange", { oldVersion: 1 }),
    );
  });
  await page.getByText("Edit future group bounds").click();
  await page.getByLabel("East maximum").fill("3");
  await expect(page.getByText("Saved locally", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Recover saved event", exact: true }),
  ).toBeVisible();
  const unsaved = await backup(page);
  expect(unsaved.conductor.pendingDraft?.futureGroupChanges[0].maxSize).toBe(3);
  await page
    .getByRole("button", { name: "Recover saved event", exact: true })
    .click();
  await saved(page);
  expect((await backup(page)).conductor.pendingDraft).toBeNull();
  if (!(await page.getByLabel("East maximum").isVisible()))
    await page.getByText("Edit future group bounds").click();
  await page.getByLabel("East maximum").fill("2");
  await saved(page);
});

test("RR-3: an unsaved suspended draft survives a different writer until explicit recovery", async ({
  page,
  context,
}) => {
  await open(page);
  await page.getByLabel("Select PUBLIC A (a)", { exact: true }).check();
  await page.evaluate(() => {
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Mark selected absent")!
      .click();
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  });
  const local = await backup(page);
  const second = await context.newPage();
  await second.goto("/");
  await saved(second);
  await second.getByText("Edit future group bounds").click();
  await second.getByLabel("East maximum").fill("3");
  await saved(second);
  const foreign = await backup(second);
  await show(page);
  await expect(
    page.getByText("Read-only conductor.", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1800); // Include the read-only polling branch.
  expect(await backup(page)).toEqual(local);
  expect(local.conductor.pendingDraft?.availabilityChanges).toHaveLength(2);
  expect(foreign.conductor.pendingDraft?.futureGroupChanges[0].maxSize).toBe(3);
  await second.close();
  await page.waitForTimeout(5500);
  await page
    .getByRole("button", { name: "Recover saved event", exact: true })
    .click();
  await saved(page);
  expect(await backup(page)).toEqual(foreign);
});

test("RR-3: legacy IndexedDB records migrate additively and claim is idempotent", async ({
  page,
}) => {
  await page.goto("/#/projector?session=ea9aef42-522d-4df7-9c19-919747413a1e");
  const result = await page.evaluate(async (project) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("roundrelay-v1", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("workspace");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("workspace", "readwrite");
        tx.objectStore("workspace").put(
          { project, generation: 7, owner: "", expires: 0 },
          "current",
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
    const modulePath = "/src/storage/index.ts";
    const { ProjectStorage } = (await import(
      modulePath
    )) as typeof import("../../src/storage");
    const storage = new ProjectStorage();
    const first = await storage.claim();
    const again = await storage.claim();
    const written = await storage.save(
      { ...project, revision: 21 },
      again.generation,
    );
    await storage.release();
    return { first, again, written };
  }, lifecycleProject());
  expect(result.first.project).toEqual(lifecycleProject());
  expect(result.first.generation).toBe(7);
  expect(result.again.leaseEpoch).toBe(result.first.leaseEpoch);
  expect(result.written.generation).toBe(8);
});

test("RR-3: real history traversal retains committed edits and a single writer", async ({
  page,
  context,
}, testInfo) => {
  await page.addInitScript(() => {
    addEventListener("pageshow", (event) =>
      sessionStorage.setItem(
        "rr-history-persisted",
        String((event as PageTransitionEvent).persisted),
      ),
    );
  });
  await open(page);
  await page.getByText("Edit future group bounds").click();
  await page.getByLabel("East maximum").fill("3");
  await saved(page);
  const committed = await backup(page);
  // Different document, then the browser's real history operation. Default Playwright disables BFCache.
  await page.goto("about:blank");
  await page.goBack();
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
  expect(await backup(page)).toEqual(committed);
  const persisted = await page.evaluate(() =>
    sessionStorage.getItem("rr-history-persisted"),
  );
  await testInfo.attach("history-pageshow", {
    body: JSON.stringify({ realHistoryTraversal: true, persisted }),
    contentType: "application/json",
  });
  const second = await context.newPage();
  await second.goto("/");
  await expect(
    second.getByText("Read-only conductor.", { exact: true }),
  ).toBeVisible();
  await second.close();
});

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

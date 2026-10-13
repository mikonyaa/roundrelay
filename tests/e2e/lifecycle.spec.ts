import { test, expect, type Page } from "@playwright/test";
import { lifecycleProject } from "../fixtures/lifecycle";
import type { EventProject } from "../../src/model/schema";
import { readFile } from "node:fs/promises";
import { validateProject } from "../../src/validate";

async function importPlan(page: Page, project: EventProject, replace = false) {
  if (!replace) await page.goto("/");
  await page
    .getByRole("button", {
      name: replace ? "Import" : "Import your plan",
      exact: true,
    })
    .click();
  await page.getByLabel("Event JSON").fill(JSON.stringify(project));
  await page.getByRole("button", { name: "Preview JSON", exact: true }).click();
  await page
    .getByRole("button", {
      name: replace
        ? "Replace open event with reviewed plan"
        : "Open reviewed plan",
      exact: true,
    })
    .click();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
}

async function openProjector(page: Page) {
  const [projector] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Open projector" }).click(),
  ]);
  await expect(
    projector.getByRole("heading", { name: "ALPHA", exact: true }),
  ).toBeVisible();
  return projector;
}

test("a copied sessionStorage cursor does not join a different conductor tab's stream", async ({
  page,
  context,
}) => {
  await importPlan(page, lifecycleProject());
  const originalProjector = await openProjector(page);
  const oldSession = new URL(originalProjector.url()).hash.split("session=")[1];
  const copied = await page.evaluate(() =>
    sessionStorage.getItem("roundrelay-projection-v2"),
  );
  const second = await context.newPage();
  await second.addInitScript((cursor) => {
    if (cursor) sessionStorage.setItem("roundrelay-projection-v2", cursor);
  }, copied);
  await second.goto("/");
  await expect(
    second.getByText("Read-only conductor.", { exact: true }),
  ).toBeVisible();
  await page.close();
  await second.waitForTimeout(5500);
  await second
    .getByRole("button", { name: "Recover saved event", exact: true })
    .click();
  await expect(
    second.getByText("Saved locally", { exact: true }),
  ).toBeVisible();
  const newProjector = await openProjector(second);
  expect(new URL(newProjector.url()).hash.split("session=")[1]).not.toBe(
    oldSession,
  );
});

test("projector suspends its channel and requests a fresh snapshot on pageshow", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    const state = window as unknown as {
      rrChannels: Set<{ closed: boolean }>;
    };
    // WebKit can run popup init scripts in both the blank and target document.
    // Count native channel identities even if the instrumentation is wrapped twice.
    state.rrChannels = new Set();
    const Original = BroadcastChannel;
    window.BroadcastChannel = class extends Original {
      closed = false;
      constructor(name: string) {
        super(name);
        state.rrChannels.add(this);
      }
      close() {
        this.closed = true;
        super.close();
      }
    };
  });
  await importPlan(page, lifecycleProject());
  const projector = await openProjector(page);
  await projector.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
  );
  expect(
    await projector.evaluate(
      () =>
        [
          ...(window as unknown as { rrChannels: Set<{ closed: boolean }> })
            .rrChannels,
        ].filter((c) => !c.closed).length,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await projector.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await expect(projector.getByRole("status")).toContainText("plan version 21");
  expect(
    await projector.evaluate(
      () =>
        [
          ...(window as unknown as { rrChannels: Set<{ closed: boolean }> })
            .rrChannels,
        ].filter((c) => !c.closed).length,
    ),
  ).toBe(1);
});

for (const fault of ["group", "participant"] as const) {
  test(`RR-2: invalid ${fault} stays backed up and repair unlocks routes`, async ({
    page,
  }) => {
    const p = lifecycleProject();
    if (fault === "group") p.rounds[0].assignments[0].groupId = "unknown-group";
    else p.rounds[0].assignments[0].participantId = "unknown-person";
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await importPlan(page, p);
    await expect(
      page.getByRole("button", { name: "Print routes", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Export routes CSV", exact: true }),
    ).toBeDisabled();
    const [backup] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download backup" }).click(),
    ]);
    expect(JSON.parse(await readFile((await backup.path())!, "utf8"))).toEqual(
      p,
    );
    const [projector] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Open projector" }).click(),
    ]);
    await expect(projector.locator(".projector-header p")).toContainText(
      "Routes unavailable",
    );
    await expect(projector.locator(".projector-groups li")).toHaveCount(0);
    await page.getByText("Edit future group bounds").click();
    await page.getByLabel("East maximum").fill("3");
    await page
      .getByRole("button", { name: "Preview repair", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Apply future repair", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Apply future repair", exact: true })
      .click();
    await expect(
      page.getByText("Saved locally", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Export routes CSV", exact: true }),
    ).toBeEnabled();
    const [repairedBackup] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download backup" }).click(),
    ]);
    expect(
      validateProject(
        JSON.parse(await readFile((await repairedBackup.path())!, "utf8")),
      ),
    ).toEqual([]);
    const [csv] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Export routes CSV", exact: true })
        .click(),
    ]);
    const text = await readFile((await csv.path())!, "utf8");
    expect(text).not.toContain("PRIVATE_");
    expect(text).not.toContain("unknown-");
    await page
      .getByRole("button", { name: "Print routes", exact: true })
      .click();
    await expect(page.locator(".route")).toHaveCount(4);
    expect(await page.content()).not.toContain("Not attending");
    expect(errors).toEqual([]);
  });
}

test("RR-1: an existing projector follows ALPHA20 to BETA0", async ({
  page,
}) => {
  await importPlan(page, lifecycleProject());
  const projector = await openProjector(page);
  await importPlan(page, lifecycleProject("beta", 0, "BETA"), true);
  await expect(
    projector.getByRole("heading", { name: "BETA", exact: true }),
  ).toBeVisible();
  await expect(projector.getByRole("status")).toContainText("plan version 0");
  expect(await projector.content()).not.toContain("PRIVATE_LIFECYCLE_CANARY");
});

test("RR-1: an existing projector follows same-event restore ALPHA20 to ALPHA5", async ({
  page,
}) => {
  await importPlan(page, lifecycleProject());
  const projector = await openProjector(page);
  const restored = lifecycleProject("alpha", 5, "ALPHA restored");
  restored.participants[0].publicLabel = "PUBLIC RESTORED";
  await importPlan(page, restored, true);
  await expect(
    projector.getByRole("heading", { name: "ALPHA restored", exact: true }),
  ).toBeVisible();
  await expect(
    projector.getByText("PUBLIC RESTORED", { exact: true }),
  ).toBeVisible();
  await expect(projector.getByRole("status")).toContainText("plan version 5");
});

test("RR-1: replayed old packets cannot keep a disconnected projector Live", async ({
  page,
}) => {
  await importPlan(page, lifecycleProject());
  const projector = await openProjector(page);
  const sessionId = new URL(projector.url()).hash.split("session=")[1];
  // Observe the actual wire protocol, then replay a captured packet with an old business revision.
  await projector.evaluate(async (session) => {
    const state = window as unknown as {
      replay: BroadcastChannel;
      packet: Record<string, unknown>;
    };
    const channel = new BroadcastChannel("roundrelay-public-v2-" + session);
    state.replay = channel;
    state.packet = await new Promise<Record<string, unknown>>((resolve) => {
      channel.onmessage = (e) => {
        if (e.data?.type === "snapshot") resolve(e.data);
      };
      channel.postMessage({
        version: 2,
        type: "request-snapshot",
        sessionId: session,
      });
    });
    (state.packet.payload as Record<string, unknown>).revision = 19;
  }, sessionId);
  await page.close();
  await projector.evaluate(() => {
    const state = window as unknown as {
      replay: BroadcastChannel;
      packet: unknown;
    };
    setInterval(() => state.replay.postMessage(state.packet), 400);
  });
  await expect(projector.getByRole("status")).toContainText(
    "Disconnected / stale",
    { timeout: 12000 },
  );
});

test("RR-1: the same projector follows a conductor reload", async ({
  page,
}) => {
  await importPlan(page, lifecycleProject());
  const projector = await openProjector(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "ALPHA", exact: true }),
  ).toBeVisible();
  // A reload can leave the old lease until expiry; recovery is the existing explicit handoff.
  if (
    await page.getByRole("button", { name: "Recover saved event" }).isVisible()
  ) {
    await page.waitForTimeout(5500);
    await page.getByRole("button", { name: "Recover saved event" }).click();
  }
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await expect(projector.getByRole("status")).toContainText("plan version 21");
  await expect(projector.getByTestId("projector-timer")).not.toHaveText(
    "Ready",
  );
});

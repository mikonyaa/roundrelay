import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const saved = (page) =>
  page.getByText("Saved locally", { exact: true }).waitFor();
async function backup(page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download backup" }).click();
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}
async function importPlan(page, project, replacing = false) {
  await page
    .getByRole("button", {
      name: replacing ? "Import" : "Import your plan",
      exact: true,
    })
    .click();
  await page.getByLabel("Event JSON").fill(JSON.stringify(project));
  await page.getByRole("button", { name: "Preview JSON", exact: true }).click();
  await page
    .getByRole("button", {
      name: replacing
        ? "Replace open event with reviewed plan"
        : "Open reviewed plan",
      exact: true,
    })
    .click();
  await saved(page);
}
async function projectorFor(page, title) {
  const pending = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open projector" }).click();
  const projector = await pending;
  await projector.getByRole("heading", { name: title, exact: true }).waitFor();
  return projector;
}
async function packetFrom(page) {
  return page.evaluate(() =>
    [...window.rrSent].reverse().find((packet) => packet.type === "snapshot"),
  );
}
async function postPacket(projector, packet) {
  await projector.evaluate((packet) => {
    const channel = new BroadcastChannel(
      "roundrelay-public-v2-" + packet.sessionId,
    );
    channel.postMessage(packet);
    channel.close();
  }, packet);
}
// An independent consumer checks relations in downloaded data without importing app code.
function assertRoutes(project) {
  const participants = new Set(
    project.participants.map((p) => p.participantId),
  );
  assert.equal(participants.size, project.participants.length);
  for (const round of project.rounds) {
    const groups = new Map(round.groups.map((g) => [g.groupId, g]));
    const attending = new Map(
      project.availability
        .filter((a) => a.roundId === round.roundId)
        .map((a) => [a.participantId, a.available]),
    );
    const assigned = new Map();
    const sizes = new Map();
    for (const a of round.assignments) {
      assert.ok(participants.has(a.participantId));
      assert.equal(attending.get(a.participantId), true);
      assert.ok(groups.get(a.groupId)?.enabled);
      assert.ok(!assigned.has(a.participantId));
      assigned.set(a.participantId, a.groupId);
      sizes.set(a.groupId, (sizes.get(a.groupId) ?? 0) + 1);
    }
    for (const id of participants) {
      assert.ok(attending.has(id));
      assert.equal(assigned.has(id), attending.get(id));
    }
    for (const g of groups.values())
      if (g.enabled) {
        const size = sizes.get(g.groupId) ?? 0;
        assert.ok(size >= g.minSize && size <= g.maxSize);
      }
    for (const pair of project.constraints.mustSeparate) {
      const [a, b] = pair.participantIds;
      if (assigned.has(a) && assigned.has(b))
        assert.notEqual(assigned.get(a), assigned.get(b));
    }
  }
}

export async function lifecycleConsumer(browser, url, fixtureDirectory) {
  await mkdir("artifacts", { recursive: true });
  const fixture = async (name) =>
    JSON.parse(await readFile(path.join(fixtureDirectory, name), "utf8"));
  const checks = [];
  const errors = [];
  const externalRequests = [];
  const origin = new URL(url).origin;
  let historyPersisted;
  async function scenario(name, run) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
    context.on("request", (request) => {
      if (new URL(request.url()).origin !== origin)
        externalRequests.push(request.url());
    });
    await context.addInitScript(() => {
      window.rrSent = [];
      const Original = BroadcastChannel;
      window.BroadcastChannel = class extends Original {
        postMessage(packet) {
          window.rrSent.push(structuredClone(packet));
          super.postMessage(packet);
        }
      };
      const original = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args) => {
        if (location.hash.startsWith("#/projector"))
          throw new Error("Projector must not access private IndexedDB");
        return original(...args);
      };
      // The history control also visits about:blank, which has no sessionStorage origin.
      addEventListener("pageshow", (event) => {
        window.rrConsumerPageShow = event.persisted;
      });
    });
    const page = await context.newPage();
    try {
      await page.goto(url);
      await run(page, context);
      checks.push(name);
    } catch (error) {
      if (!page.isClosed())
        await page.screenshot({
          path: `artifacts/consumer-${name}-failure.png`,
          fullPage: true,
        });
      throw error;
    } finally {
      await context.close();
    }
  }

  await scenario("projection-replace-restore-stale", async (page) => {
    await importPlan(page, await fixture("lifecycle-alpha20.json"));
    const projector = await projectorFor(page, "ALPHA");
    const alpha = await packetFrom(page);
    assert.equal(alpha.version, 2);
    assert.ok(Number.isSafeInteger(alpha.sequence));
    await importPlan(page, await fixture("lifecycle-beta0.json"), true);
    await projector
      .getByRole("heading", { name: "BETA", exact: true })
      .waitFor();
    const beta = await packetFrom(page);
    assert.ok(beta.workspaceEpoch > alpha.workspaceEpoch);
    assert.ok(beta.sequence > alpha.sequence);
    assert.equal(beta.payload.revision, 0);
    await postPacket(projector, alpha);
    await postPacket(projector, { ...alpha, sequence: beta.sequence + 100 });
    await page.waitForTimeout(250);
    assert.equal(await projector.locator("h1").innerText(), "BETA");
    await importPlan(page, await fixture("lifecycle-alpha20.json"), true);
    await projector
      .getByRole("heading", { name: "ALPHA", exact: true })
      .waitFor();
    await importPlan(page, await fixture("lifecycle-alpha5.json"), true);
    await projector
      .getByRole("heading", { name: "ALPHA restored", exact: true })
      .waitFor();
    await projector.getByText("PUBLIC RESTORED", { exact: true }).waitFor();
    const restored = await packetFrom(page);
    assert.equal(restored.payload.revision, 5);
    await postPacket(projector, {
      ...restored,
      sequence: restored.sequence + 100,
      payload: {
        ...restored.payload,
        publicTitle: "MALFORMED",
        privateNote: "PRIVATE_REJECTED_INPUT",
      },
    });
    await page
      .getByRole("button", { name: "Start round 1", exact: true })
      .click();
    await saved(page);
    await projector
      .getByText("Live · plan version 6", { exact: true })
      .waitFor();
    assert.equal(await projector.locator("h1").innerText(), "ALPHA restored");
    await page.reload();
    await page.locator("h1").waitFor();
    if (
      await page
        .getByRole("button", { name: "Recover saved event", exact: true })
        .isVisible()
    ) {
      await page.waitForTimeout(5500);
      await page
        .getByRole("button", { name: "Recover saved event", exact: true })
        .click();
    }
    await saved(page);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await projector
      .getByText("Live · plan version 7", { exact: true })
      .waitFor();
    const sent = await page.evaluate(() => window.rrSent);
    assert.ok(!JSON.stringify(sent).includes("PRIVATE_"));
    assert.ok(!JSON.stringify(sent).includes("participantId"));
    assert.ok(!JSON.stringify(sent).includes("repairHistory"));
    for (const envelope of sent.filter((p) => p.type === "snapshot")) {
      assert.deepEqual(
        Object.keys(envelope).sort(),
        [
          "version",
          "type",
          "sessionId",
          "workspaceEpoch",
          "sequence",
          "payload",
        ].sort(),
      );
    }
    assert.ok(!(await projector.content()).includes("PRIVATE_"));
    const last = await packetFrom(page);
    await projector.screenshot({ path: "artifacts/consumer-projector.png" });
    await page.close();
    await projector.evaluate((packet) => {
      const replay = new BroadcastChannel(
        "roundrelay-public-v2-" + packet.sessionId,
      );
      setInterval(() => replay.postMessage(packet), 400);
    }, last);
    await projector
      .getByText("Disconnected / stale", { exact: false })
      .waitFor({ timeout: 12000 });
  });

  for (const fault of ["group", "participant"])
    await scenario(`invalid-${fault}-repair`, async (page) => {
      const input = await fixture(`lifecycle-invalid-${fault}.json`);
      await importPlan(page, input);
      assert.equal(
        await page
          .getByRole("button", { name: "Print routes", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Export routes CSV", exact: true })
          .isDisabled(),
        true,
      );
      assert.deepEqual(await backup(page), input);
      const projector = await projectorFor(page, "ALPHA");
      await projector
        .locator(".projector-header p")
        .filter({ hasText: "Routes unavailable" })
        .waitFor();
      assert.equal(await projector.locator(".projector-groups li").count(), 0);
      await page.getByText("Edit future group bounds").click();
      await page.getByLabel("East maximum").fill("3");
      await page
        .getByRole("button", { name: "Preview repair", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Your future repair", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Apply future repair", exact: true })
        .click();
      await saved(page);
      const repaired = await backup(page);
      assertRoutes(repaired);
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Export routes CSV", exact: true })
        .click();
      const csv = await readFile(await (await pending).path(), "utf8");
      assert.ok(!csv.includes("PRIVATE_") && !csv.includes("unknown-"));
      await page
        .getByRole("button", { name: "Print routes", exact: true })
        .click();
      assert.equal(await page.locator(".route").count(), 4);
      assert.ok(!(await page.content()).includes("Not attending"));
      assert.ok(!(await page.content()).includes("PRIVATE_"));
    });

  await scenario("storage-resume-history-ownership", async (page, context) => {
    await importPlan(page, await fixture("lifecycle-alpha20.json"));
    await page.getByText("Edit future group bounds").click();
    await page.getByLabel("East maximum").fill("3");
    await saved(page);
    const before = await backup(page);
    await page.evaluate(() =>
      dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
    );
    await page.waitForTimeout(1800);
    await page.evaluate(() =>
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
    );
    await saved(page);
    assert.deepEqual(await backup(page), before);
    await page.getByLabel("Select PUBLIC A (a)", { exact: true }).check();
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Mark selected absent")
        .click();
      dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await saved(page);
    const latest = await backup(page);
    assert.equal(latest.conductor.pendingDraft.availabilityChanges.length, 2);
    assert.equal(
      latest.conductor.pendingDraft.futureGroupChanges[0].maxSize,
      3,
    );
    const second = await context.newPage();
    await second.goto(url);
    await second.getByText("Read-only conductor.", { exact: true }).waitFor();
    await second
      .getByRole("button", { name: "Recover saved event", exact: true })
      .click();
    assert.equal(
      await second
        .getByRole("button", { name: "Cancel entire draft", exact: true })
        .isDisabled(),
      true,
    );
    await page.close();
    await second.waitForTimeout(5500);
    await second
      .getByRole("button", { name: "Recover saved event", exact: true })
      .click();
    await saved(second);
    assert.deepEqual(await backup(second), latest);
    await second.goto("about:blank");
    await second.goBack();
    await second.locator("h1").waitFor();
    if (
      await second
        .getByRole("button", { name: "Recover saved event", exact: true })
        .isVisible()
    ) {
      await second.waitForTimeout(5500);
      await second
        .getByRole("button", { name: "Recover saved event", exact: true })
        .click();
    }
    await saved(second);
    assert.deepEqual(await backup(second), latest);
    historyPersisted = await second.evaluate(() => window.rrConsumerPageShow);
  });

  await scenario("sixty-frozen-print-keyboard", async (page) => {
    await importPlan(page, await fixture("workshop-60.json"));
    await page
      .getByRole("button", { name: "Start round 1", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Finish round", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start round 2", exact: true })
      .click();
    await saved(page);
    const before = await backup(page);
    const protectedBefore = JSON.stringify(
      before.rounds.filter((r) => r.status !== "planned"),
    );
    const fingerprint = await page
      .locator("main")
      .getAttribute("data-protection");
    await page.getByLabel("Select Aster 1 (p01)", { exact: true }).check();
    await page.getByLabel("Select Birch 1 (p02)", { exact: true }).check();
    await page
      .getByRole("button", { name: "Mark selected absent", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Preview repair", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Your future repair", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Apply future repair", exact: true })
      .click();
    await saved(page);
    const after = await backup(page);
    assertRoutes(after);
    assert.equal(
      JSON.stringify(after.rounds.filter((r) => r.status !== "planned")),
      protectedBefore,
    );
    assert.equal(
      await page.locator("main").getAttribute("data-protection"),
      fingerprint,
    );
    for (const round of before.rounds.filter((r) => r.status !== "planned"))
      assert.equal(
        JSON.stringify(
          after.availability.filter((a) => a.roundId === round.roundId),
        ),
        JSON.stringify(
          before.availability.filter((a) => a.roundId === round.roundId),
        ),
      );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "artifacts/consumer-390.png",
      fullPage: true,
    });
    await page.locator(".brand").focus();
    await page.keyboard.press("Alt+s");
    await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
    await page.keyboard.press("Alt+s");
    await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Print routes", exact: true })
      .click();
    assert.equal(await page.locator(".route").count(), 60);
    assert.ok((await page.content()).includes("Not attending"));
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: "artifacts/consumer-routes-60.pdf",
      format: "A4",
      printBackground: true,
    });
  });

  await scenario("stalled-worker-cancellation", async (page) => {
    await page.evaluate(() => {
      window.rrTerminations = 0;
      const Original = Worker;
      window.Worker = class extends Original {
        postMessage() {
          /* Deliberately withhold this test worker's input to simulate a stall. */
        }
        terminate() {
          window.rrTerminations++;
          super.terminate();
        }
      };
    });
    await importPlan(page, await fixture("workshop-60.json"));
    await page
      .getByRole("button", { name: "Start round 1", exact: true })
      .click();
    await saved(page);
    await page.getByLabel("Select Aster 1 (p01)", { exact: true }).check();
    await page
      .getByRole("button", { name: "Mark selected absent", exact: true })
      .click();
    await saved(page);
    const before = await backup(page);
    await page
      .getByRole("button", { name: "Preview repair", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel calculation", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Cancel calculation", exact: true })
      .click();
    assert.equal(await page.evaluate(() => window.rrTerminations), 1);
    assert.equal(
      await page
        .getByRole("button", { name: "Pause", exact: true })
        .isEnabled(),
      true,
    );
    assert.deepEqual(await backup(page), before);
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  return {
    passed: true,
    checks,
    independentRouteAssertions: true,
    frozenRoundsComparedByteForByte: true,
    projectionProtocolVersion: 2,
    historyTraversal: {
      real: true,
      pageshowPersisted: historyPersisted,
      bfcacheClaimed: false,
    },
    syntheticPageTransitions: true,
    syntheticWorkerStall: true,
    noExternalRequests: true,
    pageErrors: errors,
  };
}

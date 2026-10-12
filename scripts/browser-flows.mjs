import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
export async function consumerRehearsal(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const saved = () =>
    page.getByText("Saved locally", { exact: true }).waitFor();
  const backup = async () => {
    await saved();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download backup" }).click();
    return JSON.parse(await readFile(await (await download).path(), "utf8"));
  };
  try {
    await page.goto(url);
    await page.getByRole("button", { name: "Try 24-person sample" }).click();
    await saved();
    await page
      .getByRole("button", { name: "Start round 1", exact: true })
      .click();
    await saved();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Open projector" }).click();
    const projector = await popup;
    await projector
      .getByRole("heading", { name: "Small circles, fresh perspectives" })
      .waitFor();
    await projector.reload();
    await projector
      .getByRole("heading", { name: "Small circles, fresh perspectives" })
      .waitFor();
    await page.getByRole("button", { name: "Finish round" }).click();
    const before = await backup();
    await page.getByLabel("Select Aster (p01)", { exact: true }).check();
    await page.getByLabel("Select Birch (p02)", { exact: true }).check();
    await page.getByRole("button", { name: "Mark selected absent" }).click();
    await page.getByRole("button", { name: "Preview repair" }).click();
    await page.getByRole("heading", { name: "Your future repair" }).waitFor();
    await page.getByRole("button", { name: "Apply future repair" }).click();
    const applied = await backup();
    assert.deepEqual(applied.rounds[0], before.rounds[0]);
    assert.equal(applied.rounds[1].assignments.length, 22);
    assert.equal(applied.repairHistory.at(-1).moved, 0);
    await page.getByRole("button", { name: "Undo last repair" }).click();
    const restored = await backup();
    assert.deepEqual(restored.rounds, before.rounds);
    assert.deepEqual(restored.availability, before.availability);
    await page.getByRole("button", { name: "Print routes" }).click();
    assert.equal(await page.locator(".route").count(), 24);
    assert.ok(
      (await page.locator(".print-title").innerText()).includes("Plan version"),
    );
    await page.getByRole("button", { name: "Back to conductor" }).click();
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await page.getByLabel("Event JSON").fill(JSON.stringify(applied));
    await page.getByRole("button", { name: "Preview JSON" }).click();
    await page
      .getByRole("button", { name: "Replace open event with reviewed plan" })
      .click();
    const reimported = await backup();
    assert.deepEqual(reimported, applied);
    await page
      .getByRole("button", { name: "Start round 2", exact: true })
      .click();
    await projector
      .getByText("Round 2 / 4 · New perspectives", { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    return {
      passed: true,
      flow: "round1/projector/finish/two-departures/preview/apply/frozen/undo/print/backup/reimport/round2",
      url,
    };
  } finally {
    await context.close();
  }
}

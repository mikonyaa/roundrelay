import { test, expect } from "@playwright/test";
test("paused time remains fixed across a real reload and wait, then resume uses a new deadline", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try 24-person sample" }).click();
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const paused = await page.getByTestId("timer").innerText();
  await page.reload();
  await page.waitForTimeout(5500);
  if (
    await page.getByRole("button", { name: "Recover saved event" }).isVisible()
  )
    await page.getByRole("button", { name: "Recover saved event" }).click();
  await expect(page.getByTestId("timer")).toHaveText(paused);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForTimeout(1300);
  expect(await page.getByTestId("timer").innerText()).not.toEqual(paused);
});
test("worker is really terminated on a new draft, and its old result cannot resurface", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try 24-person sample" }).click();
  await page
    .getByRole("button", { name: "Start round 1", exact: true })
    .click();
  await page.getByText("Edit future group bounds").click();
  await page.getByLabel("Field enabled").uncheck();
  for (const group of ["Studio", "Garden", "Library"])
    await page.getByLabel(group + " maximum").fill("8");
  await page.getByText("Bounded search settings", { exact: true }).click();
  await page.getByLabel("Iteration budget").fill("200000");
  await page.getByRole("button", { name: "Preview repair" }).click();
  await expect(
    page.getByText("Searching in a separate worker", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Select Aster (p01)", { exact: true }).check();
  await page.getByRole("button", { name: "Mark selected absent" }).click();
  await page.waitForTimeout(2100);
  await expect(
    page.getByRole("heading", { name: "Your future repair" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Draft: absent", { exact: true })).toBeVisible();
});

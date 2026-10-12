import { test, expect } from "@playwright/test";
test("a buggy worker candidate is independently rejected before Apply becomes enabled", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        let injecting = false;
        this.addEventListener("message", (event) => {
          if (injecting || event.data?.proposal?.status !== "feasible") return;
          event.stopImmediatePropagation();
          const data = structuredClone(event.data);
          data.proposal.candidate.rounds[0].assignments.push(
            data.proposal.candidate.rounds[0].assignments[0],
          );
          injecting = true;
          this.dispatchEvent(new MessageEvent("message", { data }));
          injecting = false;
        });
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try 24-person sample" }).click();
  await page.getByLabel("Select Aster (p01)", { exact: true }).check();
  await page.getByRole("button", { name: "Mark selected absent" }).click();
  await page.getByRole("button", { name: "Preview repair" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Independent validation rejected candidate",
  );
  await expect(
    page.getByRole("button", { name: "Apply future repair" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Pending future draft", { exact: true }),
  ).toBeVisible();
});

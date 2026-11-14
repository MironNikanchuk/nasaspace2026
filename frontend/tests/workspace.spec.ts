import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PRESETS } from "../lib/presets";
import snapshot from "../data/demo.json";

test("proxy returns FastAPI results matching the bundled preset and supports other dates", async ({ request }) => {
  const preset = PRESETS.find(({ id }) => id === "terrain-impact")!;
  const answer = await request.post("/api/lunar/compare", { data: { scenarios: preset.scenarios } });
  expect(answer.ok()).toBeTruthy();
  const live = await answer.json();
  expect(live.demo_only).toBeUndefined();
  expect(live.scenarios).toEqual([snapshot.results["connecting-ridge:geometric"], snapshot.results["connecting-ridge:terrain"]]);

  const scenarios = preset.scenarios.map((scenario) => ({
    ...scenario, start_utc: "2027-02-04T02:00:00Z", end_utc: "2027-02-04T02:30:00Z",
  }));
  const later = await request.post("/api/lunar/compare", { data: { scenarios } });
  expect(later.ok()).toBeTruthy();
  const result = await later.json();
  expect(result.scenarios[1].windows.sun[0].start_utc).toMatch(/^2027-02-04T02:14:58/);
});

test("demo results are marked in the UI, exported CSV and printable report", async ({ page, request }) => {
  const offline = "http://127.0.0.1:3182";
  // Keep the catalog live while comparison requests have no upstream.
  await page.route("**/api/lunar/sites", async (route) => {
    await route.fulfill({ response: await request.get("/api/lunar/sites") });
  });
  await page.goto(`${offline}/workspace?preset=terrain-impact`);
  const source = page.getByText(/Bundled demo data · January/);
  await expect(source).toBeVisible();
  await page.getByText("Export", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await pending;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.split("\n")[0]).toContain('"data_source"');
  expect(csv.split("\n")[1]).toContain('"Bundled demo data"');
  await page.emulateMedia({ media: "print" });
  await expect(source).toBeVisible();
  const preset = PRESETS[0];
  const dates = { start_utc: "2027-02-04T02:00:00Z", end_utc: "2027-02-04T02:30:00Z" };
  const result = await request.post(`${offline}/api/lunar/compare`, {
    data: { scenarios: preset.scenarios.map((scenario) => ({ ...scenario, ...dates })) },
  });
  expect(result.status()).toBe(503);
});

test("guest can save and delete a scenario", async ({ page }) => {
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Scenario title").fill("Guest integration test");
  await page.getByRole("button", { name: "Save scenario" }).click();
  await expect(page.getByText("Saved on this device.")).toBeVisible();
  await page.getByRole("link", { name: "Saved", exact: true }).click();
  await page.getByRole("button", { name: "Delete Guest integration test" }).click();
  await expect(page.getByText("Guest integration test")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Guest integration test")).toHaveCount(0);
});

test("the three-body view follows the scenario switch and shared time controls", async ({ page }) => {
  await page.goto("/workspace?preset=site-tradeoff");
  const overview = page.getByRole("figure", { name: "Sun and Earth from the Moon" });
  await expect(overview.getByText("Moon", { exact: true })).toBeVisible();
  await expect(overview.getByText("Connecting Ridge", { exact: true })).toBeVisible();
  await expect(overview.getByText(/-5.35° · Hidden/)).toBeVisible();
  await overview.getByRole("button", { name: "Scenario B" }).click();
  await expect(overview.getByText("Malapert Massif", { exact: true })).toBeVisible();
  const time = page.getByRole("slider", { name: "Time (UTC)" });
  await time.press("End");
  await expect(overview.getByText(/\+8.1° · Visible/)).toBeVisible();
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect.poll(async () => Number(await time.inputValue())).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

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

test("offline Q1 results are marked in the UI, exported CSV and printable report", async ({ page, request }) => {
  const offline = "http://127.0.0.1:3182";
  // Keep the catalog live while comparison requests have no upstream.
  await page.route("**/api/lunar/sites", async (route) => {
    await route.fulfill({ response: await request.get("/api/lunar/sites") });
  });
  await page.goto(`${offline}/workspace?preset=terrain-impact`);
  const source = page.getByText("Offline results · Bundled JPL Horizons data");
  await expect(source).toBeVisible();
  await page.getByText("Export", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await pending;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.split("\n")[0]).toContain('"data_source"');
  expect(csv.split("\n")[1]).toContain('"Bundled ephemerides"');
  await page.emulateMedia({ media: "print" });
  await expect(source).toBeVisible();
  const preset = PRESETS[0];
  const dates = { start_utc: "2027-02-04T02:00:00Z", end_utc: "2027-02-04T02:30:00Z" };
  const result = await request.post(`${offline}/api/lunar/compare`, {
    data: { scenarios: preset.scenarios.map((scenario) => ({ ...scenario, ...dates })) },
  });
  expect(result.status()).toBe(503);
  await page.emulateMedia({ media: "screen" });
  await page.getByLabel("Start (UTC)").fill("2027-02-04T02:00:00Z");
  await page.getByRole("button", { name: "24 h" }).click();
  await expect(page.getByLabel("End (UTC)")).toHaveValue("2027-02-05T02:00:00Z");
  await page.getByLabel("Visible when").selectOption("disk_any");
  await page.getByRole("button", { name: "Run comparison" }).click();
  await expect(page.getByText("Any part of the disk · Airless sky · 30 min samples", { exact: false })).toHaveCount(2);
  await expect(page.getByRole("figure", { name: "Sun and Earth from the Moon" })).toBeVisible();
});

test("workspace is public with browser-only saves and no account page", async ({ page, request }) => {
  expect((await request.get("/account")).status()).toBe(404);
  await page.goto("/workspace");
  await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);
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
  await expect(overview.getByRole("button", { name: "3D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(overview.getByText("Moon", { exact: true })).toBeVisible();
  await expect(overview.getByText("Connecting Ridge", { exact: true })).toBeVisible();
  await expect(overview.getByText(/−5.35° · Hidden/)).toBeVisible();
  await overview.getByRole("button", { name: "Scenario B" }).click();
  await expect(overview.getByText("Malapert Massif", { exact: true })).toBeVisible();
  const time = page.getByRole("slider", { name: "Time (UTC)" });
  await time.press("End");
  await expect(overview.getByText(/\+8.10° · Visible/)).toBeVisible();
  await overview.getByRole("button", { name: "2D" }).click();
  await expect(overview.getByText(/\+8.10° · Visible/)).toBeVisible();
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect.poll(async () => Number(await time.inputValue())).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("language selection persists across the landing page, atlas and sources", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Workspace", exact: true })).toHaveAttribute("href", "/workspace");
  await expect(page.getByText("Nikanchuk Miron", { exact: true })).toBeVisible();
  const language = page.getByRole("button", { name: "Language" });
  await language.press("ArrowDown");
  await expect(page.getByRole("button", { name: "English" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(language).toBeFocused();
  await expect(language).toHaveAttribute("aria-expanded", "false");
  await language.click();
  await page.getByRole("button", { name: "Русский" }).click();
  await expect(page.getByRole("link", { name: "К расчётам", exact: true })).toHaveAttribute("href", "/workspace");
  const terrain = page.getByRole("figure", { name: "Видимость Земли на Connecting Ridge" });
  await expect(terrain.getByRole("button", { name: "3D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await terrain.getByRole("button", { name: "2D", exact: true }).click();
  await expect(terrain.locator("svg image")).toHaveCount(3);
  await page.getByRole("link", { name: "Лунный атлас", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Лунный атлас", exact: true })).toBeVisible();
  const atlas = page.getByRole("figure", { name: "Интерактивная карта мест посадки" });
  await expect(atlas.getByText("Южный полюс", { exact: true })).toBeVisible();
  await expect(atlas.getByRole("button", { name: "3D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Язык" }).click();
  await page.getByRole("button", { name: "O‘zbekcha" }).click();
  await expect(page.getByRole("heading", { name: "Oy atlasi", exact: true })).toBeVisible();
  await page.goto("/sources");
  await expect(page.getByRole("heading", { name: "Manbalar", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "uz");
  await expect(page.getByRole("link", { name: /GitHub repozitoriysi/ })).toHaveAttribute("href", /github\.com/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("window search ranks three windows and opens a matching comparison", async ({ page }) => {
  await page.goto("/workspace");
  const search = page.getByRole("region", { name: "Find a 6.5-day window" });
  await search.getByRole("button", { name: "Search catalog" }).click();
  await expect(search.getByRole("link", { name: "Compare this window" })).toHaveCount(3);
  await expect(search.getByRole("table").getByRole("row")).toHaveCount(15);
  const href = await search.getByRole("link", { name: "Compare this window" }).first().getAttribute("href");
  const pair = JSON.parse(new URL(href!, "http://test.local").searchParams.get("scenario")!);
  expect(Date.parse(pair[0].end_utc) - Date.parse(pair[0].start_utc)).toBe(6.5 * 86_400_000);
  await search.getByRole("link", { name: "Compare this window" }).first().click();
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
});

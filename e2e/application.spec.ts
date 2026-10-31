import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const track = (i: number) => ({ id: String(i).padStart(22, "0"), uri: `spotify:track:${String(i).padStart(22, "0")}`, name: `Track ${i}`, artists: ["Fixture Artist"], album: "Fixture Album", image: null, albumImage: null, explicit: false, preview_url: null });
const connected = { connected: true, hasRequiredPlaylistScopes: true, grantedScopes: ["playlist-read-private", "playlist-modify-private", "playlist-modify-public"], account: { id: "fixture-user", displayName: "Fixture Listener" } };
async function mockCatalog(page: Page) {
  const counts = { status: 0, generate: 0, save: 0 };
  await page.route("**/api/spotify/status", (route) => { counts.status++; return route.fulfill({ json: connected }); });
  await page.route(/\/api\/(vibe\/)?generate$/, (route) => { counts.generate++; return route.fulfill({ json: { tracks: [track(1), track(2)], warning: "Found 2 matching tracks. Try broader preferences for a longer playlist.", metadata: { strategy: "catalog_search" } } }); });
  return counts;
}

for (const isPublic of [false, true]) {
  test(`basic review and ${isPublic ? "public" : "private"} save persist without resubmission (mocked)`, async ({ page }) => {
    const counts = await mockCatalog(page);
    await page.route("**/api/vibe/save", async (route) => {
      counts.save++;
      const body = route.request().postDataJSON();
      expect(body.isPublic).toBe(isPublic);
      expect(body.name).toBe("Reviewed fixture mix");
      expect(body.trackUris).toEqual([track(1).uri, track(2).uri]);
      await route.fulfill({ json: { playlistName: body.name, playlistId: "p".repeat(22), playlistUrl: `https://open.spotify.com/playlist/${"p".repeat(22)}`, isPublic, tracksAddedCount: 2 } });
    });
    await page.goto("/generate");
    await page.getByRole("button", { name: "Chill", exact: true }).click();
    await page.getByRole("button", { name: "Generate Playlist", exact: true }).click();
    await expect(page.getByRole("link", { name: "Track 1 — open in Spotify", exact: true })).toBeVisible();
    await expect(page.getByText(/Found 2 matching tracks/)).toBeVisible();
    await page.getByRole("button", { name: "Save to Spotify", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Playlist name", { exact: true }).fill("Reviewed fixture mix");
    if (isPublic) await dialog.getByRole("radio", { name: "Public", exact: true }).check();
    await dialog.getByRole("button", { name: "Save Playlist", exact: true }).click();
    await expect(page.getByRole("link", { name: "Open in Spotify", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: "Open in Spotify", exact: true })).toBeVisible();
    await page.waitForTimeout(250);
    expect(counts).toEqual({ status: 2, generate: 1, save: 1 });
  });
}

test("advanced regeneration, locks, history, and no background request loop (mocked)", async ({ page }) => {
  const counts = await mockCatalog(page);
  await page.goto("/vibe/results?vibes=Chill&trackCount=20&explicit=false");
  await expect(page.getByRole("link", { name: "Track 1 — open in Spotify", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lock Track 1", exact: true }).click();
  await page.getByRole("button", { name: "Shuffle Order" }).click();
  expect(counts.generate).toBe(1);
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate", exact: true })).toBeEnabled();
  await page.waitForTimeout(300);
  expect(counts.generate).toBe(2);
  expect(counts.status).toBe(1);
  await page.getByRole("button", { name: "Save to Spotify", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Save to Spotify", exact: true })).toBeFocused();
  await page.goto("/vibe/history");
  await expect(page.getByText("Track 1", { exact: false }).first()).toBeVisible();
});

test("uncertain save stays blocked after reload (mocked)", async ({ page }) => {
  const counts = await mockCatalog(page);
  await page.route("**/api/vibe/save", (route) => { counts.save++; return route.abort("failed"); });
  await page.goto("/generate?vibe=chill");
  await page.getByRole("button", { name: "Generate Playlist", exact: true }).click();
  await page.getByRole("button", { name: "Save to Spotify", exact: true }).click();
  await page.getByRole("button", { name: "Save Playlist", exact: true }).click();
  await expect(page.getByText(/We could not confirm whether Spotify created/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByText(/We could not confirm whether Spotify created/).first()).toBeVisible();
  expect(counts.save).toBe(1);
});

test("connection cooldown and disconnected state (mocked)", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/spotify/status", (route) => { calls++; return route.fulfill({ status: 429, headers: { "Retry-After": "45" }, json: { error: "Spotify is busy", retryAfterSeconds: 45 } }); });
  await page.goto("/generate");
  await page.getByRole("button", { name: "Retry connection", exact: true }).click();
  await expect(page.getByText(/Spotify asked us to wait/)).toBeVisible();
  expect(calls).toBe(1);
  await page.unroute("**/api/spotify/status");
  await page.route("**/api/spotify/status", (route) => route.fulfill({ json: { connected: false, grantedScopes: [], hasRequiredPlaylistScopes: false } }));
  await page.reload();
  await expect(page.getByRole("link", { name: "Connect Spotify", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Playlist", exact: true })).toBeDisabled();
});

test("actual server origin guard accepts loopback and rejects localhost/external origins", async ({ request }) => {
  const data = { name: "No authenticated write", trackUris: [track(1).uri] };
  for (const [origin, status] of [["http://127.0.0.1:5001", 401], ["http://localhost:5001", 403], ["https://external.invalid", 403]] as const) {
    const result = await request.post("/api/vibe/save", { data, headers: { origin, "X-Forwarded-Host": "external.invalid", "X-Forwarded-Proto": "https" } });
    expect(result.status()).toBe(status);
    expect((await result.json()).code).toBe(status === 401 ? "not_authenticated" : "invalid_origin");
  }
});

test("responsive layouts, modal keyboard focus, reduced motion, and accessibility (mocked)", async ({ page }, testInfo) => {
  await mockCatalog(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 664 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }, { width: 720, height: 450 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/generate", "/vibe", "/vibe/history"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width === 390) {
        expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      }
    }
  }
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/generate?vibe=chill");
  await page.getByRole("button", { name: "Generate Playlist", exact: true }).click();
  await page.getByRole("button", { name: "Save to Spotify", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("mobile-save-dialog.png") });
  await expect(page.getByRole("dialog").getByLabel("Playlist name", { exact: true })).toBeFocused();
  for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("dialog").getByRole("button", { name: "Save Playlist", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Save Playlist", exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Save to Spotify", exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("mobile-results.png"), fullPage: true });
  // CSS zoom exercises magnification; browser chrome zoom still needs manual review.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("production landing lab measurements", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const metrics = { lcp: null as number | null, cls: 0 };
    Object.assign(window, { labMetrics: metrics });
    if (PerformanceObserver.supportedEntryTypes.includes("largest-contentful-paint"))
      new PerformanceObserver((list) => { metrics.lcp = list.getEntries().at(-1)?.startTime ?? null; }).observe({ type: "largest-contentful-paint", buffered: true });
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift"))
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) metrics.cls += shift.value;
      } }).observe({ type: "layout-shift", buffered: true });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(500);
  const measured = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const scripts = performance.getEntriesByType("resource").filter((entry) => (entry as PerformanceResourceTiming).initiatorType === "script") as PerformanceResourceTiming[];
    return { source: "local production build, unthrottled mobile viewport; not field CWV", ...((window as unknown as { labMetrics: object }).labMetrics),
      domContentLoadedMs: navigation.domContentLoadedEventEnd, loadMs: navigation.loadEventEnd,
      scripts: scripts.length, scriptEncodedBytes: scripts.reduce((sum, item) => sum + item.encodedBodySize, 0),
      scriptDecodedBytes: scripts.reduce((sum, item) => sum + item.decodedBodySize, 0),
      inp: "Not measured; requires representative user interactions" };
  });
  console.log("PERFORMANCE_LAB " + JSON.stringify(measured));
  await testInfo.attach("production-lab.json", { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
  // Capture the real, unauthenticated landing UI for reviewed portfolio assets.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("landing-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("landing-desktop.png") });
});

test("generation timeout releases loading state without retrying (mocked)", async ({ page }) => {
  await mockCatalog(page);
  await page.goto("/generate?vibe=chill");
  await page.evaluate(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = (ms) => timeout(ms === 90_000 ? 50 : ms);
    const originalFetch = window.fetch.bind(window);
    let calls = 0;
    Object.assign(window, { readGenerationCalls: () => calls });
    // Model a fetch which rejects on cancellation. Holding a protocol-routed
    // request indefinitely delays abort delivery in Playwright WebKit; native
    // WebKit fetch cancellation was separately verified with a local server.
    window.fetch = (resource, init) => {
      if (resource !== "/api/generate") return originalFetch(resource, init);
      calls++;
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    };
  });
  await page.getByRole("button", { name: "Generate Playlist", exact: true }).click();
  await expect(page.getByRole("button", { name: "Try generating again", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { readGenerationCalls: () => number }).readGenerationCalls())).toBe(1);
});

test("partial save keeps its receipt and resumes the same draft (mocked)", async ({ page }) => {
  await mockCatalog(page);
  let savedPayload: Record<string, unknown> | null = null;
  let calls = 0;
  const id = "p".repeat(22);
  await page.route("**/api/vibe/save", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    if (calls === 1) {
      savedPayload = body;
      return route.fulfill({ status: 503, json: { error: "Your playlist exists in Spotify. Please finish saving.", retrySafe: false,
        recovery: { playlistId: id, playlistUrl: `https://open.spotify.com/playlist/${id}`, recoveryToken: "fixture-receipt" } } });
    }
    expect(body).toEqual({ ...savedPayload, recoveryToken: "fixture-receipt" });
    return route.fulfill({ json: { playlistId: id, playlistName: body.name, playlistUrl: `https://open.spotify.com/playlist/${id}`, tracksAddedCount: 2, isPublic: false } });
  });
  await page.goto("/generate?vibe=chill");
  await page.getByRole("button", { name: "Generate Playlist", exact: true }).click();
  await page.getByRole("button", { name: "Save to Spotify", exact: true }).click();
  await page.getByRole("button", { name: "Save Playlist", exact: true }).click();
  await expect(page.getByText(/Your playlist exists in Spotify/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Finish saving to Spotify", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Playlist name", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save Playlist", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open in Spotify", exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

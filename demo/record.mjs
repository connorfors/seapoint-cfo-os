// Records the two-minute Headroom demo against the running app.
// Usage: PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node demo/record.mjs
// Env: HEADROOM_URL (default the public link), DEMO_EMAIL (an @mycloop.com address).
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");

const base = process.env.HEADROOM_URL ?? "https://headroom.cb-63a.workers.dev";
const demoEmail = process.env.DEMO_EMAIL ?? "connor@mycloop.com";
const size = { width: 1440, height: 900 };
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: size,
  deviceScaleFactor: 1,
  recordVideo: { dir: process.env.VIDEO_DIR ?? "demo/out", size },
});
// A visible cursor, so viewers can follow each click.
await context.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
      "background:rgba(36,86,60,.35);border:2px solid #24563c;pointer-events:none;left:-40px;top:-40px;transition:transform .12s";
    document.body.appendChild(dot);
    addEventListener("mousemove", (e) => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; });
    addEventListener("mousedown", () => (dot.style.transform = "scale(.7)"));
    addEventListener("mouseup", () => (dot.style.transform = "scale(1)"));
  });
});
const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);
let x = 720, y = 450;
async function go(locator, { click = true, pause = 450 } = {}) {
  await locator.waitFor({ state: "visible", timeout: 45000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const tx = box.x + box.width / 2, ty = box.y + box.height / 2;
  await page.mouse.move(tx, ty, { steps: 28 });
  x = tx; y = ty;
  await wait(pause);
  if (click) await page.mouse.click(tx, ty);
}
async function smoothScrollTo(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await wait(1400);
}

// 0. One screen that says what Headroom does.
await page.goto(`${base}/welcome.html`, { waitUntil: "networkidle" });
await wait(6500);
await go(page.getByRole("link", { name: /See your next moves/ }), { pause: 700 });

// 1. Business context pulls itself in from Notion, Slack, Deel and the markets.
await page.getByRole("button", { name: /Import from Notion and Slack/ }).waitFor({ timeout: 45000 });
await wait(2500);
await go(page.getByRole("button", { name: /Import from Notion and Slack/ }));
await page.getByText("Filled in from 6 sources").waitFor({ timeout: 20000 });
await wait(2000);
await smoothScrollTo(page.locator("legend", { hasText: "Anyone joining soon?" }));
await wait(2500);
await smoothScrollTo(page.locator("legend", { hasText: "Customer payment terms" }));
await wait(1500);
await go(page.locator("form button[type=submit]"));

// 2. Headroom reads the live Seapoint data.
await page.getByText("Finished. Found").waitFor({ timeout: 45000 });
await wait(3000);
await go(page.getByRole("button", { name: "Next", exact: true }));

// 3. Alerts on: a real email goes out.
const email = page.locator("input[type=email]");
await email.waitFor({ timeout: 15000 });
await wait(1500);
await go(email);
await email.fill("");
await page.keyboard.type(demoEmail, { delay: 45 });
await wait(500);
await go(page.getByRole("button", { name: /Turn on alerts/ }));
await page.getByText(/Alert sent to/).waitFor({ timeout: 45000 });
await wait(3000);

// 4. The alert email arrives.
await page.goto(`${base}/api/alerts/last`, { waitUntil: "load" });
await wait(4500);

// 5. From the email straight into the payroll card.
await go(page.locator('a[href$="?move=payroll"]'));
await page.getByRole("button", { name: /Transfer £[\d,.]+ now/ }).waitFor({ timeout: 45000 });
await wait(2500);
await page.locator(".dialog-why").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
await wait(4500);
await go(page.getByRole("button", { name: /Transfer £[\d,.]+ now/ }), { pause: 900 });
await page.getByText("Receipt emailed to").waitFor({ timeout: 30000 });
await wait(4500);

// 6. External context: the FX card reads the markets feed.
await go(page.getByRole("button", { name: "Back to my moves" }));
await wait(1200);
const fx = page.locator("article", { hasText: "Potential FX loss" });
await smoothScrollTo(fx);
await wait(1200);
await go(fx.getByRole("button", { name: /Take action now|View what you did/ }));
await page.locator(".room-dialog").waitFor({ timeout: 15000 });
await wait(5000);
await go(page.getByRole("button", { name: /Get HSBC demo quote/ }), { pause: 700 });
await page.getByText(/Quote expires in/).waitFor({ timeout: 30000 });
await page.locator(".fx-quote").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
await wait(5000);
await go(page.getByRole("button", { name: /Lock demo rate with HSBC/ }), { pause: 700 });
await page.getByText("Demo forward confirmed").waitFor({ timeout: 30000 });
await wait(4000);
await go(page.getByRole("button", { name: /Done — see completed steps/ }));
await page.getByText("Well done.").waitFor({ timeout: 30000 });
await wait(5000);

// 7. The receipt email closes the loop.
await page.goto(`${base}/api/alerts/last?kind=resolved`, { waitUntil: "load" });
await wait(5000);

const video = page.video();
await context.close();
await browser.close();
console.log(await video.path());

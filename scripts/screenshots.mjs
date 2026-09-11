// Drives the running app in a mobile viewport and saves screenshots to .logs/shots.
// Usage: node scripts/screenshots.mjs [baseUrl]
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.argv[2] ?? "http://127.0.0.1:4340";
const out = ".logs/shots";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

const shot = (name, fullPage = false) => page.screenshot({ path: `${out}/${name}.png`, fullPage });

await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByText("Where do you want to go?").waitFor();
await shot("01-home");

await page.getByRole("button", { name: "Tokyo sometime soon" }).tap();
await page.getByRole("button", { name: "Analyze Trips" }).tap();
await page.waitForTimeout(1200);
await shot("02-progress");

await page.getByText("What should I do?").waitFor({ timeout: 240_000 });
await page.waitForTimeout(700);
await shot("03-tokyo-top");
await shot("04-tokyo-full", true);

await page.getByRole("button", { name: /See flight/ }).first().tap();
await page.waitForTimeout(500);
await shot("05-sheet");
await page.getByRole("button", { name: "Close" }).last().tap();

await page.getByRole("button", { name: "What I understood" }).tap().catch(async () => {
  await page.getByText("What I understood").first().tap();
});
await page.waitForTimeout(300);
await page.getByText("What I understood").first().scrollIntoViewIfNeeded();
await shot("06-understood");

await page.getByRole("button", { name: "New search" }).tap();
await page.getByRole("button", { name: "Surprise me" }).tap();
await page.getByRole("button", { name: "Analyze Trips" }).tap();
await page.getByText("What should I do?").waitFor({ timeout: 240_000 });
await page.waitForTimeout(700);
await shot("07-surprise-top");
await shot("08-surprise-full", true);

await page.getByPlaceholder(/Change anything/).fill("Okay but only international");
await page.getByRole("button", { name: "Send" }).tap();
await page.waitForTimeout(900);
await shot("09-followup-progress");
await page.getByText("What should I do?").waitFor({ timeout: 240_000 });
await page.waitForTimeout(700);
await shot("10-followup-full", true);

await page.getByText("What I understood").first().tap();
await page.getByRole("button", { name: "Edit" }).tap();
await page.waitForTimeout(300);
await page.getByText("What I understood").first().scrollIntoViewIfNeeded();
await shot("11-edit-form");
await page.getByRole("button", { name: "What about Europe?" }).tap();
await page.getByText("What should I do?").waitFor({ timeout: 240_000 });
await page.waitForTimeout(700);
await shot("12-europe-top");
await page.getByText("Where you could go").scrollIntoViewIfNeeded();
await shot("13-europe-rails");

console.log("done:", page.url());
await browser.close();

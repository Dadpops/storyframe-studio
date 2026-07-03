/**
 * screenshots.mjs — capture the §11 product frames.
 *
 * Screenshots of a stateful app are a capture SCRIPT, not a single grab. This
 * seeds one populated demo world ("The Ashfall Chronicles"), drives the real UI
 * to each state via the window.__SF API, and captures at 1440x900 @2x. Full-res
 * PNGs land in assets/screenshots/; 16:10 compressed WebP copies (<=300KB) for a
 * portfolio site land in assets/portfolio/.
 *
 * Run: `npm run screenshots` (builds dist first via the prescreenshots hook).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distPath = resolve(root, "dist/storyframe-studio.html");
const fullDir = resolve(root, "assets/screenshots");
const portfolioDir = resolve(root, "assets/portfolio");

const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;
const PORTFOLIO_MAX_BYTES = 300 * 1024;

// Each frame: a name + a snippet run in the page to reach the target state.
// All navigation goes through the same __SF API the UI buttons use.
const FRAMES = [
  {
    name: "01-worlds",
    setup: () => {
      window.__SF.reset();
      window.__SF.seedDemo();
      window.__SF.go({ screen: "worlds" });
    },
  },
  {
    name: "02-dashboard",
    setup: () => {
      const w = window.__SF.store.projects[0];
      window.__SF.go({ screen: "dashboard", worldId: w.id });
    },
  },
  {
    name: "03-wizard-lesson",
    setup: () => {
      const w = window.__SF.activeWorld();
      const k = w.entities.find((e) => e.type === "character");
      window.__SF.actions.openWizard("character", k.id);
      window.__SF.ui.wizard.stepIndex = 4; // the "flaw" beat — rich lesson + filled field
      window.__SF.render();
    },
  },
  {
    name: "04-character-card",
    setup: () => {
      const w = window.__SF.activeWorld();
      const k = w.entities.find((e) => e.type === "character");
      window.__SF.actions.openCard(k.id);
    },
  },
  {
    name: "05-setting-card",
    setup: () => {
      const w = window.__SF.activeWorld();
      const s = w.entities.find((e) => e.type === "setting");
      window.__SF.actions.openCard(s.id);
    },
  },
  {
    name: "06-framework-walk",
    setup: () => {
      const w = window.__SF.activeWorld();
      const fw = w.entities.find((e) => e.type === "framework");
      window.__SF.ui.fw = {
        key: fw.frameworkKey,
        stepIndex: 3, // "Rising Action & the Midpoint" — has choices + a seeded note
        answers: JSON.parse(JSON.stringify(fw.answers)),
        editingId: fw.id,
      };
      window.__SF.go({ screen: "fw-walk" });
    },
  },
  {
    name: "07-framework-summary",
    setup: () => {
      const w = window.__SF.activeWorld();
      const fw = w.entities.find((e) => e.type === "framework");
      window.__SF.ui.fw = {
        key: fw.frameworkKey,
        stepIndex: 0,
        answers: JSON.parse(JSON.stringify(fw.answers)),
        editingId: fw.id,
      };
      window.__SF.go({ screen: "fw-summary" });
    },
  },
];

async function optimizeToPortfolio(pngBuffer, name) {
  // Resize to 16:10 (1440x900) and encode WebP, stepping quality down until <=300KB.
  const base = sharp(pngBuffer).resize(VIEWPORT.width, VIEWPORT.height, { fit: "cover" });
  let quality = 82;
  let out;
  do {
    out = await base.clone().webp({ quality }).toBuffer();
    if (out.length <= PORTFOLIO_MAX_BYTES || quality <= 40) break;
    quality -= 10;
  } while (true);
  const outPath = resolve(portfolioDir, name + ".webp");
  await sharp(out).toFile(outPath);
  return { path: outPath, bytes: out.length, quality };
}

async function main() {
  // Build the single-file bundle first (also covered by the prescreenshots hook).
  console.log("• Building dist bundle…");
  execFileSync("node", [resolve(root, "scripts/build.mjs")], { stdio: "inherit" });
  if (!existsSync(distPath)) throw new Error("dist/storyframe-studio.html not found after build.");

  mkdirSync(fullDir, { recursive: true });
  mkdirSync(portfolioDir, { recursive: true });

  console.log("• Launching Chromium…");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
  const page = await context.newPage();

  await page.goto(pathToFileURL(distPath).href, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__SF, null, { timeout: 10000 });
  // Let fonts settle (they degrade to system fallbacks offline — spec §9).
  await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());

  const results = [];
  for (const frame of FRAMES) {
    await page.evaluate(frame.setup);
    await page.waitForTimeout(400); // allow render + transitions to settle
    await page.evaluate(() => window.scrollTo(0, 0));

    const fullPath = resolve(fullDir, frame.name + ".png");
    const buffer = await page.screenshot({
      path: fullPath,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
    const opt = await optimizeToPortfolio(buffer, frame.name);
    results.push({
      name: frame.name,
      full: (statSync(fullPath).size / 1024).toFixed(0) + " KB",
      portfolio: (opt.bytes / 1024).toFixed(0) + " KB @ q" + opt.quality,
    });
    console.log("  ✓ " + frame.name);
  }

  await browser.close();

  console.log("\nCaptured " + results.length + " frames:");
  for (const r of results) {
    console.log("   " + r.name.padEnd(22) + " full " + r.full.padStart(8) + "   webp " + r.portfolio);
  }
  console.log("\nFull-res  → assets/screenshots/");
  console.log("Portfolio → assets/portfolio/ (16:10 WebP, <=300KB)");
}

main().catch((err) => {
  console.error("\n✗ Screenshot capture failed:", err.message);
  console.error("\nIf a browser is missing, run:  npx playwright install chromium");
  process.exit(1);
});

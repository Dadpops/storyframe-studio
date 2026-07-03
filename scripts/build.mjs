/**
 * build.mjs — the entire toolchain (spec §2, §12).
 *
 * Reads src/index.html, replaces <script src="app.js"></script> with an inline
 * <script> of src/app.js, and writes the single-file distributable to
 * dist/storyframe-studio.html. No bundler, no transpile — source is the truth,
 * the bundle is a build output.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const htmlPath = resolve(root, "src/index.html");
const jsPath = resolve(root, "src/app.js");
const outPath = resolve(root, "dist/storyframe-studio.html");

const html = readFileSync(htmlPath, "utf8");
const js = readFileSync(jsPath, "utf8");

// Guard against the </script> sequence inside the JS closing the tag early.
const safeJs = js.replace(/<\/script>/gi, "<\\/script>");

const marker = /<script\s+src=["']app\.js["']\s*><\/script>/i;
if (!marker.test(html)) {
  console.error("✗ build failed: could not find <script src=\"app.js\"></script> in src/index.html");
  process.exit(1);
}

const banner = "<!-- Storyframe Studio — single-file build. Source of truth: src/index.html + src/app.js. Rebuild with `npm run build`. -->\n";
const inlined = html.replace(marker, () => `<script>\n${safeJs}\n</script>`);
const output = inlined.replace(/^<!DOCTYPE html>\s*/i, (m) => m + banner);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, output, "utf8");

const kb = (Buffer.byteLength(output, "utf8") / 1024).toFixed(1);
console.log(`✓ Built dist/storyframe-studio.html (${kb} KB) — open it in any browser.`);

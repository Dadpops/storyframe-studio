/**
 * smoke.test.mjs — headless smoke test (spec §10).
 *
 * Drives the REAL app code (src/app.js) inside jsdom via the sanctioned
 * window.__SF API — the same functions the UI buttons call — and asserts the
 * core flows. No test framework: plain Node, prints a pass/fail count, exits
 * non-zero on any failure. Do not ship red.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const html = readFileSync(resolve(root, "src/index.html"), "utf8");
const js = readFileSync(resolve(root, "src/app.js"), "utf8");

// Strip the external <script src="app.js"> — we eval the source ourselves so
// jsdom runs it in the window's scope.
const strippedHtml = html.replace(/<script\s+src=["']app\.js["']\s*><\/script>/i, "");

const dom = new JSDOM(strippedHtml, {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
window.scrollTo = () => {};

// Run the real application code in the page context.
window.eval(js);

// jsdom may still be in readyState "loading" here, so app.js (correctly) defers
// init() to DOMContentLoaded. Fire it if the initial render hasn't happened yet.
if (!window.document.getElementById("app").dataset.screen) {
  window.document.dispatchEvent(new window.Event("DOMContentLoaded"));
}

const SF = window.__SF;
const doc = window.document;
const appText = () => doc.getElementById("app").textContent;

/* ---- tiny assertion harness -------------------------------------------- */
let pass = 0;
let fail = 0;
const failures = [];
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function check(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; failures.push([name, e.message]); console.log("  ✗ " + name + "\n      " + e.message); }
}

console.log("\nStoryframe Studio — smoke test\n");

if (!SF) {
  console.error("FATAL: window.__SF was not exposed — app.js failed to initialize.");
  process.exit(1);
}

/* 1 */
check("App initializes on the projects (worlds) screen", () => {
  assert(SF.ui.view.screen === "worlds", "expected screen 'worlds', got '" + SF.ui.view.screen + "'");
  assert(doc.getElementById("app").dataset.screen === "worlds", "app[data-screen] is not 'worlds'");
  assert(/New world/i.test(appText()), "worlds screen does not render a 'New world' control");
});

/* 2 */
let world2;
check("Create a world + character through the full wizard → commits and lands on card", () => {
  SF.reset();
  world2 = SF.actions.newWorld("Test World", "A world for testing.");
  assert(SF.ui.view.screen === "dashboard", "did not land on dashboard after creating world");
  SF.actions.openWizard("character");
  assert(SF.ui.view.screen === "wizard", "wizard did not open");
  SF.actions.setField("name", "Test Hero");
  SF.actions.setField("role", "Protagonist");
  SF.actions.setField("want", "To win the day");
  SF.actions.setField("voice", "Guarded / dry");
  SF.actions.setField("traits", ["brave", "loyal"]);
  SF.actions.setField("tagline", "The one who tries");
  const entity = SF.actions.commit();
  assert(entity, "commit() returned null (validation blocked it)");
  assert(SF.ui.view.screen === "card", "did not land on card screen, on '" + SF.ui.view.screen + "'");
  assert(world2.entities.length === 1, "entity was not committed to the world");
  assert(world2.entities[0].name === "Test Hero", "committed entity has wrong name");
});

/* 3 */
check("Rendered card shows the name, tagline, a chips field, and a known row label", () => {
  const t = appText();
  const rowLabels = Array.from(doc.querySelectorAll(".card-row__k")).map((n) => n.textContent);
  assert(/Test Hero/.test(t), "card is missing the name");
  assert(/The one who tries/.test(t), "card is missing the tagline");
  assert(rowLabels.includes("Role"), "card is missing the 'Role' row label (labels: " + rowLabels.join(", ") + ")");
  assert(rowLabels.includes("Details"), "card is missing the 'Details' (chips) row label");
  assert(/brave/.test(t) && /loyal/.test(t), "card is missing chip values");
  assert(doc.querySelectorAll(".card-chip").length >= 2, "chips did not render as chip elements");
});

/* 4 */
check("Setting and event wizards render their first step without error", () => {
  SF.actions.openWizard("setting");
  assert(SF.ui.view.screen === "wizard", "setting wizard did not open");
  assert(doc.querySelector(".wiz-panel"), "setting wizard panel missing");
  assert(doc.querySelector("#f-name"), "setting first step (name) field missing");
  assert(/character too/i.test(appText()), "setting step-1 craft lesson not rendered");

  SF.actions.openWizard("event");
  assert(doc.querySelector(".wiz-panel"), "event wizard panel missing");
  assert(doc.querySelector("#f-name"), "event first step (name) field missing");
  assert(/world's state/i.test(appText()), "event step-1 craft lesson not rendered");
});

/* 5 */
check("CSV export produces the correct header and a row containing the entity", () => {
  SF.reset();
  const world = SF.actions.newWorld("CSV World");
  SF.actions.openWizard("character");
  SF.actions.setField("name", "Csv Hero");
  SF.actions.setField("role", "Lead");
  SF.actions.setField("traits", ["sharp", "tired"]);
  SF.actions.commit();
  const csv = SF.worldToCSV(world);
  const lines = csv.split(/\r?\n/);
  assert(lines[0] === "type,name,tagline,field,value", "CSV header is wrong: '" + lines[0] + "'");
  assert(csv.includes("Csv Hero"), "CSV has no row containing the created entity");
  assert(lines.some((l) => /^character,Csv Hero,.*,Role,Lead$/.test(l)), "CSV missing the expected Role row");
  assert(lines.some((l) => /sharp; tired/.test(l)), "CSV did not join array values with '; '");
});

/* 6 */
check("JSON export round-trips losslessly (§4: serialize full state with no UI)", () => {
  SF.reset();
  const world = SF.seedDemo();
  const json = SF.serializeWorld(world);
  const back = JSON.parse(json);
  assert(back.name === world.name, "world name lost in round-trip");
  assert(Array.isArray(back.entities), "entities array lost");
  assert(back.entities.length === world.entities.length, "entity count changed (" + back.entities.length + " vs " + world.entities.length + ")");
  assert(back.entities[0].name === world.entities[0].name, "first entity name lost");
  // Full import path (with id-collision handling) must also survive.
  const reimported = SF.importWorldFromJSON(json);
  assert(reimported.entities.length === world.entities.length, "re-import entity count mismatch");
  const fw = reimported.entities.find((e) => e.type === "framework");
  assert(fw && fw.frameworkKey === "threeAct", "framework entity did not survive round-trip");
});

/* 7 */
check("Framework flow reaches the summary screen after walking all nodes", () => {
  SF.reset();
  SF.actions.newWorld("Framework World");
  SF.actions.startFramework("threeAct");
  assert(SF.ui.view.screen === "fw-walk", "framework walk did not start");
  const n = SF.FRAMEWORKS.threeAct.nodes.length;
  for (let i = 0; i < n; i++) {
    SF.actions.fwSetNote("Decision for beat " + (i + 1));
    SF.actions.fwNext();
  }
  assert(SF.ui.view.screen === "fw-summary", "did not reach summary, on '" + SF.ui.view.screen + "'");
  assert(/blueprint/i.test(appText()), "summary screen did not render blueprint content");
});

/* 8 — relationship layer */
let linkWorld, linkChar, linkSetting, linkEvent;
check("Linking an event to a character + setting stores links and renders connections", () => {
  SF.reset();
  linkWorld = SF.actions.newWorld("Link World");

  SF.actions.openWizard("setting");
  SF.actions.setField("name", "Harborton");
  linkSetting = SF.actions.commit();

  SF.actions.openWizard("character");
  SF.actions.setField("name", "Mara Quell");
  SF.actions.setField("settings", [linkSetting.id]); // link character → setting
  linkChar = SF.actions.commit();

  SF.actions.openWizard("event");
  SF.actions.setField("name", "The Warehouse Fire");
  SF.actions.setField("characters", [linkChar.id]);
  SF.actions.setField("setting", [linkSetting.id]);
  linkEvent = SF.actions.commit();

  assert(linkEvent.links.characters.includes(linkChar.id), "event did not store character link");
  assert(linkEvent.links.setting.includes(linkSetting.id), "event did not store setting link");
  // We're on the event card now — it should show the linked names as connections.
  const t = appText();
  assert(/Mara Quell/.test(t) && /Harborton/.test(t), "event card missing connection names");
  assert(doc.querySelectorAll(".conn-chip").length >= 2, "event card did not render connection chips");
});

/* 9 — reverse links are computed on the target */
check("Reverse links surface on the linked setting (Characters here / Events here)", () => {
  SF.actions.openCard(linkSetting.id);
  const t = appText();
  assert(/Characters here/.test(t), "setting card missing 'Characters here' reverse group");
  assert(/Events here/.test(t), "setting card missing 'Events here' reverse group");
  assert(/Mara Quell/.test(t), "setting card missing the character that belongs to it");
  assert(/The Warehouse Fire/.test(t), "setting card missing the event that takes place in it");
});

/* 10 — links round-trip, and deletion scrubs dangling references */
check("Links round-trip through JSON, and deleting an entity clears dangling links", () => {
  const back = SF.importWorldFromJSON(SF.serializeWorld(linkWorld));
  const ev = back.entities.find((e) => e.type === "event");
  assert(ev.links.characters.length === 1 && ev.links.setting.length === 1, "links lost in round-trip");

  SF.deleteEntity(linkWorld, linkChar.id);
  const evAfter = linkWorld.entities.find((e) => e.type === "event");
  assert(!evAfter.links.characters.includes(linkChar.id), "deleting the character left a dangling link on the event");
});

/* ---- report ------------------------------------------------------------- */
const total = pass + fail;
console.log("\n" + "-".repeat(48));
if (fail === 0) {
  console.log(`✓ All ${total} checks passed.`);
  process.exit(0);
} else {
  console.log(`✗ ${fail} of ${total} checks FAILED:`);
  for (const [name, msg] of failures) console.log("   • " + name + " — " + msg);
  process.exit(1);
}

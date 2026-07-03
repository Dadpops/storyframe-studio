# Build Prompt — Storyframe Studio (build · screenshot · ship)

> Paste this entire file into Claude Code as your task. It is a complete product
> spec plus build, screenshot, repo, and deploy instructions. Read it fully
> before writing any code. Where it says **[ASK ME]**, stop and get the value
> from me rather than guessing. Do not skip to implementation — work through the
> product understanding first, and where the spec leaves a decision open, state
> the decision and the reason in a comment (PRD-style resolved question).

---

## 0. Task in one line

Build **Storyframe Studio**: a local-first, no-AI, guided worldbuilding tool for
fiction writers that turns scattered ideas into structured, shareable "cards"
(characters, settings, events) organized into saveable "worlds," plus a guided
story-framework module. Then **seed a demo world, capture a set of product
screenshots**, write a README that embeds them, initialize a git repo, push to a
new GitHub repo under my account, and offer to deploy.

---

## 1. Product thesis (the "why" — keep in view the whole build)

The user has story ideas but struggles with **organization, direction, and
craft** — not generation. This is a *decision-making and structure* problem, not
an output problem. The product's job is **guided authoring**: it helps the writer
make and record structural decisions and teaches craft along the way. It never
writes prose for them.

Two core loops in one app:
1. **Worldbuilding loop (primary):** create entities (character / setting / event)
   via guided wizards → each becomes a **card** (the hero output) → cards
   accumulate into a **world** (project) → save/export the world.
2. **Framework loop (secondary):** pick a story structure (Three-Act, Hero's
   Journey) → walk it one decision at a time with a craft lesson + example per
   step → exit with a plot blueprint that can be saved into the world.

**The card is the hero.** Primary output goal is "shareable cards to show others."
Spend the design budget there. The wizard is the means; the card is the product.
CSV/JSON export is plumbing — correct but unglamorous.

Outcome-first framing to hold onto:
- The card solves *legibility* — a scattered idea becomes a thing you can show.
- The world solves *accumulation* — many ideas become a browsable set.
- The craft lessons solve *skill* — the user gets better, not just organized.

---

## 2. Non-negotiable constraints

- **No AI, no network calls, no backend.** Runs offline in a browser.
- **No browser storage APIs** (`localStorage`/`sessionStorage`) — unreliable in
  some embedding contexts. Persistence = in-memory during a session + explicit
  file save/load (JSON download; drag a `.json` back onto the page to restore).
- **Local-first, architected to grow into a real app later.** The single most
  important architectural rule: do not couple world data to the UI. The world is
  a clean, portable data object; the UI is a shell around it. A future backend
  must ingest the exact same JSON untouched.
- **Single-file distributable, split source.** Maintainable source =
  `src/index.html` + `src/app.js`. Distributable = a single bundled
  `dist/storyframe-studio.html` with JS inlined. Source is the truth; the bundle
  is a build output.
- **Vanilla stack.** HTML + CSS + one plain JS file. No frameworks, no toolchain
  beyond a tiny inline build script. Keeps it forkable and keeps the "grow into
  an app" migration honest.

---

## 3. Data model (design FIRST, backend-first)

Model the data as if a backend already existed. The UI reads/writes this; it does
not invent its own.

```
store = { projects: [World, ...], activeId: string | null }

World (a "project") = {
  id: string, name: string, desc: string, created: number,
  entities: [Entity, ...]
}

Entity = {
  id: string,
  type: "character" | "setting" | "event" | "framework",
  name: string, created: number,
  // character/setting/event:
  data: { [fieldKey]: string | string[] },
  // framework blueprints:
  frameworkKey: string, frameworkName: string,
  answers: { [stepIndex]: { choice: number|null, note: string } },
  summary: string, plaintext: string
}
```

Rules:
- IDs stable and collision-safe (`uid()` helper).
- On JSON import, if an imported world's `id` collides, reassign a fresh id.
- The world object must JSON-round-trip losslessly.

---

## 4. The "grow into an app" contract (do not violate)

When this later becomes a hosted app with a database and accounts, **the `World`
JSON is the contract.** Everything the UI does must be expressible as reads/writes
against that object:
- No canonical data stored in the DOM. The DOM is derived.
- No entity depends on being on a particular screen to be valid.
- Export can serialize full state at any moment with no UI present (your headless
  test in §10 proves this).

If you want to stash real data in a data-attribute or a closure export can't
reach — stop; that's the coupling this rule forbids.

---

## 5. Entity wizard schemas

Each entity type is a `SCHEMA`: an ordered list of steps. Every step carries a
**craft lesson** (`teach` HTML + an `example`) — the teaching layer, not optional.
Field types: `text`, `textarea`, `choice` (one of a list), `chips` (multiple
tags). Each schema defines a `card` mapping: which fields render on the output
card, order, labels, which render as chips.

Write the lessons well — this is a teaching product. Each should teach the *why*,
give a concrete example, and where useful name the common failure mode.

### 5a. Character
1. `name` · text · a name + one-line identity is enough to start. **Required.**
2. `role` · text · role = function in the plot (protagonist, foil, mentor,
   obstacle), not job title. A vivid person who does nothing is the failure mode.
3. `want` · textarea · the concrete external goal driving their scenes; wants
   create action, action creates plot.
4. `need` · textarea · the internal truth they can't see, often the opposite of
   the want. The gap between want and need *is* the character arc.
5. `flaw` · text · the wound/blind spot driving their worst decisions; must cost
   them. "Stubborn" is weak; "can't ask for help while drowning" generates scenes.
6. `voice` · choice · dominant demeanor: Warm/open, Guarded/dry, Intense/driven,
   Playful/chaotic, Cold/composed (each with a one-line hint).
7. `traits` · chips · a few sharp specifics (a habit, an object, a contradiction)
   beat a paragraph of adjectives.
8. `tagline` · text · one-line distillation; becomes the card subtitle.

Card rows: Role, Wants, Needs, Flaw, Demeanor, Details(chips). Tagline = subtitle.

### 5b. Setting
1. `name` · text · a setting is a character too; name it + what kind of place.
   **Required.**
2. `scale` · choice · Room/space, Building/site, District/town, City/region,
   World/realm. Scale dictates detail investment.
3. `mood` · text · what the place makes you feel before anything happens; its most
   useful job is coloring every scene set there.
4. `senses` · textarea · concrete sensory specifics; one true detail beats a
   paragraph of geography.
5. `conflict` · textarea · tension baked into the location (who controls it,
   what's forbidden, what could go wrong just by being there).
6. `detail` · chips · features/landmarks/rules; the hooks scenes hang on.
7. `tagline` · text · one-line distillation.

Card rows: Scale, Mood, Sensory, Tension, Features(chips). Tagline = subtitle.

### 5c. Event
1. `name` · text · a thing that occurs and changes world state; title it like a
   timeline entry. **Required.**
2. `when` · text · placement in time (date, era, or story beat); timeline position
   is how events chain into causality.
3. `kind` · choice · Turning point, Revelation, Conflict/clash, Catastrophe,
   Quiet/connective.
4. `who` · chips · the characters caught up in it; enables cross-referencing later
   (see roadmap §12).
5. `what` · textarea · the concrete sequence of what happens (log it, don't write
   the scene yet).
6. `consequence` · textarea · what's different afterward; an event without
   consequence is a deleted scene. **Most important field on the card.**
7. `tagline` · text · one-line distillation.

Card rows: When, Kind, Who(chips), What happens, Consequence. Tagline = subtitle.

---

## 6. Story-framework module

A distinct module reachable from the world dashboard. Include at least **Three-Act
Structure** and **Hero's Journey**, each an ordered list of nodes: `step`, `title`,
`teach` (HTML lesson), `example`, `prompt`, optional `choices[]`, `notePlaceholder`.

Flow: pick framework → walk nodes one at a time (left rail shows progress,
completed steps clickable to revisit) → summary of every decision → export as text
OR **save the blueprint into the current world** as a `framework` entity (named
via a small modal).

Make the framework data structure trivially extensible so more frameworks (Save
the Cat, Kishōtenketsu) are pure content additions with no new code.

---

## 7. Screens & navigation

1. **Projects (worlds) screen** — grid of world cards (name, desc, entity counts),
   a "＋ new world" card, an import control. Delete asks for confirmation.
2. **Dashboard** — world title + meta; a create strip (New character / setting /
   event / framework); entities grouped by type as mini-cards; empty state invites
   the first creation. Export CSV / Save world (JSON) live here.
3. **Wizard** — left rail of steps; panel with lesson + example + input +
   Back/Next; required-field validation; editing an existing entity reuses this.
4. **Card** — the hero output. Colored banner by type (character/setting/event each
   a distinct accent), name, tagline subtitle, structured rows, world name in
   footer. Side actions: Edit, Download as image, Back, Delete.
5. **Framework pick / walk / summary** — as in §6.

Persistent header shows the active world + a Save button. Brand mark returns to
the projects screen.

---

## 8. Exports & persistence

- **Save world → JSON** (`*.storyframe.json`): full `World` object, pretty-printed,
  lossless. The real save format.
- **Import:** file picker AND drag-a-`.json`-onto-the-page. Handle id collisions.
  Bad file → non-destructive toast error.
- **Export CSV** (`*-world.csv`): flattened view for spreadsheets/Notion. Columns:
  `type,name,tagline,field,value`. Arrays joined with `; `. Quote/escape properly.
  CSV is **export-only** — never the save format.
- **Download card as image (PNG):** render the current card via SVG `foreignObject`
  + canvas (no external libraries). Degrade gracefully with a toast if unsupported.

---

## 9. Design direction

Warm editorial/literary feel, not a generic SaaS dashboard.
- Palette: warm paper background, soft ink text, a clay/terracotta accent for
  marks, muted green for primary actions. Give each entity type its own accent
  (character = plum, setting = teal, event = terracotta) used on banners, rails,
  chips so the world reads color-coded at a glance.
- Type: a characterful serif for display (e.g. Fraunces) + clean sans body (e.g.
  Inter) + mono for labels/eyebrows (e.g. JetBrains Mono). Load via Google Fonts;
  fallbacks must still look intentional offline.
- Cards must look genuinely shareable — the product's face.
- Quality floor: responsive to mobile, visible keyboard focus, reduced-motion
  respected, sensible empty/error states written in the interface's own voice.
- Avoid the templated "cream + serif + terracotta AI-default" look by making the
  entity-color system and the card the distinctive signature.

---

## 10. Testing (required before screenshots or shipping)

Write a headless smoke test (Node + jsdom) that drives the real code and asserts
core flows, at minimum:
1. App initializes on the projects screen.
2. Creating a world, then a character through the full wizard, commits an entity
   and lands on the card screen.
3. The rendered card shows the name, tagline, a chips field, and a known row label.
4. Setting and event wizards render their first step without error.
5. CSV export produces the correct header and a row containing the created entity.
6. JSON export round-trips (parse back, entity count and name intact) — proves the
   §4 "export with no UI present" contract.
7. Framework flow reaches the summary screen after walking all nodes.

Fix anything the test catches. Report the pass/fail count. Do not ship red, and do
not take screenshots until the test is green.

---

## 11. Screenshots (do this after the test passes)

Screenshots of a stateful app are a **capture script**, not a single grab. Empty
screens prove nothing — capture the product *working, with real content in it*.

**Step 1 — seed a demo world in code.** Create a small script or a `?demo=1` seed
path that programmatically builds one populated world so captures look real. Seed
suggestion (self-contained, no personal data):
- World: **"The Ashfall Chronicles"**, desc "A harbor city built in a dead
  volcano's crater."
- Character: **Kestrel Vance** — "A holy man's conscience in a debt-collector's
  coat." (fill want/need/flaw/voice/traits so the card is full).
- Setting: **The Ashfall Market** — "A marketplace where everything's for sale
  except the truth."
- Event: **The Drowning of the North Fleet** — "The night the sea was ordered to
  kill."
- One saved **Three-Act** blueprint with a few nodes filled in.

**Step 2 — capture these specific frames** (this is what sells the tool):
1. `01-worlds.png` — the projects/worlds screen with the seeded world card visible.
2. `02-dashboard.png` — the world dashboard showing the seeded entities grouped by
   type (character/setting/event/framework populated).
3. `03-wizard-lesson.png` — a wizard mid-flow on a step whose **craft lesson +
   example** is visible (this shows the teaching layer — the differentiator).
4. `04-character-card.png` — a finished **character card** (the hero output), full.
5. `05-setting-card.png` — a finished setting card (shows the color-coded accent
   system vs. the character card).
6. `06-framework-walk.png` — the framework module mid-walk, lesson + choices
   visible.
7. `07-framework-summary.png` — the blueprint summary screen.

**Capture method:** use a headless browser (Playwright preferred; install if
needed). Load `dist/storyframe-studio.html` (or the seed path), drive the UI to
each state, wait for fonts/render, and screenshot at **1440×900, deviceScaleFactor
2** (crisp retina). Also produce **portfolio-optimized copies** at **16:10,
compressed** (≤300KB each, PNG or WebP) in `assets/portfolio/` so they can drop
straight into my portfolio site later. Keep full-res originals in
`assets/screenshots/`.

If Playwright can't run in this environment, tell me exactly what's blocking it
and provide a one-command script I can run locally to generate the captures —
don't silently skip screenshots.

---

## 12. Repo structure to produce

```
storyframe-studio/
├─ README.md                 # pitch, screenshots embedded, run/build, how-to-add, roadmap
├─ LICENSE                   # MIT
├─ .gitignore                # node_modules, OS cruft
├─ package.json              # scripts: build, test, screenshots (dev-deps: jsdom, playwright)
├─ src/
│  ├─ index.html
│  └─ app.js
├─ dist/
│  └─ storyframe-studio.html # built single-file bundle
├─ scripts/
│  ├─ build.mjs              # inlines src/app.js into src/index.html → dist/
│  └─ screenshots.mjs        # seeds demo world + captures §11 frames
├─ test/
│  └─ smoke.test.mjs         # the §10 headless test
├─ assets/
│  ├─ screenshots/           # full-res captures
│  └─ portfolio/             # 16:10 optimized copies
└─ docs/
   └─ BUILD_PROMPT.md        # this file, for provenance
```

- `package.json` scripts: `build`, `test`, `screenshots`.
- `build.mjs`: read `src/index.html`, replace `<script src="app.js">` with an
  inline `<script>` of `src/app.js`, write `dist/storyframe-studio.html`. No
  bundler.
- **README must embed the §11 screenshots** near the top (the visual proof), plus:
  one-paragraph pitch, "open `dist/storyframe-studio.html` in any browser" run
  instructions, `npm run build` / `npm test` / `npm run screenshots`, the
  data-model contract summary, and the §12 roadmap. Include a copy-paste "How to
  add a framework / entity field" note so future edits stay easy.

---

## 13. Roadmap to record in the README (do not build yet)

Frame as prioritized, outcome-first (PRD "future work"):
- **v2 — Relationship layer (highest value).** Link entities: an event references
  its characters and setting; a character belongs to settings. Turns "a pile of
  cards" into a "world model" — the reason the event `who` field already stores
  names. Build deliberately, not bolted on.
- **v2 — More entity types.** Factions/orgs, items/artifacts, magic/tech systems,
  lore. Compositions of the existing spine — breadth on a proven pattern.
- **v2 — More frameworks.** Save the Cat (15-beat), Kishōtenketsu (four-act). Pure
  content additions.
- **v3 — The "grow into an app" jump.** Real persistence (accounts + database),
  removing the manual save/load friction. The trigger is evidence that file-based
  saving is costing the user work — that friction is the signal, not a schedule.

---

## 14. Git + GitHub + deploy (do last; keep me in the approval loop)

After the build is green, the test passes, and screenshots exist:
1. `git init`, sensible `.gitignore`, clean initial commit
   (`feat: Storyframe Studio v1 — guided worldbuilding tool`).
2. Create a new GitHub repo under my account via `gh` CLI. Ask me **public vs
   private** (default **public** — it's a portfolio piece). Command shape:
   `gh repo create storyframe-studio --public --source=. --remote=origin`. If `gh`
   isn't authenticated, stop and tell me to run `gh auth login` — do not handle
   credentials yourself.
3. **Before pushing, show me:** the file tree, the README (with screenshots
   rendering), and the test result. Wait for my explicit "push it" before
   `git push -u origin main`.
4. After pushing, **offer to deploy** the single-file app to **GitHub Pages**
   (serve `dist/`), or Netlify/Vercel if I prefer. Provide exact steps; execute
   only after I confirm. Print the live URL.
5. Do not enter or store any credentials. Hand any auth step back to me with the
   exact command. I stay in the approval loop for anything that publishes or
   authenticates.

---

## 15. Before you start — [ASK ME] checklist (one batch, then build)

1. Public or private repo? (default public)
2. Deploy target: GitHub Pages (default), Netlify, or Vercel?
3. Repo name — `storyframe-studio` ok, or another?
4. Am I ok with the seeded demo-world content in §11, or do you want different
   sample content for the screenshots?

---

## 16. Definition of done

- [ ] `src/` runs correctly opened in a browser.
- [ ] `npm run build` produces a working single-file `dist/` bundle.
- [ ] `npm test` passes all §10 checks; pass count reported.
- [ ] `npm run screenshots` seeds a demo world and produces all §11 frames
      (full-res + 16:10 optimized copies), or you told me exactly what blocked it
      and gave me a local one-command fallback.
- [ ] README embeds the screenshots + how-to-add + roadmap; LICENSE, .gitignore,
      package.json correct.
- [ ] Repo initialized and committed locally.
- [ ] New GitHub repo created; you paused for my confirmation; pushed on my go.
- [ ] Deploy offered and (on my go) done; live URL printed.
- [ ] All [ASK ME] items resolved or explicitly stubbed.
```

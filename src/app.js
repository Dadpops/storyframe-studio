/* ============================================================================
 * Storyframe Studio — guided worldbuilding for fiction writers.
 *
 * Architecture note (spec §3, §4 — the "grow into an app" contract):
 * The canonical data lives ONLY in `store`. The DOM is always derived from it
 * and never the source of truth. Every mutation goes through a data operation
 * that a future backend could run untouched, and `serializeWorld()` can
 * serialize full state at any moment with no UI present (the headless test in
 * §10 proves this). If you ever find yourself stashing real data in a DOM
 * attribute or a closure that export can't reach — stop; that's the coupling
 * this file forbids.
 * ========================================================================== */
(function () {
  "use strict";

  /* ==========================================================================
   * 1. Small helpers
   * ======================================================================== */

  // Collision-safe id. No crypto dependency so it runs in jsdom and browsers.
  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function slugify(s) {
    return String(s || "world").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "world";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Terse hyperscript-style DOM builder. children may nest arrays.
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k === "dataset") { for (const dk in v) node.dataset[dk] = v[dk]; }
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) node.setAttribute(k, "");
        else node.setAttribute(k, v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  /* ==========================================================================
   * 2. Entity wizard schemas (spec §5)
   * Each step carries a craft lesson (`teach` HTML + `example`) — the teaching
   * layer is not optional. `card` maps fields onto the output card.
   * ======================================================================== */

  const SCHEMAS = {
    character: {
      type: "character", label: "Character", accent: "character",
      eyebrow: "New character", nameField: "name",
      blurb: "A person the plot can push on.",
      steps: [
        {
          key: "name", label: "Name", type: "text", required: true,
          placeholder: "e.g. Kestrel Vance",
          teach: `<p>A name and a one-line identity are enough to begin — you don't need the whole person yet. Naming a character makes them <strong>real enough to make decisions about</strong>.</p><p>Don't stall hunting for the perfect name; you can rename later. The point is to stop thinking "a character" and start thinking about <em>this</em> one.</p>`,
          example: "Kestrel Vance — a debt-collector who used to be a priest.",
        },
        {
          key: "role", label: "Role", type: "text",
          placeholder: "Their function in the plot",
          teach: `<p>Role means <strong>function in the plot</strong> — protagonist, foil, mentor, obstacle, tempter — not their day job. Ask what this person <em>does to the story</em>, not what they do for a living.</p><p>The failure mode: a vivid, well-drawn person who has no job in the machine of the plot and just stands around being interesting.</p>`,
          example: "Antagonist-shaped mentor — he trains the hero while collecting her father's debt.",
        },
        {
          key: "want", label: "Want (external goal)", type: "textarea",
          placeholder: "The concrete thing they're chasing",
          teach: `<p>The <strong>want</strong> is the concrete, external goal driving their scenes — what they'd say out loud if you asked. Wants create action, and action creates plot.</p><p>Keep it specific and pursuable. "To be happy" is a mood; "to buy back the family press before the auction" is an engine.</p>`,
          example: "To settle the North Fleet's debt before the Guild replaces him with someone crueler.",
        },
        {
          key: "need", label: "Need (internal truth)", type: "textarea",
          placeholder: "What they actually need but can't see",
          teach: `<p>The <strong>need</strong> is the internal truth the character can't yet see — often the opposite of the want. The <em>gap between want and need is the character arc</em>: the story is them learning which one actually matters.</p>`,
          example: "To forgive himself for the drowning he helped order — and to trust his conscience over an order.",
        },
        {
          key: "flaw", label: "Flaw", type: "text",
          placeholder: "The wound that drives bad decisions",
          teach: `<p>The flaw is the wound or blind spot behind their worst decisions — and it has to <strong>cost them</strong> on the page. A trait that never causes damage is decoration.</p><p>"Stubborn" is weak because it's abstract. Make it a behavior that generates scenes: <em>can't ask for help while drowning</em>.</p>`,
          example: "Mistakes obedience for virtue — will carry out a cruel order rather than defy it.",
        },
        {
          key: "voice", label: "Demeanor", type: "choice",
          teach: `<p>Demeanor is the <strong>default register</strong> a character speaks and moves in — the texture a reader feels before any single line of dialogue. Pick the dominant one; contradictions come from the traits and flaw.</p>`,
          example: "Guarded / dry — he says less than he knows, and what he says lands like a bill coming due.",
          choices: [
            { value: "Warm / open", hint: "Trusting, expressive, quick to connect." },
            { value: "Guarded / dry", hint: "Reserved, understated, wry." },
            { value: "Intense / driven", hint: "Urgent, focused, hard to deflect." },
            { value: "Playful / chaotic", hint: "Teasing, unpredictable, allergic to solemnity." },
            { value: "Cold / composed", hint: "Controlled, measured, unsettlingly calm." },
          ],
        },
        {
          key: "traits", label: "Traits", type: "chips",
          placeholder: "Type a specific, press Enter",
          teach: `<p>A few <strong>sharp specifics</strong> — a habit, an object they carry, a contradiction — do more than a paragraph of adjectives. Concrete details are what a reader actually remembers.</p><p>Aim for the telling over the generic: not "observant" but "counts the exits in every room."</p>`,
          example: "Counts the exits · Keeps his old prayer beads · Never raises his voice",
        },
        {
          key: "tagline", label: "Tagline", type: "text",
          placeholder: "One line that sums them up",
          teach: `<p>One line that distills the whole character — it becomes the <strong>subtitle on the card</strong>. Think blurb, not biography: the sentence that makes someone want to know them.</p>`,
          example: "A holy man's conscience in a debt-collector's coat.",
        },
      ],
      card: {
        rows: [
          { key: "role", label: "Role" },
          { key: "want", label: "Wants" },
          { key: "need", label: "Needs" },
          { key: "flaw", label: "Flaw" },
          { key: "voice", label: "Demeanor" },
          { key: "traits", label: "Details", chips: true },
        ],
      },
    },

    setting: {
      type: "setting", label: "Setting", accent: "setting",
      eyebrow: "New setting", nameField: "name",
      blurb: "A place that colors every scene in it.",
      steps: [
        {
          key: "name", label: "Name", type: "text", required: true,
          placeholder: "e.g. The Ashfall Market",
          teach: `<p>A setting is a character too — give it a name and say <strong>what kind of place</strong> it is in the same breath. "A place" is inert; "the drowned cathedral market" already has mood.</p>`,
          example: "The Ashfall Market — a bazaar built into a dead volcano's crater.",
        },
        {
          key: "scale", label: "Scale", type: "choice",
          teach: `<p>Scale sets your <strong>detail budget</strong>. A single room can afford a loving inventory; a whole realm needs broad strokes and a few sharp anchors. Deciding scale first stops you over- or under-describing.</p>`,
          example: "District / town — big enough for factions, small enough to cross on foot.",
          choices: [
            { value: "Room / space", hint: "A single contained location." },
            { value: "Building / site", hint: "One structure or complex." },
            { value: "District / town", hint: "A walkable neighborhood or settlement." },
            { value: "City / region", hint: "A large populated area." },
            { value: "World / realm", hint: "A whole world, plane, or civilization." },
          ],
        },
        {
          key: "mood", label: "Mood", type: "text",
          placeholder: "What it makes you feel",
          teach: `<p>Mood is what the place makes you feel <strong>before anything happens in it</strong>. Its most useful job is quietly coloring every scene you set there — so decide it deliberately instead of letting it default to neutral.</p>`,
          example: "Feverish and transactional — everyone here is mid-deal, and the air knows it.",
        },
        {
          key: "senses", label: "Sensory detail", type: "textarea",
          placeholder: "What you see, hear, smell, feel",
          teach: `<p>Ground the place in <strong>concrete sensory specifics</strong>. One true detail — warm ash underfoot — beats a paragraph of map-geography, because readers live in the senses, not the survey.</p>`,
          example: "Warm ash drifts like snow; sulfur and frying oil; a dozen tongues shouting prices over the clang of the Ash Gate.",
        },
        {
          key: "conflict", label: "Built-in tension", type: "textarea",
          placeholder: "What could go wrong just by being here",
          teach: `<p>Bake <strong>tension into the location itself</strong>: who controls it, what's forbidden, what could go wrong just by your character being present. A setting with built-in conflict generates scenes; a pretty backdrop just sits there.</p>`,
          example: "The Guild taxes every sale but can't stop the smuggling it depends on — so everyone's guilty and everyone's protected.",
        },
        {
          key: "detail", label: "Features", type: "chips",
          placeholder: "Landmarks, rules, hooks",
          teach: `<p>List the <strong>features, landmarks, and rules</strong> — the specific hooks a scene can hang on. These are the load-bearing details you'll reach for when you actually stage action here.</p>`,
          example: "The Ash Gate · No open flame after dusk · The vendor who sells secrets",
        },
        {
          key: "tagline", label: "Tagline", type: "text",
          placeholder: "One line that sums it up",
          teach: `<p>One line that distills the place — it becomes the card's <strong>subtitle</strong>. Capture the paradox or promise of the location in a single breath.</p>`,
          example: "A marketplace where everything's for sale except the truth.",
        },
      ],
      card: {
        rows: [
          { key: "scale", label: "Scale" },
          { key: "mood", label: "Mood" },
          { key: "senses", label: "Sensory" },
          { key: "conflict", label: "Tension" },
          { key: "detail", label: "Features", chips: true },
        ],
      },
    },

    event: {
      type: "event", label: "Event", accent: "event",
      eyebrow: "New event", nameField: "name",
      blurb: "A moment that changes the world's state.",
      steps: [
        {
          key: "name", label: "Name", type: "text", required: true,
          placeholder: "e.g. The Drowning of the North Fleet",
          teach: `<p>An event is a thing that <strong>occurs and changes the world's state</strong>. Title it like a line in a timeline — noun-forward and specific — so it reads as something that <em>happened</em>, not a vibe.</p>`,
          example: "The Drowning of the North Fleet.",
        },
        {
          key: "when", label: "When", type: "text",
          placeholder: "Date, era, or story beat",
          teach: `<p>Fix the event's <strong>position in time</strong> — a date, an era, or a story beat. Timeline position is how events chain into causality; "before" and "after" are where plot actually lives.</p>`,
          example: "Seven years before the story opens — the winter of the false tide.",
        },
        {
          key: "kind", label: "Kind", type: "choice",
          teach: `<p>Naming the <strong>kind</strong> of event tells you what job it does in the story's rhythm. A structure made only of catastrophes exhausts a reader; quiet connective beats are what make the loud ones land.</p>`,
          example: "Catastrophe — the loss every later choice is measured against.",
          choices: [
            { value: "Turning point", hint: "The story changes direction here." },
            { value: "Revelation", hint: "A hidden truth comes to light." },
            { value: "Conflict / clash", hint: "Forces collide directly." },
            { value: "Catastrophe", hint: "Something is lost or destroyed." },
            { value: "Quiet / connective", hint: "A low-stakes beat that links bigger ones." },
          ],
        },
        {
          key: "who", label: "Who's involved", type: "chips",
          placeholder: "Characters caught up in it",
          teach: `<p>List the <strong>characters caught up in it</strong>. Recording who was present is what will later let you cross-reference people and events into a real web of cause and effect — that's the roadmap's relationship layer, and you're seeding it now.</p>`,
          example: "Kestrel Vance · Admiral Sorne · the harbor children",
        },
        {
          key: "what", label: "What happens", type: "textarea",
          placeholder: "The sequence of events, in order",
          teach: `<p>Log the <strong>concrete sequence of what happens</strong> — the facts, in order. Don't write the scene yet; you're recording what occurred, not performing it. Prose comes later, once the beats are load-bearing.</p>`,
          example: "The Guild ordered the tide-gates opened to sink a debtor fleet; the fleet and the dockside quarter behind it went under before dawn.",
        },
        {
          key: "consequence", label: "Consequence", type: "textarea",
          placeholder: "What's different afterward",
          teach: `<p>The consequence is <strong>what's different afterward</strong> — and it's the most important thing on the card. An event with no consequence is a deleted scene: pretty, and safely cut. If the world is the same after, it didn't happen.</p>`,
          example: "The harbor never trusted the Guild again, and Kestrel left the priesthood the next morning.",
        },
        {
          key: "tagline", label: "Tagline", type: "text",
          placeholder: "One line that sums it up",
          teach: `<p>One line that distills the event — the card's <strong>subtitle</strong>. Compress the whole occurrence into the sentence you'd use to make someone lean in.</p>`,
          example: "The night the sea was ordered to kill.",
        },
      ],
      card: {
        rows: [
          { key: "when", label: "When" },
          { key: "kind", label: "Kind" },
          { key: "who", label: "Who", chips: true },
          { key: "what", label: "What happens" },
          { key: "consequence", label: "Consequence" },
        ],
      },
    },
  };

  const ENTITY_TYPES = ["character", "setting", "event"];
  const TYPE_ORDER = ["character", "setting", "event", "framework"];
  const TYPE_LABELS = { character: "Characters", setting: "Settings", event: "Events", framework: "Frameworks" };
  const ACCENTS = { character: "#7c4f80", setting: "#2c7c78", event: "#bd5a34", framework: "#5c6689" };

  /* ==========================================================================
   * 3. Story-framework module (spec §6)
   * Each framework is pure content: an ordered list of nodes. Adding "Save the
   * Cat" or "Kishotenketsu" later is a data addition with no new code.
   * ======================================================================== */

  const FRAMEWORKS = {
    threeAct: {
      key: "threeAct", name: "Three-Act Structure",
      tagline: "Setup, confrontation, resolution — the spine most stories share.",
      blurb: "The workhorse shape: a world established, a middle that escalates, an ending that pays it off. Great for finding where your story sags.",
      nodes: [
        {
          step: "Act I", title: "The Ordinary World",
          teach: `<p>Establish the world, the protagonist, and what's at stake <strong>before</strong> anything breaks. The reader needs a "normal" to measure the coming disruption against.</p>`,
          example: "Kestrel works the Ashfall Market collecting Guild debts — respected, efficient, and quietly hollow.",
          prompt: "What does your protagonist's world look like before the story disturbs it?",
          notePlaceholder: "Sketch the status quo and the stakes hiding inside it…",
        },
        {
          step: "Act I", title: "The Inciting Incident",
          teach: `<p>The event that cracks the status quo. How it reaches the protagonist shapes the whole story's engine — decide whether the world acts on them, or they choose to act.</p>`,
          example: "A dying debtor presses a ledger into Kestrel's hands — proof the North Fleet was murdered, not lost.",
          prompt: "What breaks the status quo, and how does it reach your protagonist?",
          choices: [
            { value: "An external shock — the world acts on them" },
            { value: "A choice — they decide to step out" },
            { value: "A revelation — a hidden truth surfaces" },
          ],
          notePlaceholder: "Describe the disruption…",
        },
        {
          step: "Act I → II", title: "The First Plot Point",
          teach: `<p>The point of no return that ends Act I. The protagonist commits — or is committed — to the journey, and the door back to normal closes behind them.</p>`,
          example: "Kestrel hides the ledger instead of surrendering it to the Guild — and now can't take it back.",
          prompt: "What decision or event locks your protagonist into the story?",
          notePlaceholder: "What closes the door behind them…",
        },
        {
          step: "Act II", title: "Rising Action & the Midpoint",
          teach: `<p>The middle escalates through tests and complications, then <strong>pivots at the midpoint</strong> — a shift that reframes the stakes so the second half isn't just more of the first.</p>`,
          example: "Chasing the truth, Kestrel wins the harbor's trust — then learns the order he's tracking was signed by his old mentor.",
          prompt: "How do the stakes rise, and what midpoint shift changes the game?",
          choices: [
            { value: "A false victory that curdles" },
            { value: "A false defeat that clarifies" },
            { value: "A revelation that raises the stakes" },
          ],
          notePlaceholder: "The complications and the turn…",
        },
        {
          step: "Act II → III", title: "The Crisis — All Is Lost",
          teach: `<p>The low point that ends Act II. The protagonist's old approach fails completely; the flaw comes due. This is the pressure that forces genuine change.</p>`,
          example: "Kestrel's obedience costs him the one ally who believed him; the ledger is seized and he's alone.",
          prompt: "What's the darkest moment, and how does it corner your protagonist?",
          notePlaceholder: "The all-is-lost beat…",
        },
        {
          step: "Act III", title: "The Climax",
          teach: `<p>The protagonist confronts the central conflict directly, and the arc pays off — <strong>how</strong> they win (or lose) should prove what they finally learned.</p>`,
          example: "Kestrel defies a Guild order for the first time in his life, and exposes the drowning in open market.",
          prompt: "How does the central conflict resolve, and what does it prove they learned?",
          choices: [
            { value: "They win by changing — need over want" },
            { value: "They win, but lose something for it" },
            { value: "They fail, meaningfully" },
          ],
          notePlaceholder: "The confrontation and its cost…",
        },
        {
          step: "Act III", title: "Resolution — The New Normal",
          teach: `<p>Show the changed world and let it echo the opening, so the reader feels the distance travelled. Brief is fine — you're landing the plane, not taking off again.</p>`,
          example: "The market reopens under new rules; Kestrel keeps the beads but not the collar, and finally rests.",
          prompt: "What does the world look like now, and how has your protagonist changed?",
          notePlaceholder: "The new equilibrium…",
        },
      ],
    },

    herosJourney: {
      key: "herosJourney", name: "Hero's Journey",
      tagline: "The mythic departure-initiation-return cycle.",
      blurb: "Campbell's monomyth, trimmed to the beats that matter. Best for transformation stories where an ordinary person is called into an extraordinary world.",
      nodes: [
        {
          step: "Departure", title: "The Ordinary World",
          teach: `<p>Ground the hero in the familiar before the extraordinary calls. We need to know what they'll be leaving — and the quiet lack that makes them ready to go.</p>`,
          example: "A collector who has made peace with a small, compromised life.",
          prompt: "Where does your hero begin, and what's quietly missing?",
          notePlaceholder: "The world before the call…",
        },
        {
          step: "Departure", title: "The Call to Adventure",
          teach: `<p>A summons disrupts the ordinary — a problem, an invitation, a threat. The call names the adventure and the stakes of refusing it.</p>`,
          example: "The ledger arrives: a truth that can't be un-known.",
          prompt: "What calls your hero out of the ordinary world?",
          notePlaceholder: "The summons…",
        },
        {
          step: "Departure", title: "Refusal of the Call",
          teach: `<p>Hesitation makes the hero human and the stakes real. What they fear losing here is what the journey will demand they risk.</p>`,
          example: "Kestrel tries to hand the ledger back — safer to stay useful and blind.",
          prompt: "Why does your hero resist at first?",
          choices: [
            { value: "Fear of loss" },
            { value: "Sense of inadequacy" },
            { value: "Duty to the old world" },
          ],
          notePlaceholder: "The hesitation…",
        },
        {
          step: "Departure", title: "Meeting the Mentor",
          teach: `<p>A guide gives the hero what they need to cross over — a tool, a truth, or the courage to go. Mentors can be flawed, absent, or later betray the hero.</p>`,
          example: "A retired harbor-master teaches Kestrel to read the Guild's ledgers against them.",
          prompt: "Who or what prepares your hero to cross the threshold?",
          notePlaceholder: "The mentor and the gift…",
        },
        {
          step: "Initiation", title: "Crossing the Threshold",
          teach: `<p>The hero commits and enters the special world, where the ordinary rules no longer apply. The crossing should cost something — a burned bridge.</p>`,
          example: "Kestrel walks into the Guild's records hall under a false name.",
          prompt: "How does your hero commit and enter the new world?",
          notePlaceholder: "The point of commitment…",
        },
        {
          step: "Initiation", title: "The Ordeal",
          teach: `<p>The central crisis — the hero faces their greatest fear and something dies (literally or figuratively) so something can be reborn. This is the journey's hinge.</p>`,
          example: "Cornered, Kestrel must choose between the order he's always obeyed and the truth he now carries.",
          prompt: "What is the supreme ordeal, and what must your hero confront in it?",
          notePlaceholder: "The crisis at the center…",
        },
        {
          step: "Initiation", title: "The Reward",
          teach: `<p>Surviving the ordeal, the hero seizes the prize — an object, a knowledge, a reconciliation. But the reward isn't the end; it's what they must now carry home.</p>`,
          example: "He walks out with the proof — and with a conscience he can no longer silence.",
          prompt: "What does your hero gain, and what does it now demand of them?",
          notePlaceholder: "The prize and its weight…",
        },
        {
          step: "Return", title: "Return with the Elixir",
          teach: `<p>The hero comes back transformed, bringing something that heals the ordinary world. The return proves the journey mattered beyond the hero themselves.</p>`,
          example: "Kestrel gives the harbor its truth back; the market reopens honest, and he's finally free of the collar.",
          prompt: "What does your hero bring back, and how is the ordinary world changed?",
          notePlaceholder: "The return and its gift…",
        },
      ],
    },
  };

  /* ==========================================================================
   * 4. State — canonical data + transient UI state kept strictly separate
   * ======================================================================== */

  const store = { projects: [], activeId: null };

  // Transient UI state. NEVER holds canonical world data (spec §4).
  const ui = {
    view: { screen: "worlds", worldId: null, entityId: null },
    wizard: null, // { type, entityId, stepIndex, draft, maxVisited, errored }
    fw: null,     // { key, stepIndex, answers, editingId }
  };

  function activeWorld() { return store.projects.find((p) => p.id === store.activeId) || null; }
  function worldById(id) { return store.projects.find((p) => p.id === id) || null; }

  /* ==========================================================================
   * 5. Data operations (pure w.r.t. the UI — a backend could run these as-is)
   * ======================================================================== */

  function createWorld(name, desc) {
    const world = { id: uid("world"), name: name || "Untitled World", desc: desc || "", created: Date.now(), entities: [] };
    store.projects.push(world);
    return world;
  }

  function deleteWorld(id) {
    const i = store.projects.findIndex((p) => p.id === id);
    if (i >= 0) store.projects.splice(i, 1);
    if (store.activeId === id) store.activeId = null;
  }

  function deleteEntity(world, entityId) {
    const i = world.entities.findIndex((e) => e.id === entityId);
    if (i >= 0) world.entities.splice(i, 1);
  }

  function entityCounts(world) {
    const c = { character: 0, setting: 0, event: 0, framework: 0 };
    for (const e of world.entities) if (c[e.type] != null) c[e.type]++;
    return c;
  }

  // Card view-model — the single source both the on-screen card and the PNG use.
  function cardModel(entity, world) {
    const schema = SCHEMAS[entity.type];
    const rows = schema.card.rows
      .map((r) => {
        const raw = entity.data[r.key];
        if (r.chips) {
          const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
          return { label: r.label, chips: arr };
        }
        return { label: r.label, value: raw || "" };
      })
      .filter((r) => (r.chips ? r.chips.length : r.value));
    return {
      type: entity.type, accent: ACCENTS[entity.type], typeLabel: schema.label,
      name: entity.name || "Untitled", tagline: entity.data.tagline || "",
      rows, worldName: world.name,
    };
  }

  // Build a framework blueprint entity from a walk's answers.
  function buildFrameworkEntity(frameworkKey, answers, name, existing) {
    const fw = FRAMEWORKS[frameworkKey];
    const filled = fw.nodes.reduce((n, _node, i) => {
      const a = answers[i];
      return n + (a && (a.note || a.choice != null) ? 1 : 0);
    }, 0);
    const entity = existing || { id: uid("ent"), type: "framework", created: Date.now() };
    entity.type = "framework";
    entity.name = name || fw.name;
    entity.frameworkKey = frameworkKey;
    entity.frameworkName = fw.name;
    entity.answers = JSON.parse(JSON.stringify(answers));
    entity.summary = fw.name + " — " + filled + "/" + fw.nodes.length + " beats mapped";
    entity.plaintext = frameworkPlaintext(fw, answers, entity.name);
    return entity;
  }

  function frameworkPlaintext(fw, answers, title) {
    const lines = [];
    lines.push((title || fw.name).toUpperCase());
    lines.push(fw.name + " blueprint");
    lines.push("");
    fw.nodes.forEach((node, i) => {
      const a = answers[i] || {};
      lines.push((i + 1) + ". " + node.step + " — " + node.title);
      if (node.choices && a.choice != null && node.choices[a.choice]) {
        lines.push("   Approach: " + node.choices[a.choice].value);
      }
      lines.push("   " + (a.note && a.note.trim() ? a.note.trim() : "(not yet decided)"));
      lines.push("");
    });
    return lines.join("\n");
  }

  /* ---- Serialization: JSON is the save format; CSV is export-only ---------- */

  function serializeWorld(world) {
    // Deep, pretty, lossless. Works with no UI present (spec §4 / §10.6).
    return JSON.stringify(world, null, 2);
  }

  function csvEscape(v) {
    const s = String(v == null ? "" : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function worldToCSV(world) {
    const header = ["type", "name", "tagline", "field", "value"];
    const lines = [header.join(",")];
    for (const e of world.entities) {
      if (e.type === "framework") {
        const fw = FRAMEWORKS[e.frameworkKey];
        (fw ? fw.nodes : []).forEach((node, i) => {
          const a = (e.answers && e.answers[i]) || {};
          const parts = [];
          if (node.choices && a.choice != null && node.choices[a.choice]) parts.push(node.choices[a.choice].value);
          if (a.note && a.note.trim()) parts.push(a.note.trim());
          if (!parts.length) return;
          lines.push([e.type, e.name, "", node.step + " — " + node.title, parts.join(" — ")].map(csvEscape).join(","));
        });
      } else {
        const schema = SCHEMAS[e.type];
        const tagline = e.data.tagline || "";
        for (const step of schema.steps) {
          if (step.key === "name" || step.key === "tagline") continue;
          let val = e.data[step.key];
          if (Array.isArray(val)) val = val.join("; ");
          if (val == null || val === "") continue;
          lines.push([e.type, e.name, tagline, step.label, val].map(csvEscape).join(","));
        }
      }
    }
    return lines.join("\r\n");
  }

  // Parse + validate an imported world. Throws a friendly Error on bad input.
  function importWorldFromJSON(text) {
    let obj;
    try { obj = JSON.parse(text); }
    catch (_e) { throw new Error("That file isn't valid JSON."); }
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.entities) || typeof obj.name !== "string") {
      throw new Error("That doesn't look like a Storyframe world file.");
    }
    return {
      id: typeof obj.id === "string" && obj.id ? obj.id : uid("world"),
      name: obj.name,
      desc: typeof obj.desc === "string" ? obj.desc : "",
      created: typeof obj.created === "number" ? obj.created : Date.now(),
      entities: obj.entities.filter((e) => e && typeof e === "object").map(normalizeEntity),
    };
  }

  function normalizeEntity(e) {
    const base = {
      id: typeof e.id === "string" && e.id ? e.id : uid("ent"),
      type: TYPE_ORDER.includes(e.type) ? e.type : "character",
      name: typeof e.name === "string" ? e.name : "Untitled",
      created: typeof e.created === "number" ? e.created : Date.now(),
    };
    if (base.type === "framework") {
      base.frameworkKey = e.frameworkKey;
      base.frameworkName = e.frameworkName || (FRAMEWORKS[e.frameworkKey] && FRAMEWORKS[e.frameworkKey].name) || "Framework";
      base.answers = e.answers && typeof e.answers === "object" ? e.answers : {};
      base.summary = e.summary || "";
      base.plaintext = e.plaintext || "";
    } else {
      base.data = e.data && typeof e.data === "object" ? e.data : {};
    }
    return base;
  }

  // Add an imported world, reassigning its id on collision (spec §3).
  function addImportedWorld(world) {
    if (store.projects.some((p) => p.id === world.id)) world.id = uid("world");
    store.projects.push(world);
    return world;
  }

  /* ==========================================================================
   * 6. Toasts + download helper
   * ======================================================================== */

  function toast(message, type) {
    const host = document.getElementById("toasts");
    if (!host) return;
    const icon = type === "error" ? "⚠" : type === "success" ? "✓" : "•";
    const node = el("div", { class: "toast" + (type ? " toast--" + type : ""), role: "status" },
      el("span", { class: "tico", "aria-hidden": "true" }, icon),
      el("span", {}, message));
    host.append(node);
    setTimeout(() => {
      node.style.transition = "opacity .3s ease, transform .3s ease";
      node.style.opacity = "0";
      node.style.transform = "translateY(8px)";
      setTimeout(() => node.remove(), 300);
    }, 3200);
  }

  function downloadBlob(filename, blob) {
    if (typeof URL === "undefined" || !URL.createObjectURL) {
      toast("File download isn't available in this context.", "error");
      return false;
    }
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  }

  /* ==========================================================================
   * 7. Navigation
   * ======================================================================== */

  function go(view) {
    ui.view = Object.assign({ screen: "worlds", worldId: null, entityId: null }, view);
    if (view.worldId) store.activeId = view.worldId;
    render();
  }

  /* ==========================================================================
   * 8. Rendering
   * ======================================================================== */

  function render() {
    const app = document.getElementById("app");
    if (!app) return;
    app.innerHTML = "";
    app.dataset.screen = ui.view.screen;

    switch (ui.view.screen) {
      case "worlds": app.append(renderWorlds()); break;
      case "dashboard": app.append(renderDashboard()); break;
      case "wizard": app.append(renderWizard()); break;
      case "card": app.append(renderCard()); break;
      case "fw-pick": app.append(renderFrameworkPick()); break;
      case "fw-walk": app.append(renderFrameworkWalk()); break;
      case "fw-summary": app.append(renderFrameworkSummary()); break;
      default: app.append(renderWorlds());
    }
    renderHeader();
    window.scrollTo && window.scrollTo(0, 0);
  }

  function renderHeader() {
    const world = activeWorld();
    const box = document.getElementById("header-world");
    const nameEl = document.getElementById("header-world-name");
    if (!box || !nameEl) return;
    const show = world && ui.view.screen !== "worlds";
    box.hidden = !show;
    if (show) nameEl.textContent = world.name;
  }

  /* ---- Worlds screen (spec §7.1) ------------------------------------------ */

  function renderWorlds() {
    const wrap = el("div", { class: "screen" });
    wrap.append(el("div", { class: "screen-head" },
      el("div", { class: "eyebrow" }, "Your worlds"),
      el("h1", {}, "Worldbuilding, one card at a time"),
      el("p", { class: "lead" }, "Every world is a portable file you own. Build characters, settings, and events into shareable cards — then save the whole world as JSON and take it anywhere.")));

    wrap.append(el("div", { class: "worlds-toolbar" },
      el("button", { class: "btn", onClick: () => promptImport() },
        el("span", { "aria-hidden": "true" }, "⇪"), "Import a world"),
      store.projects.length ? el("span", { class: "eyebrow" }, store.projects.length + (store.projects.length === 1 ? " world" : " worlds")) : null));

    const grid = el("div", { class: "worlds-grid" });

    grid.append(el("button", { class: "world-card world-card--new", onClick: () => openNewWorldModal() },
      el("span", { class: "plus", "aria-hidden": "true" }, "＋"),
      el("strong", {}, "New world"),
      el("span", { class: "eyebrow" }, "Start from scratch")));

    for (const world of store.projects) {
      const counts = entityCounts(world);
      const card = el("div", { class: "world-card" });
      card.append(el("button", {
        class: "world-card__del", "aria-label": "Delete " + world.name, title: "Delete world",
        onClick: (e) => { e.stopPropagation(); confirmDeleteWorld(world); },
      }, "🗑"));
      const open = () => go({ screen: "dashboard", worldId: world.id });
      card.append(el("h3", {}, world.name));
      card.append(el("p", { class: "desc" }, world.desc || "No description yet."));
      const pills = el("div", { class: "counts" });
      for (const t of TYPE_ORDER) {
        if (!counts[t]) continue;
        pills.append(el("span", { class: "count-pill", dataset: { accent: t } },
          counts[t] + " " + (counts[t] === 1 ? singular(t) : TYPE_LABELS[t].toLowerCase())));
      }
      if (!world.entities.length) pills.append(el("span", { class: "count-pill" }, "empty"));
      card.append(pills);
      card.append(el("button", { class: "btn btn--sm btn--primary", onClick: open, style: "margin-top:.6rem;align-self:flex-start" }, "Open world →"));
      // Whole-card click (but not on buttons) also opens.
      card.addEventListener("click", (e) => { if (e.target.closest("button")) return; open(); });
      card.style.cursor = "pointer";
      grid.append(card);
    }

    wrap.append(grid);
    return wrap;
  }

  function singular(t) { return { character: "character", setting: "setting", event: "event", framework: "framework" }[t] || t; }

  /* ---- Dashboard (spec §7.2) ---------------------------------------------- */

  function renderDashboard() {
    const world = activeWorld();
    if (!world) { go({ screen: "worlds" }); return el("div"); }

    const wrap = el("div", { class: "screen" });

    const head = el("div", { class: "dash-head" });
    const left = el("div", {});
    left.append(el("div", { class: "eyebrow" }, "World dashboard"));
    left.append(el("h1", {}, world.name));
    if (world.desc) left.append(el("p", { class: "desc" }, world.desc));
    head.append(left);
    head.append(el("div", { class: "dash-actions" },
      el("button", { class: "btn", onClick: () => exportCSV(world) }, "Export CSV"),
      el("button", { class: "btn btn--primary", onClick: () => saveWorldJSON(world) }, "Save world (JSON)")));
    wrap.append(head);

    // Create strip
    const strip = el("div", { class: "create-strip" });
    for (const t of ENTITY_TYPES) {
      const schema = SCHEMAS[t];
      strip.append(el("button", { class: "create-tile", dataset: { accent: t }, onClick: () => openWizard(t) },
        el("span", { class: "k" }, "New " + t),
        el("span", { class: "t" }, schema.label),
        el("span", { class: "h" }, schema.blurb)));
    }
    strip.append(el("button", { class: "create-tile", dataset: { accent: "framework" }, onClick: () => go({ screen: "fw-pick" }) },
      el("span", { class: "k" }, "New framework"),
      el("span", { class: "t" }, "Story framework"),
      el("span", { class: "h" }, "Walk a plot structure, save the blueprint.")));
    wrap.append(strip);

    // Grouped entities
    const hasAny = world.entities.length > 0;
    if (!hasAny) {
      wrap.append(el("div", { class: "empty-state" },
        el("h3", {}, "An empty world, full of potential"),
        el("p", {}, "Every world starts with one card. Make a character who wants something, a place that resists them, or the event that changed everything."),
        el("button", { class: "btn btn--primary", onClick: () => openWizard("character") }, "Create your first character")));
      return wrap;
    }

    for (const t of TYPE_ORDER) {
      const items = world.entities.filter((e) => e.type === t);
      if (!items.length) continue;
      const group = el("section", { class: "entity-group", dataset: { accent: t } });
      group.append(el("div", { class: "entity-group__head" },
        el("span", { class: "dot", "aria-hidden": "true" }),
        el("h2", {}, TYPE_LABELS[t]),
        el("span", { class: "n" }, "· " + items.length)));
      const mini = el("div", { class: "mini-grid" });
      for (const e of items) {
        const sub = e.type === "framework"
          ? (e.frameworkName || "Blueprint")
          : (e.data.tagline || "No tagline yet");
        const meta = e.type === "framework"
          ? (e.summary || "framework")
          : SCHEMAS[e.type].label;
        mini.append(el("button", { class: "mini-card", dataset: { accent: t }, onClick: () => openEntity(e) },
          el("span", { class: "mc-name" }, e.name),
          el("span", { class: "mc-sub" }, sub),
          el("span", { class: "mc-meta" }, meta)));
      }
      group.append(mini);
      wrap.append(group);
    }
    return wrap;
  }

  function openEntity(e) {
    if (e.type === "framework") { openFrameworkEntity(e); return; }
    go({ screen: "card", worldId: activeWorld().id, entityId: e.id });
  }

  /* ---- Wizard (spec §7.3) ------------------------------------------------- */

  function openWizard(type, entityId) {
    const schema = SCHEMAS[type];
    const draft = {};
    let maxVisited = 0;
    if (entityId) {
      const e = activeWorld().entities.find((x) => x.id === entityId);
      for (const s of schema.steps) {
        const v = e.data[s.key];
        draft[s.key] = Array.isArray(v) ? v.slice() : v == null ? "" : v;
      }
      maxVisited = schema.steps.length - 1;
    } else {
      for (const s of schema.steps) draft[s.key] = s.type === "chips" ? [] : "";
    }
    ui.wizard = { type, entityId: entityId || null, stepIndex: 0, draft, maxVisited, errored: false };
    go({ screen: "wizard" });
  }

  function renderWizard() {
    const w = ui.wizard;
    if (!w || !activeWorld()) { go({ screen: "worlds" }); return el("div"); }
    const schema = SCHEMAS[w.type];
    const step = schema.steps[w.stepIndex];
    const isLast = w.stepIndex === schema.steps.length - 1;

    const wrap = el("div", { class: "wizard", dataset: { accent: w.type } });

    // Left rail
    const rail = el("aside", { class: "wiz-rail" });
    rail.append(el("div", { class: "eyebrow" }, w.entityId ? "Editing " + w.type : schema.eyebrow));
    rail.append(el("div", { class: "wiz-rail__title" }, w.draft[schema.nameField] || schema.label));
    rail.append(el("div", { class: "wiz-rail__sub" }, "Step " + (w.stepIndex + 1) + " of " + schema.steps.length));
    const steps = el("ol", { class: "wiz-steps" });
    schema.steps.forEach((s, i) => {
      const cls = "wiz-step" + (i === w.stepIndex ? " is-active" : "") + (i < w.stepIndex || (i <= w.maxVisited && i !== w.stepIndex) ? " is-done" : "");
      const reachable = i <= w.maxVisited;
      steps.append(el("li", {},
        el("button", { class: cls, disabled: !reachable, onClick: () => wizardGoTo(i) },
          el("span", { class: "num", "aria-hidden": "true" }, (i < w.stepIndex || i <= w.maxVisited) ? "" : String(i + 1)),
          el("span", {}, s.label))));
    });
    rail.append(steps);
    wrap.append(rail);

    // Panel
    const panel = el("div", { class: "wiz-panel" });
    panel.append(el("div", { class: "eyebrow wiz-panel__eyebrow" }, step.label));
    panel.append(el("h2", {}, stepHeadline(w.type, step)));

    // Lesson
    const lesson = el("div", { class: "lesson" });
    lesson.append(el("div", { class: "lesson__label" }, el("span", { "aria-hidden": "true" }, "✎"), "Why this matters"));
    lesson.append(el("div", { class: "lesson__body", html: step.teach }));
    if (step.example) {
      lesson.append(el("div", { class: "lesson__eg" },
        el("span", { class: "eg-k" }, "Example"),
        el("span", { class: "eg-v" }, step.example)));
    }
    panel.append(lesson);

    // Field
    panel.append(renderField(step, w));

    // Nav
    const nav = el("div", { class: "wiz-nav" });
    nav.append(el("button", { class: "btn btn--ghost", onClick: () => wizardBack() },
      w.stepIndex === 0 ? "← Cancel" : "← Back"));
    nav.append(el("div", { style: "display:flex;gap:.5rem;align-items:center" },
      isLast
        ? el("button", { class: "btn btn--primary", onClick: () => commitEntity() }, w.entityId ? "Save changes ✓" : "Create card ✦")
        : el("button", { class: "btn btn--accent", onClick: () => wizardNext() }, "Next →")));
    panel.append(nav);

    wrap.append(panel);
    return wrap;
  }

  function stepHeadline(type, step) {
    // A friendlier headline than the bare field label.
    const map = {
      name: "Name it", role: "What's their job in the plot?", want: "What do they want?",
      need: "What do they actually need?", flaw: "What's their fatal flaw?", voice: "How do they carry themselves?",
      traits: "The telling details", tagline: "Sum it up in one line",
      scale: "How big is this place?", mood: "What does it feel like?", senses: "Make it sensory",
      conflict: "What's the tension here?", detail: "Landmarks & rules",
      when: "When does it happen?", kind: "What kind of event?", who: "Who's involved?",
      what: "What actually happens?", consequence: "What changes afterward?",
    };
    return map[step.key] || step.label;
  }

  function renderField(step, w) {
    const field = el("div", { class: "field" + (w.errored && step.required ? " is-invalid" : "") });
    const labelRow = el("label", { for: "f-" + step.key }, step.label);
    if (step.required) labelRow.append(el("span", { class: "req" }, " *"));
    field.append(labelRow);

    if (step.type === "text") {
      field.append(el("input", {
        type: "text", id: "f-" + step.key, value: w.draft[step.key] || "", placeholder: step.placeholder || "",
        onInput: (e) => setField(step.key, e.target.value),
        onKeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); wizardAdvanceOrCommit(); } },
      }));
    } else if (step.type === "textarea") {
      field.append(el("textarea", {
        id: "f-" + step.key, placeholder: step.placeholder || "",
        onInput: (e) => setField(step.key, e.target.value),
      }, w.draft[step.key] || ""));
    } else if (step.type === "choice") {
      const box = el("div", { class: "choices", role: "radiogroup", "aria-label": step.label });
      step.choices.forEach((c) => {
        const selected = w.draft[step.key] === c.value;
        box.append(el("button", {
          class: "choice" + (selected ? " is-selected" : ""), role: "radio", "aria-checked": selected ? "true" : "false",
          onClick: () => { setField(step.key, c.value); render(); },
        },
          el("span", { class: "choice__radio", "aria-hidden": "true" }),
          el("span", {}, el("span", { class: "choice__label" }, c.value), c.hint ? el("span", { class: "choice__hint" }, " — " + c.hint) : null)));
      });
      field.append(box);
    } else if (step.type === "chips") {
      field.append(renderChipsInput(step, w));
    }

    if (w.errored && step.required) field.append(el("div", { class: "field__error" }, step.label + " is required to continue."));
    return field;
  }

  function renderChipsInput(step, w) {
    const list = Array.isArray(w.draft[step.key]) ? w.draft[step.key] : [];
    const box = el("div", { class: "chips-input" });

    function addChip(val) {
      const v = val.trim();
      if (!v) return;
      const arr = w.draft[step.key];
      if (arr.some((x) => x.toLowerCase() === v.toLowerCase())) return;
      arr.push(v);
      input.before(makeChip(v));
      input.value = "";
    }
    function makeChip(v) {
      return el("span", { class: "chip" }, v,
        el("button", { type: "button", "aria-label": "Remove " + v, onClick: (e) => {
          e.target.closest(".chip").remove();
          const arr = w.draft[step.key];
          const idx = arr.findIndex((x) => x === v);
          if (idx >= 0) arr.splice(idx, 1);
        } }, "×"));
    }

    for (const v of list) box.append(makeChip(v));
    const input = el("input", {
      type: "text", id: "f-" + step.key, placeholder: step.placeholder || "Type and press Enter",
      onKeydown: (e) => {
        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addChip(input.value); }
        else if (e.key === "Backspace" && input.value === "" && w.draft[step.key].length) {
          w.draft[step.key].pop();
          const chips = box.querySelectorAll(".chip");
          if (chips.length) chips[chips.length - 1].remove();
        }
      },
      onBlur: () => { if (input.value.trim()) addChip(input.value); },
    });
    box.append(input);
    return box;
  }

  function setField(key, value) {
    if (!ui.wizard) return;
    ui.wizard.draft[key] = value;
    if (ui.wizard.errored) ui.wizard.errored = false;
  }

  function wizardGoTo(i) {
    if (!ui.wizard || i > ui.wizard.maxVisited) return;
    ui.wizard.stepIndex = i;
    ui.wizard.errored = false;
    render();
  }

  function currentStep() { return SCHEMAS[ui.wizard.type].steps[ui.wizard.stepIndex]; }

  function stepValueEmpty(step) {
    const v = ui.wizard.draft[step.key];
    return v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");
  }

  function wizardNext() {
    const step = currentStep();
    if (step.required && stepValueEmpty(step)) {
      ui.wizard.errored = true;
      toast('"' + step.label + '" is required.', "error");
      render();
      return;
    }
    const schema = SCHEMAS[ui.wizard.type];
    if (ui.wizard.stepIndex < schema.steps.length - 1) {
      ui.wizard.stepIndex++;
      ui.wizard.maxVisited = Math.max(ui.wizard.maxVisited, ui.wizard.stepIndex);
      ui.wizard.errored = false;
      render();
    }
  }

  function wizardAdvanceOrCommit() {
    const schema = SCHEMAS[ui.wizard.type];
    if (ui.wizard.stepIndex === schema.steps.length - 1) commitEntity();
    else wizardNext();
  }

  function wizardBack() {
    if (!ui.wizard) return;
    if (ui.wizard.stepIndex === 0) { go({ screen: "dashboard", worldId: activeWorld().id }); return; }
    ui.wizard.stepIndex--;
    ui.wizard.errored = false;
    render();
  }

  function commitEntity() {
    const w = ui.wizard;
    const schema = SCHEMAS[w.type];
    // Full required validation (spec §7.3).
    for (let i = 0; i < schema.steps.length; i++) {
      const s = schema.steps[i];
      const v = w.draft[s.key];
      if (s.required && (v == null || (Array.isArray(v) ? !v.length : String(v).trim() === ""))) {
        w.stepIndex = i;
        w.errored = true;
        toast('"' + s.label + '" is required.', "error");
        render();
        return null;
      }
    }
    const world = activeWorld();
    let entity;
    if (w.entityId) entity = world.entities.find((e) => e.id === w.entityId);
    if (!entity) { entity = { id: uid("ent"), type: w.type, created: Date.now(), data: {} }; world.entities.push(entity); }
    const data = {};
    for (const s of schema.steps) {
      let v = w.draft[s.key];
      if (Array.isArray(v)) v = v.slice();
      if (v != null && v !== "") data[s.key] = v;
    }
    entity.data = data;
    entity.name = data[schema.nameField] || "Untitled";
    toast((w.entityId ? "Updated " : "Created ") + entity.name, "success");
    ui.wizard = null;
    go({ screen: "card", worldId: world.id, entityId: entity.id });
    return entity;
  }

  /* ---- Card (spec §7.4) — the hero output --------------------------------- */

  function renderCard() {
    const world = activeWorld();
    const entity = world && world.entities.find((e) => e.id === ui.view.entityId);
    if (!entity) { go({ screen: "dashboard", worldId: world && world.id }); return el("div"); }
    const m = cardModel(entity, world);

    const wrap = el("div", { class: "card-screen", dataset: { accent: entity.type } });
    wrap.append(el("div", { class: "card-stage" }, buildCardDOM(m)));
    wrap.append(el("div", { class: "card-actions" },
      el("button", { class: "btn", onClick: () => go({ screen: "dashboard", worldId: world.id }) }, "← Back to world"),
      el("button", { class: "btn", onClick: () => openWizard(entity.type, entity.id) }, "✎ Edit"),
      el("button", { class: "btn btn--accent", onClick: () => downloadCardImage(entity, world) }, "⬇ Download as image"),
      el("button", { class: "btn btn--danger", onClick: () => confirmDeleteEntity(world, entity) }, "Delete")));
    return wrap;
  }

  function buildCardDOM(m) {
    const card = el("article", { class: "story-card", dataset: { accent: m.type } });
    const banner = el("header", { class: "story-card__banner" },
      el("div", { class: "story-card__type" }, m.typeLabel),
      el("h2", { class: "story-card__name" }, m.name),
      m.tagline ? el("div", { class: "story-card__tagline" }, "“" + m.tagline + "”") : null);
    card.append(banner);

    const body = el("div", { class: "story-card__body" });
    for (const row of m.rows) {
      const v = row.chips
        ? el("div", { class: "card-chips" }, row.chips.map((c) => el("span", { class: "card-chip" }, c)))
        : el("span", {}, row.value);
      body.append(el("div", { class: "card-row" },
        el("div", { class: "card-row__k" }, row.label),
        el("div", { class: "card-row__v" }, v)));
    }
    card.append(body);
    card.append(el("footer", { class: "story-card__footer" },
      el("span", { class: "fmark" }, el("span", { class: "fdot", "aria-hidden": "true" }), m.worldName),
      el("span", {}, "Storyframe")));
    return card;
  }

  /* ---- PNG export via SVG foreignObject + canvas (spec §8) ----------------- */

  function hexToRgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) { return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join(""); }
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }

  // Self-contained inline-styled card markup (no CSS vars / color-mix) so the
  // SVG rasterizes reliably across engines.
  function cardStandaloneHTML(m, width) {
    const accent = m.accent;
    const dark = mix(accent, "#000000", 0.2);
    const tint = mix(accent, "#fdfaf3", 0.86);
    const chipText = mix(accent, "#2a2521", 0.2);
    const serif = "'Fraunces','Iowan Old Style',Georgia,serif";
    const sans = "'Inter',-apple-system,'Segoe UI',sans-serif";
    const mono = "'JetBrains Mono',Consolas,monospace";
    const rowsHtml = m.rows.map((row) => {
      let val;
      if (row.chips) {
        val = '<div style="display:flex;flex-wrap:wrap;gap:5px;">' +
          row.chips.map((c) => '<span style="font-size:11px;font-weight:500;padding:2px 9px;border-radius:999px;background:' + tint + ';color:' + chipText + ';border:1px solid ' + mix(accent, "#ffffff", 0.55) + ';">' + escapeHtml(c) + "</span>").join("") + "</div>";
      } else {
        val = '<span style="font-size:14px;color:#2a2521;line-height:1.45;">' + escapeHtml(row.value) + "</span>";
      }
      return '<div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid #eee3d0;">' +
        '<div style="width:88px;flex:none;font-family:' + mono + ';font-size:10px;text-transform:uppercase;letter-spacing:1px;color:' + accent + ';font-weight:600;padding-top:2px;">' + escapeHtml(row.label) + "</div>" +
        '<div style="flex:1;">' + val + "</div></div>";
    }).join("");
    const taglineHtml = m.tagline ? '<div style="font-family:' + serif + ';font-style:italic;font-size:15px;opacity:.96;">“' + escapeHtml(m.tagline) + "”</div>" : "";
    return '' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + width + 'px;font-family:' + sans + ';background:#fdfaf3;border-radius:18px;overflow:hidden;border:1px solid #e2d7c1;">' +
        '<div style="background:linear-gradient(135deg,' + accent + "," + dark + ');color:#ffffff;padding:22px 24px 20px;">' +
          '<div style="font-family:' + mono + ';font-size:10px;letter-spacing:2px;text-transform:uppercase;opacity:.92;">' + escapeHtml(m.typeLabel) + "</div>" +
          '<div style="font-family:' + serif + ';font-size:28px;font-weight:700;line-height:1.08;margin:6px 0 4px;">' + escapeHtml(m.name) + "</div>" +
          taglineHtml +
        "</div>" +
        '<div style="padding:18px 24px 8px;">' + rowsHtml + "</div>" +
        '<div style="display:flex;justify-content:space-between;padding:12px 24px 16px;border-top:1px solid #eee3d0;font-family:' + mono + ';font-size:10px;letter-spacing:.5px;color:#8d8375;">' +
          "<span>" + escapeHtml(m.worldName) + "</span><span>Storyframe Studio</span>" +
        "</div>" +
      "</div>";
  }

  function downloadCardImage(entity, world) {
    const m = cardModel(entity, world);
    const live = document.querySelector(".story-card");
    if (!live || typeof live.getBoundingClientRect !== "function" || typeof document.createElement("canvas").getContext !== "function") {
      toast("Image export isn't supported in this browser — try Save world (JSON) instead.", "error");
      return;
    }
    const rect = live.getBoundingClientRect();
    const width = Math.max(360, Math.round(rect.width || 440));
    const height = Math.max(300, Math.ceil(rect.height || 520)) + 4;
    const inner = cardStandaloneHTML(m, width);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
      '<foreignObject x="0" y="0" width="' + width + '" height="' + height + '">' + inner + "</foreignObject></svg>";
    const scale = 2;
    const img = new Image();
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    img.onload = function () {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(function (blob) {
          if (blob) { downloadBlob(slugify(m.name) + ".png", blob); toast("Card image downloaded", "success"); }
          else toast("Couldn't produce a PNG here.", "error");
        }, "image/png");
      } catch (_e) {
        toast("Couldn't render the card image in this browser.", "error");
      }
    };
    img.onerror = function () { toast("Couldn't render the card image.", "error"); };
    img.src = url;
  }

  /* ---- Framework: pick / walk / summary (spec §6, §7.5) ------------------- */

  function renderFrameworkPick() {
    const world = activeWorld();
    const wrap = el("div", { class: "screen" });
    wrap.append(el("div", { class: "screen-head" },
      el("div", { class: "eyebrow" }, "Story frameworks"),
      el("h1", {}, "Walk a structure, one decision at a time"),
      el("p", { class: "lead" }, "Pick a proven plot shape. You'll move through it beat by beat with a craft lesson at each step, then save the blueprint into your world.")));
    const grid = el("div", { class: "fw-pick-grid" });
    for (const key of Object.keys(FRAMEWORKS)) {
      const fw = FRAMEWORKS[key];
      grid.append(el("button", { class: "fw-pick-card", onClick: () => startFramework(key) },
        el("span", { class: "fw-meta" }, fw.nodes.length + " beats"),
        el("h3", {}, fw.name),
        el("p", {}, fw.blurb)));
    }
    wrap.append(grid);
    wrap.append(el("div", { style: "margin-top:1.6rem" },
      el("button", { class: "btn btn--ghost", onClick: () => go({ screen: "dashboard", worldId: world.id }) }, "← Back to world")));
    return wrap;
  }

  function startFramework(key) {
    ui.fw = { key, stepIndex: 0, answers: {}, editingId: null };
    go({ screen: "fw-walk" });
  }

  function openFrameworkEntity(entity) {
    // Load a saved blueprint into a read/continue state and jump to its summary.
    ui.fw = { key: entity.frameworkKey, stepIndex: 0, answers: JSON.parse(JSON.stringify(entity.answers || {})), editingId: entity.id };
    go({ screen: "fw-summary" });
  }

  function fwAnswer() {
    const a = ui.fw.answers[ui.fw.stepIndex] || { choice: null, note: "" };
    ui.fw.answers[ui.fw.stepIndex] = a;
    return a;
  }

  function renderFrameworkWalk() {
    const world = activeWorld();
    const fw = FRAMEWORKS[ui.fw.key];
    const node = fw.nodes[ui.fw.stepIndex];
    const maxReached = Math.max.apply(null, [0].concat(Object.keys(ui.fw.answers).map(Number)), ui.fw.stepIndex);

    const wrap = el("div", { class: "fw-walk" });

    // Rail
    const rail = el("aside", { class: "fw-rail" });
    rail.append(el("div", { class: "eyebrow" }, fw.name));
    rail.append(el("div", { class: "wiz-rail__title" }, "Progress"));
    const prog = el("ol", { class: "fw-progress" });
    fw.nodes.forEach((n, i) => {
      const done = ui.fw.answers[i] && (ui.fw.answers[i].note || ui.fw.answers[i].choice != null);
      const cls = (i === ui.fw.stepIndex ? "is-active" : "") + (done ? " is-done" : "");
      const reachable = i <= maxReached;
      prog.append(el("li", { class: cls },
        el("button", { disabled: !reachable, onClick: () => fwGoTo(i) },
          el("span", { class: "pnum" }, String(i + 1)),
          el("span", {}, n.title))));
    });
    rail.append(prog);
    wrap.append(rail);

    // Panel
    const panel = el("div", { class: "wiz-panel", dataset: { accent: "framework" } });
    panel.append(el("div", { class: "eyebrow wiz-panel__eyebrow", style: "color:var(--c-framework)" }, node.step + " · Beat " + (ui.fw.stepIndex + 1) + " of " + fw.nodes.length));
    panel.append(el("h2", {}, node.title));

    const lesson = el("div", { class: "lesson", style: "--accent:var(--c-framework)" });
    lesson.append(el("div", { class: "lesson__label" }, el("span", { "aria-hidden": "true" }, "✎"), "Craft lesson"));
    lesson.append(el("div", { class: "lesson__body", html: node.teach }));
    if (node.example) lesson.append(el("div", { class: "lesson__eg" }, el("span", { class: "eg-k" }, "Example"), el("span", { class: "eg-v" }, node.example)));
    panel.append(lesson);

    const a = fwAnswer();

    if (node.choices) {
      const field = el("div", { class: "field" });
      field.append(el("label", {}, "Choose an approach"));
      const box = el("div", { class: "choices" });
      node.choices.forEach((c, i) => {
        const selected = a.choice === i;
        box.append(el("button", {
          class: "choice" + (selected ? " is-selected" : ""), role: "radio", "aria-checked": selected ? "true" : "false",
          style: selected ? "--accent:var(--c-framework)" : "",
          onClick: () => { a.choice = selected ? null : i; render(); },
        }, el("span", { class: "choice__radio", "aria-hidden": "true", style: "--accent:var(--c-framework)" }), el("span", { class: "choice__label" }, c.value)));
      });
      field.append(box);
      panel.append(field);
    }

    const noteField = el("div", { class: "field" });
    noteField.append(el("label", { for: "fw-note" }, node.choices ? "Your notes" : "Your decision"));
    noteField.append(el("textarea", { id: "fw-note", placeholder: node.notePlaceholder || "Write your decision for this beat…", onInput: (e) => { a.note = e.target.value; } }, a.note || ""));
    panel.append(noteField);

    const isLast = ui.fw.stepIndex === fw.nodes.length - 1;
    const nav = el("div", { class: "wiz-nav" });
    nav.append(el("button", { class: "btn btn--ghost", onClick: () => fwBack() }, ui.fw.stepIndex === 0 ? "← Frameworks" : "← Back"));
    nav.append(el("div", { style: "display:flex;gap:.5rem" },
      el("button", { class: "btn", onClick: () => go({ screen: "fw-summary" }) }, "Skip to summary"),
      isLast
        ? el("button", { class: "btn btn--primary", onClick: () => go({ screen: "fw-summary" }) }, "Review blueprint ✦")
        : el("button", { class: "btn btn--accent", style: "--accent:var(--c-framework)", onClick: () => fwNext() }, "Next beat →")));
    panel.append(nav);

    wrap.append(panel);
    return wrap;
  }

  function fwGoTo(i) { ui.fw.stepIndex = i; render(); }
  function fwNext() {
    const fw = FRAMEWORKS[ui.fw.key];
    if (ui.fw.stepIndex < fw.nodes.length - 1) { ui.fw.stepIndex++; render(); }
    else go({ screen: "fw-summary" });
  }
  function fwBack() {
    if (ui.fw.stepIndex === 0) { go({ screen: "fw-pick" }); return; }
    ui.fw.stepIndex--; render();
  }

  function renderFrameworkSummary() {
    const world = activeWorld();
    const fw = FRAMEWORKS[ui.fw.key];
    const wrap = el("div", { class: "screen" });

    wrap.append(el("div", { class: "screen-head" },
      el("div", { class: "eyebrow" }, fw.name + " · blueprint"),
      el("h1", {}, ui.fw.editingId ? entityName(ui.fw.editingId) : "Your plot blueprint"),
      el("p", { class: "lead" }, "Every decision you made, in order. Save it into your world as a framework card, or export it as text.")));

    const list = el("div", { class: "fw-summary-list" });
    fw.nodes.forEach((node, i) => {
      const a = ui.fw.answers[i] || {};
      const item = el("div", { class: "fw-summary-item" });
      item.append(el("div", { class: "si-step" }, node.step + " · Beat " + (i + 1)));
      item.append(el("h3", {}, node.title));
      if (node.choices && a.choice != null && node.choices[a.choice]) item.append(el("div", { class: "si-choice" }, node.choices[a.choice].value));
      if (a.note && a.note.trim()) item.append(el("div", { class: "si-note" }, a.note.trim()));
      else if (!(node.choices && a.choice != null)) item.append(el("div", { class: "si-empty" }, "Not yet decided — you can come back to this beat."));
      // Make each beat clickable to revisit.
      item.style.cursor = "pointer";
      item.addEventListener("click", () => { ui.fw.stepIndex = i; go({ screen: "fw-walk" }); });
      list.append(item);
    });
    wrap.append(list);

    const actions = el("div", { class: "card-actions", style: "justify-content:flex-start;margin-top:1.6rem" });
    actions.append(el("button", { class: "btn btn--ghost", onClick: () => go({ screen: "fw-walk" }) }, "← Keep editing"));
    actions.append(el("button", { class: "btn", onClick: () => exportFrameworkText() }, "⬇ Export as text"));
    actions.append(el("button", { class: "btn btn--primary", onClick: () => saveFrameworkToWorld() }, ui.fw.editingId ? "Update blueprint in world ✓" : "Save into world ✦"));
    if (world) actions.append(el("button", { class: "btn btn--ghost", onClick: () => go({ screen: "dashboard", worldId: world.id }) }, "Back to world"));
    wrap.append(actions);
    return wrap;
  }

  function entityName(id) {
    const w = activeWorld();
    const e = w && w.entities.find((x) => x.id === id);
    return e ? e.name : "Blueprint";
  }

  function exportFrameworkText() {
    const fw = FRAMEWORKS[ui.fw.key];
    const name = ui.fw.editingId ? entityName(ui.fw.editingId) : fw.name;
    const text = frameworkPlaintext(fw, ui.fw.answers, name);
    downloadBlob(slugify(name) + "-blueprint.txt", new Blob([text], { type: "text/plain" }));
  }

  function saveFrameworkToWorld() {
    const world = activeWorld();
    if (!world) { toast("Open a world first.", "error"); return; }
    const fw = FRAMEWORKS[ui.fw.key];
    formModal({
      title: ui.fw.editingId ? "Update blueprint" : "Save blueprint into world",
      fields: [{ key: "name", label: "Name this blueprint", type: "text", required: true, value: ui.fw.editingId ? entityName(ui.fw.editingId) : fw.name, placeholder: "e.g. Main plot — Three-Act" }],
      submitLabel: "Save",
      onSubmit: (vals) => {
        let entity = ui.fw.editingId ? world.entities.find((e) => e.id === ui.fw.editingId) : null;
        entity = buildFrameworkEntity(ui.fw.key, ui.fw.answers, vals.name, entity);
        if (!ui.fw.editingId) world.entities.push(entity);
        toast("Blueprint saved into " + world.name, "success");
        ui.fw = null;
        go({ screen: "dashboard", worldId: world.id });
      },
    });
  }

  /* ==========================================================================
   * 9. Persistence & exports (spec §8)
   * ======================================================================== */

  function saveWorldJSON(world) {
    const ok = downloadBlob(slugify(world.name) + ".storyframe.json", new Blob([serializeWorld(world)], { type: "application/json" }));
    if (ok) toast("Saved " + world.name, "success");
  }

  function exportCSV(world) {
    if (!world.entities.length) { toast("Nothing to export yet — make a card first.", "error"); return; }
    const ok = downloadBlob(slugify(world.name) + "-world.csv", new Blob([worldToCSV(world)], { type: "text/csv" }));
    if (ok) toast("Exported CSV", "success");
  }

  function promptImport() {
    const input = document.getElementById("file-input");
    if (!input) return;
    input.value = "";
    input.onchange = () => { if (input.files && input.files[0]) handleImportFile(input.files[0]); };
    input.click();
  }

  function handleImportFile(file) {
    if (!/\.json$/i.test(file.name)) { toast("Please choose a .json world file.", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const world = addImportedWorld(importWorldFromJSON(String(reader.result)));
        toast("Loaded " + world.name, "success");
        go({ screen: "dashboard", worldId: world.id });
      } catch (err) {
        toast(err.message || "Couldn't read that file.", "error");
      }
    };
    reader.onerror = () => toast("Couldn't read that file.", "error");
    reader.readAsText(file);
  }

  /* ==========================================================================
   * 10. Modals
   * ======================================================================== */

  function openModal(contentNode) {
    closeModal();
    const overlay = el("div", { class: "modal-overlay", id: "modal-overlay",
      onClick: (e) => { if (e.target === overlay) closeModal(); } });
    overlay.append(contentNode);
    document.body.append(overlay);
    document.addEventListener("keydown", escToClose);
    const focusable = contentNode.querySelector("input, textarea, button");
    if (focusable && focusable.focus) setTimeout(() => focusable.focus(), 20);
  }
  function closeModal() {
    const o = document.getElementById("modal-overlay");
    if (o) o.remove();
    document.removeEventListener("keydown", escToClose);
  }
  function escToClose(e) { if (e.key === "Escape") closeModal(); }

  function confirmModal(opts) {
    const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true" });
    modal.append(el("h3", {}, opts.title));
    modal.append(el("p", {}, opts.message));
    modal.append(el("div", { class: "modal__actions" },
      el("button", { class: "btn btn--ghost", onClick: closeModal }, "Cancel"),
      el("button", { class: "btn " + (opts.danger ? "btn--danger" : "btn--primary"), onClick: () => { closeModal(); opts.onConfirm(); } }, opts.confirmLabel || "Confirm")));
    openModal(modal);
  }

  function formModal(opts) {
    const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true" });
    modal.append(el("h3", {}, opts.title));
    const inputs = {};
    const form = el("form", { onSubmit: (e) => { e.preventDefault(); submit(); } });
    for (const f of opts.fields) {
      const field = el("div", { class: "field" });
      field.append(el("label", { for: "m-" + f.key }, f.label, f.required ? el("span", { class: "req" }, " *") : null));
      const input = f.type === "textarea"
        ? el("textarea", { id: "m-" + f.key, placeholder: f.placeholder || "" }, f.value || "")
        : el("input", { type: "text", id: "m-" + f.key, value: f.value || "", placeholder: f.placeholder || "" });
      inputs[f.key] = input;
      field.append(input);
      form.append(field);
    }
    form.append(el("div", { class: "modal__actions" },
      el("button", { class: "btn btn--ghost", type: "button", onClick: closeModal }, "Cancel"),
      el("button", { class: "btn btn--primary", type: "submit" }, opts.submitLabel || "Save")));
    modal.append(form);

    function submit() {
      const vals = {};
      for (const f of opts.fields) {
        vals[f.key] = inputs[f.key].value.trim();
        if (f.required && !vals[f.key]) { toast(f.label + " is required.", "error"); inputs[f.key].focus(); return; }
      }
      closeModal();
      opts.onSubmit(vals);
    }
    openModal(modal);
  }

  function openNewWorldModal() {
    formModal({
      title: "Create a new world",
      fields: [
        { key: "name", label: "World name", type: "text", required: true, placeholder: "e.g. The Ashfall Chronicles" },
        { key: "desc", label: "One-line description", type: "textarea", placeholder: "What kind of world is this?" },
      ],
      submitLabel: "Create world",
      onSubmit: (vals) => {
        const world = createWorld(vals.name, vals.desc);
        toast("Created " + world.name, "success");
        go({ screen: "dashboard", worldId: world.id });
      },
    });
  }

  function confirmDeleteWorld(world) {
    confirmModal({
      title: "Delete this world?",
      message: '"' + world.name + '" and its ' + world.entities.length + " card(s) will be removed from this session. If you haven't saved it as JSON, this can't be undone.",
      confirmLabel: "Delete world", danger: true,
      onConfirm: () => { deleteWorld(world.id); toast("Deleted " + world.name); go({ screen: "worlds" }); },
    });
  }

  function confirmDeleteEntity(world, entity) {
    confirmModal({
      title: "Delete this card?",
      message: '"' + entity.name + '" will be removed from this world.',
      confirmLabel: "Delete card", danger: true,
      onConfirm: () => { deleteEntity(world, entity.id); toast("Deleted " + entity.name); go({ screen: "dashboard", worldId: world.id }); },
    });
  }

  /* ==========================================================================
   * 11. Demo seed (spec §11) — one populated world for screenshots/testing
   * ======================================================================== */

  function seedDemo() {
    const world = createWorld("The Ashfall Chronicles", "A harbor city built in a dead volcano's crater.");
    store.activeId = world.id;

    world.entities.push(normalizeEntity({
      type: "character", name: "Kestrel Vance",
      data: {
        name: "Kestrel Vance",
        role: "Antagonist-shaped mentor — collects the debt that trains the hero",
        want: "To settle the North Fleet's debt before the Guild replaces him with someone crueler.",
        need: "To forgive himself for the drowning he helped order, and to trust his conscience over an order.",
        flaw: "Mistakes obedience for virtue — will carry out a cruel command rather than defy it.",
        voice: "Guarded / dry",
        traits: ["Counts the exits", "Keeps his old prayer beads", "Never raises his voice"],
        tagline: "A holy man's conscience in a debt-collector's coat.",
      },
    }));

    world.entities.push(normalizeEntity({
      type: "setting", name: "The Ashfall Market",
      data: {
        name: "The Ashfall Market",
        scale: "District / town",
        mood: "Feverish and transactional — everyone here is mid-deal, and the air knows it.",
        senses: "Warm ash drifts like snow; sulfur and frying oil; a dozen tongues shouting prices over the clang of the Ash Gate.",
        conflict: "The Guild taxes every sale but can't stop the smuggling it depends on — so everyone's guilty and everyone's protected.",
        detail: ["The Ash Gate", "No open flame after dusk", "The vendor who sells secrets"],
        tagline: "A marketplace where everything's for sale except the truth.",
      },
    }));

    world.entities.push(normalizeEntity({
      type: "event", name: "The Drowning of the North Fleet",
      data: {
        name: "The Drowning of the North Fleet",
        when: "Seven years before the story opens — the winter of the false tide.",
        kind: "Catastrophe",
        who: ["Kestrel Vance", "Admiral Sorne", "the harbor children"],
        what: "The Guild ordered the tide-gates opened to sink a debtor fleet; the fleet and the dockside quarter behind it went under before dawn.",
        consequence: "The harbor never trusted the Guild again, and Kestrel left the priesthood the next morning.",
        tagline: "The night the sea was ordered to kill.",
      },
    }));

    const answers = {
      0: { choice: null, note: "Kestrel works the Ashfall Market collecting Guild debts — respected, efficient, and quietly hollow." },
      1: { choice: 0, note: "A dying debtor presses a ledger into his hands: proof the North Fleet was murdered, not lost." },
      2: { choice: null, note: "He hides the ledger instead of surrendering it — and now can't take it back." },
      3: { choice: 2, note: "Chasing the truth wins him the harbor's trust, until he learns the drowning order bears his old mentor's seal." },
      4: { choice: null, note: "His obedience costs him the one ally who believed him; the ledger is seized." },
      5: { choice: 0, note: "He defies a Guild order for the first time in his life and exposes the drowning in open market." },
    };
    world.entities.push(buildFrameworkEntity("threeAct", answers, "Main plot — The Reckoning"));

    return world;
  }

  /* ==========================================================================
   * 12. Init + public API (for the headless test and screenshot seeding)
   * ======================================================================== */

  function setupDragAndDrop() {
    let depth = 0;
    document.addEventListener("dragenter", (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault(); depth++; document.body.classList.add("is-dragging");
    });
    document.addEventListener("dragover", (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault(); });
    document.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove("is-dragging"); });
    document.addEventListener("drop", (e) => {
      if (!e.dataTransfer) return;
      e.preventDefault(); depth = 0; document.body.classList.remove("is-dragging");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0]);
    });
  }

  function init() {
    const brand = document.getElementById("brand-home");
    if (brand) brand.addEventListener("click", () => go({ screen: "worlds" }));
    const save = document.getElementById("header-save");
    if (save) save.addEventListener("click", () => { const w = activeWorld(); if (w) saveWorldJSON(w); });
    setupDragAndDrop();

    // Optional demo seed path (spec §11) — ?demo=1 seeds a populated world.
    try {
      if (typeof location !== "undefined" && /[?&]demo=1\b/.test(location.search)) seedDemo();
    } catch (_e) { /* no-op */ }

    render();
  }

  // Public API — the ONLY sanctioned way in. Tests and the screenshot script
  // call these same functions the UI buttons call (spec §10 "drives real code").
  window.__SF = {
    store, ui, SCHEMAS, FRAMEWORKS,
    go, render, seedDemo,
    // data ops
    createWorld, deleteWorld, importWorldFromJSON, addImportedWorld,
    serializeWorld, worldToCSV, cardModel, buildFrameworkEntity,
    activeWorld, entityCounts,
    // reset for test isolation
    reset: function () { store.projects.length = 0; store.activeId = null; ui.wizard = null; ui.fw = null; ui.view = { screen: "worlds", worldId: null, entityId: null }; },
    // UI-driving actions (same code paths as the buttons)
    actions: {
      newWorld: function (name, desc) { const w = createWorld(name, desc); go({ screen: "dashboard", worldId: w.id }); return w; },
      openWizard: openWizard,
      setField: setField,
      wizardNext: wizardNext,
      wizardBack: wizardBack,
      commit: commitEntity,
      openCard: function (id) { go({ screen: "card", worldId: activeWorld().id, entityId: id }); },
      startFramework: startFramework,
      fwSetChoice: function (i) { fwAnswer().choice = i; },
      fwSetNote: function (t) { fwAnswer().note = t; },
      fwNext: fwNext,
      fwSummary: function () { go({ screen: "fw-summary" }); },
      openFrameworkPick: function () { go({ screen: "fw-pick" }); },
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

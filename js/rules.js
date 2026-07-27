/* ============================================================================
 * rules.js — Human-readable rules + machine-readable LLM spec for Pokelike v2.
 *
 * Two audiences:
 *   • Humans  → openRulesModal() renders a formatted, readable guide.
 *   • Robots  → window.POKELIKE_RULES (and <script id="pokelike-llm-spec">)
 *               expose a compact JSON spec describing the rules AND how to
 *               drive the game through the DOM, so an LLM can play it.
 * ==========================================================================*/

const POKELIKE_RULES = {
  game: "Pokelike v2",
  fork_of: "https://pokelike.xyz/",
  summary:
    "A client-side Pokémon roguelike. Pick a generation and a mode, choose a starter, " +
    "then climb a branching node map across several maps. Each map ends in a Gym Leader; " +
    "the final map ends in the Elite Four + Champion. Win battles, level up, catch Pokémon, " +
    "and become Champion. Lose all your Pokémon and the run is over (Nuzlocke is permadeath).",

  objective:
    "Beat all 8 Gym Leaders across the maps, then defeat the Elite Four and the Champion on the final map.",

  generations: {
    "1": "Gen I (Kanto) — Pokémon #1-151. 8 Kanto Gym Leaders, then the Kanto Elite Four + Champion.",
    "2": "Gen II (Johto) — Pokémon #1-251. 8 Johto Gym Leaders, then the Johto Elite Four + Lance.",
    "3":
      "Gen III (Hoenn) — Pokémon #252-386 catchable. 8 Hoenn Gym Leaders (Roxanne through Wallace), " +
      "then the Hoenn Elite Four + Champion Steven. Team Aqua or Team Magma (rolled per run) ambushes " +
      "you at the rival slots on maps 2/4/6/8, ending with Archie/Maxie.",
    "4":
      "Gen IV (Sinnoh) — Pokémon #387-493 catchable. Unlocked by winning the Hoenn campaign. " +
      "8 Sinnoh Gym Leaders (Roark through Volkner), then the Sinnoh Elite Four + Champion Cynthia. " +
      "Team Galactic ambushes you at the rival slots on maps 2/4/6/8, ending with Boss Cyrus.",
    "5":
      "Gen V (Unova) — Pokémon #494-649 catchable. Unlocked by winning the Sinnoh campaign. " +
      "8 Unova Gym Leaders (Cilan through Drayden), then the Unova Elite Four + Champion Alder. " +
      "Team Plasma ambushes you at the rival slots on maps 2/4/6/8 (N twice), ending with Ghetsis.",
    both:
      "Tot (all gens) — Pokémon #1-386 catchable. Each map's Gym is RANDOM among that slot's Gen I, " +
      "Gen II and Gen III leader. The final league is 4 random Elite Four members + 1 random Champion. " +
      "You may choose any of the 9 starters (all gens). Boss levels are normalized to a per-map " +
      "target so difficulty stays consistent.",
  },

  modes: {
    how_chosen:
      "Click 'New Adventure' and the professor asks how you'll travel (NORMAL / NUZLOCKE) through classic " +
      "dialogs. Normal journeys also choose a wipe rule: RETRY THE AREA (a full-team faint restarts the " +
      "current map) or BLACK OUT (a wipe ends the run).",
    normal:
      "Normal Mode — turn-based interactive battles. Fainted Pokémon still earn XP and are revived when " +
      "you reach the next map; mid-map you can heal them at a Pokémon Center, with a Max Revive, or by " +
      "winning a rival battle.",
    nuzlocke:
      "Nuzlocke — hardcore. Any Pokémon that faints in battle is lost permanently (exception: rival/Silver " +
      "battles don't permanently faint your team if you win). Trade nodes are available. A wipe always ends the run.",
    battle_tower: "Battle Tower — endless battle gauntlet for score; separate from the main run. Battles are turn-based like the campaign (pick attacks and switch; type traits apply). A Manual/Auto toggle on the Tower map screen can switch to automatic resolution.",
  },

  map: {
    structure:
      "A branching map of node layers. You move downward, choosing one reachable node per step. " +
      "There are ~11 content layers per map plus a guaranteed Gym Leader (BOSS) at the end.",
    node_types: {
      START: "Your entry point.",
      BATTLE: "Wild Pokémon battle. +1 level on win.",
      TRAINER: "Trainer battle. +2 levels on win.",
      BOSS: "Gym Leader (or, on the last map, the Elite Four + Champion). +3 levels on win.",
      CATCH: "Catch a wild Pokémon to add to your team/box.",
      ITEM: "Pick up an item.",
      QUESTION: "Random event.",
      POKECENTER: "Fully heal your team (one in the middle and one near the end are guaranteed).",
      LEGENDARY: "Legendary Pokémon encounter.",
      MOVE_TUTOR: "Teach/upgrade moves. At least 2 Move Tutor nodes are guaranteed per map.",
      TRADE: "Swap a Pokémon for one 3 levels higher.",
      SILVER: "Rival battle — Silver in Gen II, a Team Aqua/Magma ambush in Gen III. Double XP, full heal after, Nuzlocke-exempt.",
    },
  },

  combat: {
    style: "Turn-based, 1v1 on screen (your active Pokémon vs the enemy's). Up to 6 Pokémon per side.",
    moves:
      "Each Pokémon has 1 attacking move per type it can use (move buttons). Damage uses type " +
      "effectiveness. Move power tiers can be upgraded via TMs/move tutor.",
    switching:
      "You may switch your active Pokémon; switching uses your turn and the enemy gets a free hit.",
    turn_order: "Faster Pokémon acts first; held items can modify stats/priority.",
    immunities:
      "Type immunities (×0) are real: an immune move deals no damage ('No effect!'; the move buttons " +
      "show a ×0 tag). The AI picks its strongest move that affects the target; a Pokémon with NO move " +
      "that affects the target resorts to typeless Struggle (50 power) so auto battles can't deadlock.",
    auto: "An Auto button lets the AI play your turns.",
    xp_rewards: { wild: 1, trainer: 2, gym: 3 },
    xp_note:
      "The WHOLE team shares XP; fainted members earn one level less (min +1), so nobody falls behind " +
      "but staying alive pays. A dynamic per-map level cap prevents over-leveling so bosses stay a threat. " +
      "Route levels climb across the map's band (late maps reach near the cap), with wild/catch/trainer fights running a notch below the route level on early maps. Pokémon clearly below the enemies they beat gain extra catch-up XP.",
  },

  bosses: {
    team_size: "Gym Leaders and the Elite Four/Champion field a full team of 6 Pokémon.",
    typing:
      "The canonical roster is kept and padded with extra Pokémon of the leader's type (the " +
      "Champion, mixed type, gets a varied team). Filler is never an evolution beyond what its " +
      "level allows — a low-level slot devolves to the right stage (e.g. Golem -> Geodude).",
    levels:
      "Filler Pokémon fight AT the ace's level and every boss Pokémon holds an item. In Gen I+II, " +
      "since each map's gym is a random Gen 1/Gen 2 leader, levels are normalized to a per-map target " +
      "for consistent difficulty (clamped to level 100).",
  },

  items: "Held items and consumables modify stats, healing, XP (e.g. Lucky Egg), and more.",

  losing:
    "If your whole team faints: Normal with RETRY THE AREA restarts the current map (fresh layout, unlimited " +
    "retries); Normal with BLACK OUT and Nuzlocke end the run.",

  dom_interaction: {
    note:
      "Selectors for driving the game programmatically. Buttons are clicked with .click(); read state " +
      "from the DOM. The current screen is the visible element with class 'screen'.",
    title_screen: {
      generation_toggle: '#gen-toggle .gen-btn[data-gen="1" | "2" | "3" | "4" | "5" | "both"]  (click to select generation; "both" = Tot = gens 1-3 mixed; "4"/"5" are locked until the previous gen is beaten)',
      new_run:
        "#btn-new-run  (New Adventure — opens the professor dialog; pick NORMAL/NUZLOCKE via " +
        ".gba-choice buttons, then the wipe rule for Normal; click the overlay to advance text)",
      battle_tower: "#btn-endless-run  (Battle Tower)",
      continue_run: "#btn-continue-run  (visible only if a saved run exists)",
      rules: 'open this spec UI: openRulesModal()',
    },
    starter_select: {
      container: "#starter-choices",
      choices: ".starter-card / starter option elements inside #starter-choices (click one)",
    },
    map_screen: {
      container: "#map-screen",
      nodes:
        "Map nodes are SVG <g> groups inside the map SVG; each reachable node has a click handler. " +
        "Hover/label info comes from #map-node-tooltip. Click a reachable node group to advance.",
      badges: "#badge-count shows gym progress.",
    },
    battle: {
      player_side: "#player-side .battle-pokemon (your Pokémon; active one has class .active-pokemon)",
      enemy_side: "#enemy-side .battle-pokemon (enemy team; 6 for bosses)",
      hp_text: ".hp-text inside each .battle-pokemon shows 'current/max' HP",
      move_buttons: '#battle-move-buttons .move-btn[data-mi="N"]  (click to attack with move index N)',
      switch_button: "#btn-battle-switch  (open party selector to switch)",
      auto_button: "#btn-battle-auto  (let AI play your turn)",
      party_selector: '.party-entry[data-pi="N"]  (click to switch to party member N; disabled ones are fainted)',
      continue_button: "#btn-continue-battle  (advance past battle result screens)",
    },
    endgame: {
      game_over_retry: "#btn-retry",
      win_play_again: "#btn-play-again",
    },
    how_to_play_a_battle:
      "1) Read enemy HP via #enemy-side .active-pokemon .hp-text. " +
      "2) Choose a move: click a #battle-move-buttons .move-btn (prefer super-effective types). " +
      "3) To switch, click #btn-battle-switch then a .party-entry[data-pi]. " +
      "4) Repeat until a side faints; click #btn-continue-battle to proceed. " +
      "5) You may click #btn-battle-auto to auto-resolve your turns.",
  },
};

/* Expose globally + inject into the machine-readable <script> tag so an LLM can
 * find the spec without clicking anything. */
(function exposeLLMSpec() {
  try {
    window.POKELIKE_RULES = POKELIKE_RULES;
    const el = document.getElementById('pokelike-llm-spec');
    if (el) el.textContent = JSON.stringify(POKELIKE_RULES, null, 2);
  } catch (e) { /* no-op */ }
})();

/* ---------- Human-readable rendering ---------- */

// Full hand-written game guide with a section menu. (The old version rendered
// the terse LLM spec — humans get a proper manual now.)
const _GUIDE_SECTIONS = [
  { id: 'start', icon: '🎯', title: 'Getting started', html: `
    <p>Pokelike is a roguelike: pick a starter, climb a branching map, beat all 8 Gym Leaders and
    the Elite Four + Champion. Lose your whole team and the run is over.</p>
    <ul>
      <li><b>Region cards</b> on the title screen pick your generation: <b>Kanto (I)</b> #1–151,
      <b>Johto (II)</b> #152–251, <b>Hoenn (III)</b> #252–386, <b>Sinnoh (IV)</b> #387–493
      (unlocked by winning Hoenn), <b>Unova (V)</b> #494–649 (unlocked by winning Sinnoh),
      or <b>Tot</b> — the first three mixed:
      every map's gym is rolled among the three regions' leaders and the final league mixes all gens.</li>
      <li>Press <b>New Adventure</b> and the professor asks how you'll travel: <b>NORMAL</b> — the standard
      run — or <b>NUZLOCKE</b> — hardcore, any Pokémon that faints is lost forever (rival battles excepted).</li>
      <li>Normal journeys also choose a wipe rule: <b>RETRY THE AREA</b> (a full-team faint lets you restart
      the current map) or <b>BLACK OUT</b> (a wipe ends the run, no retries).</li>
      <li><b>Battle Tower</b> — a separate endless auto-battle gauntlet.</li>
      <li>You start with 1 Pokémon; your allowed team size grows as you earn badges.</li>
    </ul>` },
  { id: 'map', icon: '🗺️', title: 'The map', html: `
    <p>Each map is a branching graph — you move downward, one reachable node per step, and every path
    ends at the Gym Leader. Node types:</p>
    <ul>
      <li><b>⚔ Wild battle</b> (+1 level) · <b>⚑ Trainer</b> (+2 levels, themed teams) · <b>♛ Gym</b> (+3 levels)</li>
      <li><b>⬟ Catch</b> — recruit a wild Pokémon · <b>✦ Item</b> · <b>? Random event</b></li>
      <li><b>+ Pokémon Center</b> — two guaranteed full heals per map: one mid-map, one before the gym</li>
      <li><b>♪ Move Tutor</b> — upgrade a move's power tier (at least 2 per map, guaranteed) ·
      <b>⇄ Trade</b> — swap a Pokémon for one 3 levels higher</li>
      <li><b>⚝ Legendary</b> — beat it to recruit it (maps 6+)</li>
      <li><b>Rival</b> — Silver in Johto, Team Aqua/Magma in Hoenn, Team Galactic in Sinnoh,
      Team Plasma in Unova (maps 2/4/6/8): double XP for the whole
      team, full heal after, and Nuzlocke-exempt.</li>
    </ul>
    <p>A per-map <b>level cap</b> equal to the leader's ace keeps you from out-leveling the challenge.</p>` },
  { id: 'battle', icon: '⚔️', title: 'Battles', html: `
    <p>Turn-based, one active Pokémon per side; benched teammates wait as Poké Balls.</p>
    <ul>
      <li>Each Pokémon carries one attacking move per type it has. Buttons show a <b>×2 / ×½ / ×0</b> tag
      against the current enemy — type effectiveness follows the official 18-type chart, Fairy included.</li>
      <li><b>Immunities are real</b>: a ×0 move fails ("No effect"). If literally nobody on either side can
      hit the other, the battle ends gracefully — Run away (normal battle) or Retreat (gym).</li>
      <li><b>Critical hits</b>: 6.25% chance, ×1.5 damage (20% with a Scope Lens). Banners over the target
      call out crits and effectiveness as the damage lands.</li>
      <li><b>Switching</b> uses your turn — the incoming Pokémon takes the hit. The <b>Auto</b> button lets
      the AI play, and it is smart enough to switch when the active Pokémon can't touch the enemy.</li>
      <li>Faster Pokémon act first; Quick Claw / Lagging Tail bend the order. After round 100, attacks deal
      ×3 damage so stalls end.</li>
    </ul>` },
  { id: 'team', icon: '📈', title: 'Team & XP', html: `
    <ul>
      <li><b>The whole team shares XP</b> — wild +1, trainer +2, gym +3, rival +4, capped at the map's
      level cap. Fainted Pokémon still earn XP but one level less (min +1): nobody falls behind, but
      keeping your team alive pays.</li>
      <li>Fainted Pokémon revive automatically when you reach the next map; mid-map use a Pokémon Center,
      a Max Revive, or win a rival battle.</li>
      <li>Pokémon <b>evolve</b> at their level thresholds (branching lines let you choose the form).</li>
      <li>Starters build <b>permanent star buffs</b> across runs — finishing runs makes that line stronger
      in future ones.</li>
    </ul>` },
  { id: 'items', icon: '🎒', title: 'Items', html: `
    <ul>
      <li><b>Held items</b> live on a Pokémon and work automatically: Leftovers heal each round, Choice
      Band boosts physical damage, Focus Sash survives a one-shot, King's Rock can flinch, type items
      (Charcoal, Mystic Water…) boost matching moves. The badge on each battle card shows what a Pokémon
      is holding — tap it for the effect.</li>
      <li><b>Bag items</b> are consumables used from the map or prep screens: Rare Candy, Max Revive,
      Full Restore, TMs, Escape Rope (revive after a lost non-boss battle)…</li>
      <li>Enemy aces carry held items too — Gym Leaders and the Elite Four fight equipped, in every region.</li>
      <li><b>Mega Stones</b>: clear Battle Tower stage 3 to earn the Mega Bracelet, then win runs with a
      Mega-capable line on your team to unlock its stone. A Pokémon holding its stone stays
      <b>Mega-Evolved</b> for the whole journey (new stats, types and look) — remove the stone to revert.
      Your collection lives behind the 💠 button on the title screen.</li>
    </ul>` },
  { id: 'league', icon: '🏆', title: 'Gyms & the League', html: `
    <ul>
      <li>Every Gym Leader fields a <b>full team of 6</b>: their canonical aces plus type-matched filler at
      appropriate levels — never an evolution beyond what its level allows.</li>
      <li>Map 9 is the <b>Elite Four</b>: four members plus the Champion, back-to-back, with a prep screen
      between battles to reorder your team and use items.</li>
      <li>In <b>Tot</b> mode each gym slot is rolled among the three regions' leaders, and the league mixes
      members from all gens — levels are normalized so difficulty stays consistent.</li>
      <li>In <b>Hoenn</b>, Team Aqua or Team Magma (rolled per run) ambushes you on the rival maps,
      escalating from grunts to Archie/Maxie.</li>
    </ul>` },
  { id: 'tower', icon: '🗼', title: 'Battle Tower', html: `
    <ul>
      <li>An endless battle gauntlet, separate from the campaign — unlock it by beating the
      game once. Higher stages unlock later generations (up to #649).</li>
      <li>Battles are <b>turn-based like the campaign</b> — you pick attacks and switch, and the
      Tower's type traits keep working. Prefer hands-off runs? The <b>🎮 Manual / ⚡ Auto</b> button
      on the Tower map switches to automatic resolution.</li>
      <li><b>Type traits</b> are the Tower's core: stacking same-type Pokémon on your team unlocks tiered
      passive powers (Fire: attack boosts · Steel: damage guard, pierced by super-effective hits ·
      Flying: dodges · Ghost: executes…). Enemy themed teams have traits too — check the region preview
      and build counters.</li>
      <li>Shiny Pokémon count double toward trait tiers. Score comes from how deep you get.</li>
    </ul>` },
  { id: 'collect', icon: '📚', title: 'Collection & records', html: `
    <ul>
      <li><b>Pokédex</b> tracks caught species per generation — completing Gen 1 earns the Shiny Charm
      (doubles shiny odds). There is a separate <b>shiny dex</b>.</li>
      <li><b>Achievements</b> cover each generation's runs, Nuzlocke feats and challenge builds
      (monotype, shiny squad, no-Center…).</li>
      <li>The <b>Hall of Fame</b> records every championship with your team, filterable by mode and
      generation.</li>
    </ul>` },
  { id: 'save', icon: '☁️', title: 'Saving', html: `
    <ul>
      <li>Progress auto-saves in your browser — <b>Continue Run</b> resumes mid-map, one run at a time.</li>
      <li><b>Save Code</b> (optional account) syncs your collection and Hall of Fame across devices; the
      game works fully offline from it.</li>
      <li>Pokémon and trainer sprites load from the internet, so a connection is needed to play.</li>
    </ul>` },
];

function _rulesHumanHTML() {
  const menu = _GUIDE_SECTIONS.map(s =>
    `<button class="rules-menu-chip" onclick="document.getElementById('guide-${s.id}')?.scrollIntoView({behavior:'smooth',block:'start'})">${s.icon} ${s.title}</button>`
  ).join('');
  const sections = _GUIDE_SECTIONS.map(s =>
    `<div class="rules-sec" id="guide-${s.id}"><h3>${s.icon} ${s.title}</h3>${s.html}</div>`
  ).join('');
  return (
    `<p class="rules-lead">${POKELIKE_RULES.summary}</p>` +
    `<div class="rules-menu">${menu}</div>` +
    sections +
    `<p class="rules-foot">Fork of <a href="${POKELIKE_RULES.fork_of}" target="_blank" rel="noopener">pokelike.xyz</a>.</p>`
  );
}

function _rulesRobotHTML() {
  const json = JSON.stringify(POKELIKE_RULES, null, 2)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    `<p class="rules-lead">Spec llegible per màquina. També disponible com a ` +
    `<code>window.POKELIKE_RULES</code> i a ` +
    `<code>&lt;script type="application/json" id="pokelike-llm-spec"&gt;</code>. ` +
    `Inclou les regles i una guia d'interacció per DOM per jugar de forma programàtica.</p>` +
    `<pre class="rules-spec" tabindex="0">${json}</pre>`
  );
}

function setRulesView(view) {
  const body = document.getElementById('rules-modal-body');
  const tabH = document.getElementById('rules-tab-human');
  const tabR = document.getElementById('rules-tab-robot');
  if (!body) return;
  const robot = view === 'robot';
  body.innerHTML = robot ? _rulesRobotHTML() : _rulesHumanHTML();
  if (tabH) tabH.classList.toggle('rules-tab--active', !robot);
  if (tabR) tabR.classList.toggle('rules-tab--active', robot);
}

function openRulesModal() {
  const m = document.getElementById('rules-modal');
  if (!m) return;
  setRulesView('human');
  m.style.display = 'flex';
}

function closeRulesModal() {
  const m = document.getElementById('rules-modal');
  if (m) m.style.display = 'none';
}

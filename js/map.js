// map.js - Node map generation and rendering

const NODE_TYPES = {
  START: 'start',
  BATTLE: 'battle',
  CATCH: 'catch',
  ITEM: 'item',
  QUESTION: 'question',
  BOSS: 'boss',
  POKECENTER: 'pokecenter',
  TRAINER: 'trainer',
  LEGENDARY: 'legendary',
  MOVE_TUTOR: 'move_tutor',
  TRADE: 'trade',
  SILVER: 'silver',
};

const NODE_WEIGHTS = [
  // L1
  { battle: 25, catch: 30, item: 15, trainer: 30, question: 0,  pokecenter: 0,  move_tutor: 0, trade: 0, legendary: 0 },
  // L2
  { battle: 20, catch: 20, item: 15, trainer: 30, question: 10, pokecenter: 0,  move_tutor: 0, trade: 5, legendary: 0 },
  // L3
  { battle: 16, catch: 14, item: 12, trainer: 27, question: 13, pokecenter: 0,  move_tutor: 9, trade: 9, legendary: 0 },
  // L4
  { battle: 13, catch: 12, item: 10, trainer: 27, question: 13, pokecenter: 0,  move_tutor: 8, trade: 8, legendary: 0 },
  // L5
  { battle: 13, catch: 10, item:  8, trainer: 27, question: 18, pokecenter: 0,  move_tutor: 8, trade: 7, legendary: 0 },
  // L6 — extra mid-game layer (same mix as L5)
  { battle: 13, catch: 10, item:  8, trainer: 27, question: 18, pokecenter: 0,  move_tutor: 8, trade: 7, legendary: 0 },
  // L7 — extra mid-game layer (same mix as L4)
  { battle: 13, catch: 12, item: 10, trainer: 27, question: 13, pokecenter: 0,  move_tutor: 8, trade: 8, legendary: 0 },
  // L8 — extra mid-game layer (same mix as L5)
  { battle: 13, catch: 10, item:  8, trainer: 27, question: 18, pokecenter: 0,  move_tutor: 8, trade: 7, legendary: 0 },
  // L9 — extra mid-game layer (same mix as L4)
  { battle: 13, catch: 12, item: 10, trainer: 27, question: 13, pokecenter: 0,  move_tutor: 8, trade: 8, legendary: 0 },
  // L10 — extra mid-game layer (same mix as L5)
  { battle: 13, catch: 10, item:  8, trainer: 27, question: 18, pokecenter: 0,  move_tutor: 8, trade: 7, legendary: 0 },
  // L11 — pre-boss layer (battle-heavy, no tutor/trade)
  { battle: 20, catch:  9, item: 14, trainer: 18, question:  9, pokecenter: 0,  move_tutor: 0, trade: 0, legendary: 0 },
];

// Gen 2 uses a single flat distribution across all content layers. Sums to 100,
// so each weight reads as a percentage. Forced pokecenter on the last layer and
// Silver on map-4-middle (maps 1,3,5,7) still apply on top of these rolls.
const GEN2_NODE_WEIGHTS = {
  battle: 25, catch: 5, item: 10, trainer: 40, question: 10, pokecenter: 0, move_tutor: 5, trade: 5, legendary: 0,
};

function weightedRandom(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, v] of Object.entries(weights)) {
    r -= v;
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

function generateMap(mapIndex, nuzlockeMode = false, gen2Mode = false) {
  // Layer sizes: start(1), catch/battle(2), content, boss(1)
  const CONTENT_SIZES = [4, 5, 4, 5, 4, 5, 4, 5, 4, 5, 3]; // 11 content layers (+2 rows for difficulty)
  // Gen 3 mirrors the Gen 2 map structure (flat weights, deterministic ladder,
  // rival nodes) — resolved from run state since the caller passes gen2Mode.
  const _gmGen = typeof state !== 'undefined' && typeof getRunGen === 'function' ? getRunGen() : '1';
  const gen2Like = gen2Mode || ['3', '4', '5'].includes(_gmGen);
  // The rival (Silver / Team Aqua-Magma) shows up as an optional node on these
  // maps. Players who want the bonus XP can route through it; others can take
  // a different path.
  const hasSilverNode = gen2Like && [1, 3, 5, 7].includes(mapIndex);
  const contentCount  = CONTENT_SIZES.length;
  const bossLayerIdx  = 2 + CONTENT_SIZES.length;
  const bossId        = `n${bossLayerIdx}_0`;

  // ── Helpers ──────────────────────────────────────────────────────

  const assignTrainerSprite = (node, nodeId) => {
    const availableKeys = TRAINER_SPRITE_KEYS.filter(k => {
      if (k === 'aceTrainer' && mapIndex >= 6) return false;
      if (k === 'policeman'  && mapIndex >= 4) return false;
      // Gen 2/3-only sprites are hidden in Gen 1 mode (and vice versa).
      if (!gen2Like && GEN2_ONLY_TRAINER_KEYS.has(k)) return false;
      if (gen2Like  && GEN1_ONLY_TRAINER_KEYS.has(k)) return false;
      return true;
    });
    let h = 0;
    for (const ch of nodeId) h = (h * 31 + ch.charCodeAt(0)) | 0;
    node.trainerSprite = availableKeys[Math.abs(h) % availableKeys.length];
  };

  const makeNode = (id, type, layer, col, extra = {}) => {
    const node = { id, type, layer, col, ...extra };
    if (type === NODE_TYPES.TRAINER) assignTrainerSprite(node, id);
    return node;
  };

  // Pick a weighted-random node type; ci = content layer index (0–5)
  const pickType = (ci) => {
    const w = gen2Like
      ? { ...GEN2_NODE_WEIGHTS }
      : { ...NODE_WEIGHTS[Math.min(ci, NODE_WEIGHTS.length - 1)] };
    if (mapIndex >= 5 && ci >= 2 && !(typeof state !== 'undefined' && state.isEndlessMode)) w.legendary = 2;
    if (nuzlockeMode) { w.catch = 0; } // no extra catches, but trades are allowed
    if (typeof state !== 'undefined' && state.isEndlessMode) { w.trade = 0; w.catch = Math.floor(w.catch / 2); }
    const type = weightedRandom(w);
    // Endless region 3: 1/6 catch nodes become legendary encounters
    if (type === NODE_TYPES.CATCH &&
        typeof state !== 'undefined' && state.isEndlessMode &&
        typeof endlessState !== 'undefined' && endlessState.regionNumber === 3 &&
        rng() < 1 / 6) {
      return NODE_TYPES.LEGENDARY;
    }
    return type;
  };

  // Each node at position i in fromLayer connects to the 2 positionally
  // nearest nodes in toLayer (like walking down-left and down-right).
  const makeLayerEdges = (fromLayer, toLayer) => {
    const N = fromLayer.length;
    const M = toLayer.length;
    if (N === 1) {
      // Single source fans out to all targets
      return toLayer.map(t => ({ from: fromLayer[0].id, to: t.id }));
    }
    const edges = [];
    for (let i = 0; i < N; i++) {
      let left, right;
      if (M === 1) {
        left = right = 0;
      } else if (M < N && i === 0) {
        // Leftmost node on a shrinking layer → only the leftmost node below
        left = right = 0;
      } else if (M < N && i === N - 1) {
        // Rightmost node on a shrinking layer → only the rightmost node below
        left = right = M - 1;
      } else {
        const pos = i * (M - 1) / (N - 1);
        left  = Math.floor(pos);
        right = left + 1;
        if (right >= M) { right = M - 1; left = M - 2; }
      }
      edges.push({ from: fromLayer[i].id, to: toLayer[left].id });
      if (left !== right) {
        edges.push({ from: fromLayer[i].id, to: toLayer[right].id });
      }
    }
    return edges;
  };

  // ── Build layers ─────────────────────────────────────────────────

  const layers = [];

  // Layer 0: Start
  layers.push([makeNode('n0_0', NODE_TYPES.START, 0, 0)]);

  // Layer 1: always Catch (left) and Battle (right); nuzlocke gets two Catch nodes
  layers.push([
    makeNode('n1_0', NODE_TYPES.CATCH, 1, 0),
    makeNode('n1_1', nuzlockeMode ? NODE_TYPES.CATCH : NODE_TYPES.BATTLE, 1, 1),
  ]);

  // Layers 2+: random content nodes (Silver maps use one fewer content layer)
  for (let ci = 0; ci < contentCount; ci++) {
    const l    = ci + 2;
    const size = CONTENT_SIZES[ci];
    const layer = Array.from({ length: size }, (_, c) => makeNode(`n${l}_${c}`, pickType(ci), l, c));

    // Guarantee a pokecenter near the boss AND one mid-map (the ladder now
    // climbs to the cap, so the back half needs a breather).
    const isMidLayer = ci === Math.floor(contentCount / 2);
    if ((ci === contentCount - 1 || isMidLayer) && !layer.some(n => n.type === NODE_TYPES.POKECENTER)) {
      const idx = Math.floor(rng() * size);
      layer[idx].type = NODE_TYPES.POKECENTER;
      delete layer[idx].trainerSprite;
    }

    layers.push(layer);
  }

  // Silver node: pinned to the center node of content layer 2 (absolute layer
  // index 2 + 2 = 4), whatever its width — so he's easy to find and routable around.
  if (hasSilverNode) {
    const silverLayer = layers[4];
    if (silverLayer && silverLayer.length >= 1) {
      const slotIdx = Math.floor(silverLayer.length / 2); // center node
      silverLayer[slotIdx].type = NODE_TYPES.SILVER;
      delete silverLayer[slotIdx].trainerSprite;
    }
  }

  // Guarantee at least 2 Move Tutors per map — the weighted rolls left ~8% of
  // maps with none and players rely on tutors to upgrade move power. Missing
  // tutors replace a common node on the mid/late content layers, one per map
  // half so the guaranteed pair doesn't cluster.
  {
    const REPLACEABLE = new Set([NODE_TYPES.BATTLE, NODE_TYPES.TRAINER, NODE_TYPES.ITEM, NODE_TYPES.QUESTION]);
    const tutorCount = () => layers.flat().filter(n => n.type === NODE_TYPES.MOVE_TUTOR).length;
    const convertIn = layerSlice => {
      const spots = layerSlice.flat().filter(n => REPLACEABLE.has(n.type));
      if (!spots.length) return false;
      const pick = spots[Math.floor(rng() * spots.length)];
      pick.type = NODE_TYPES.MOVE_TUTOR;
      delete pick.trainerSprite;
      return true;
    };
    const contentEnd = 2 + contentCount;           // layers[2..contentEnd) are content
    const mid = 4 + Math.floor((contentEnd - 4) / 2);
    const halves = [layers.slice(4, mid), layers.slice(mid, contentEnd)]; // skip the 2 earliest content layers
    for (const half of halves) {
      if (tutorCount() >= 2) break;
      if (half.some(l => l.some(n => n.type === NODE_TYPES.MOVE_TUTOR))) continue;
      convertIn(half);
    }
    while (tutorCount() < 2 && convertIn(layers.slice(3, contentEnd))) { /* freak-roll fallback */ }
  }

  // Boss layer
  layers.push([makeNode(bossId, NODE_TYPES.BOSS, bossLayerIdx, 0, { mapIndex })]);

  // ── Build edges ──────────────────────────────────────────────────

  const edges = [];
  for (let l = 0; l < layers.length - 1; l++) {
    edges.push(...makeLayerEdges(layers[l], layers[l + 1]));
  }

  // ── Flatten & initialise nodes ───────────────────────────────────

  const nodes = {};
  for (const layer of layers) {
    for (const n of layer) {
      n.visited    = false;
      n.accessible = false;
      n.revealed   = true;
      nodes[n.id]  = n;
    }
  }

  nodes['n0_0'].visited = true;
  edges.filter(e => e.from === 'n0_0').forEach(e => { nodes[e.to].accessible = true; });

  return { nodes, edges, layers, mapIndex };
}

function getAccessibleNodes(map) {
  return Object.values(map.nodes).filter(n => n.accessible && !n.visited);
}

function advanceFromNode(map, nodeId) {
  const node = map.nodes[nodeId];
  if (!node) return;
  node.visited = true;
  node.accessible = false;
  // ❓-event egg: progresses one step per node cleared (game.js).
  if (typeof tickEggProgress === 'function') tickEggProgress();

  // Lock sibling nodes in the same layer — the unchosen branches are gone
  for (const n of Object.values(map.nodes)) {
    if (n.layer === node.layer && n.id !== nodeId && n.accessible) {
      n.accessible = false;
    }
  }

  // Make next layer nodes accessible
  for (const edge of map.edges) {
    if (edge.from === nodeId) {
      const target = map.nodes[edge.to];
      if (target) {
        target.revealed = true;
        target.accessible = true;
      }
    }
  }
}

// ---- Sprite helpers ----

// Keys must match the filename stems in /sprites/ exactly (case-sensitive)
const TRAINER_SPRITE_KEYS = [
  'aceTrainer', 'bugCatcher', 'fireSpitter', 'fisher',
  'hiker', 'oldGuy', 'policeman', 'Scientist', 'teamRocket',
  // Gen 2-only trainer sprites
  'birdCatcher', 'biker', 'nerd', 'medium', 'schoolBoy', 'captain',
];

// Gen 2-only sprites — hidden in Gen 1 mode so no broken images appear.
const GEN2_ONLY_TRAINER_KEYS = new Set([
  'birdCatcher', 'biker', 'nerd', 'medium', 'schoolBoy', 'captain',
]);
// Gen 1-only sprites — replaced in Gen 2 (Scientist becomes Nerd, etc).
const GEN1_ONLY_TRAINER_KEYS = new Set(['Scientist']);

// Gen 2 mode has re-skinned versions of most trainer sprites under sprites/gen2/.
// A few share the trainer key (aceTrainer, bugCatcher, etc), two are renamed
// (fireSpitter→fireBreather, oldGuy→oldMan), and the Gen 2-exclusive sprites
// only live here.
const GEN2_SPRITE_FILENAME = {
  aceTrainer:  'aceTrainer',
  bugCatcher:  'bugCatcher',
  fireSpitter: 'fireBreather',
  fisher:      'fisher',
  hiker:       'hiker',
  oldGuy:      'oldMan',
  policeman:   'policeman',
  teamRocket:  'teamRocket',
  birdCatcher: 'birdCatcher',
  biker:       'biker',
  nerd:        'nerd',
  medium:      'medium',
  schoolBoy:   'schoolBoy',
  captain:     'captain',
};

function getTrainerSpritePath(key, isGen2) {
  if (isGen2 && GEN2_SPRITE_FILENAME[key]) {
    return `sprites/gen2/${GEN2_SPRITE_FILENAME[key]}.png`;
  }
  return `sprites/${key}.png`;
}

const TRAINER_SPRITE_NAMES = {
  aceTrainer:  'Ace Trainer',
  bugCatcher:  'Bug Catcher',
  fireSpitter: 'Firebreather',
  fisher:      'Fisherman',
  hiker:       'Hiker',
  oldGuy:      'Gentleman',
  policeman:   'Officer',
  Scientist:   'Scientist',
  teamRocket:  'Team Rocket Grunt',
  birdCatcher: 'Bird Keeper',
  biker:       'Biker',
  nerd:        'Super Nerd',
  medium:      'Medium',
  schoolBoy:   'Schoolboy',
  captain:     'Sailor',
};

const TRAINER_SPECIALTIES = {
  aceTrainer:  'Various Pokemon',
  bugCatcher:  'Bug Pokemon',
  fireSpitter: 'Fire Pokemon',
  fisher:      'Water Pokemon',
  hiker:       'Rock/Ground Pokemon',
  oldGuy:      'Various Pokemon',
  policeman:   'Fire Pokemon',
  Scientist:   'Electric/Poison Pokemon',
  teamRocket:  'Poison Pokemon',
  birdCatcher: 'Flying Pokemon',
  biker:       'Poison Pokemon',
  nerd:        'Electric Pokemon',
  medium:      'Ghost Pokemon',
  schoolBoy:   'Normal Pokemon',
  captain:     'Water Pokemon',
};

const TRAINER_SPECIALTIES_GEN2 = {
  aceTrainer:  'Dragon/Psychic/Fighting Pokemon',
  oldGuy:      'Normal Pokemon',
  schoolBoy:   'Baby Pokemon',
};

const RANDOM_TRAINER_SPRITES = TRAINER_SPRITE_KEYS.map(k => `sprites/${k}.png`);

const GYM_LEADER_SPRITES = [
  'sprites/brock.png',
  'sprites/misty.png',
  'sprites/lt. surge.png',
  'sprites/erika.png',
  'sprites/koga.png',
  'sprites/sabrina.png',
  'sprites/blaine.png',
  'sprites/giovanni.png',
];

const JOHTO_GYM_LEADER_SPRITES = [
  'sprites/gen2/falkner.png',
  'sprites/gen2/bugsy.png',
  'sprites/gen2/whitney.png',
  'sprites/gen2/morty.png',
  'sprites/gen2/chuck.png',
  'sprites/gen2/jasmine.png',
  'sprites/gen2/pryce.png',
  'sprites/gen2/clair.png',
];

const HOENN_GYM_LEADER_SPRITES = [
  'sprites/gen3/roxanne.png',
  'sprites/gen3/brawly.png',
  'sprites/gen3/wattson.png',
  'sprites/gen3/flannery.png',
  'sprites/gen3/norman.png',
  'sprites/gen3/winona.png',
  'sprites/gen3/tita-liza.png',
  'sprites/gen3/wallace.png',
];

const SINNOH_GYM_LEADER_SPRITES = [
  'sprites/gen4/roark.png',
  'sprites/gen4/gardenia.png',
  'sprites/gen4/maylene.png',
  'sprites/gen4/crasher-wake.png',
  'sprites/gen4/fantina.png',
  'sprites/gen4/byron.png',
  'sprites/gen4/candice.png',
  'sprites/gen4/volkner.png',
];

const UNOVA_GYM_LEADER_SPRITES = [
  'sprites/gen5/cilan.png',
  'sprites/gen5/lenora.png',
  'sprites/gen5/burgh.png',
  'sprites/gen5/elesa.png',
  'sprites/gen5/clay.png',
  'sprites/gen5/skyla.png',
  'sprites/gen5/brycen.png',
  'sprites/gen5/drayden.png',
];

const KANTO_GYM_LEADER_SPRITES = [
  'sprites/trainers/brock.png',
  'sprites/trainers/misty.png',
  'sprites/trainers/ltsurge.png',
  'sprites/trainers/erika.png',
  'sprites/trainers/janine.png',
  'sprites/trainers/sabrina.png',
  'sprites/trainers/blaine.png',
  'sprites/trainers/blue.png',
];

function getNodeSprite(node) {
  const gen2 = typeof state !== 'undefined' && state.gen2Mode;
  const _nsGen = typeof state !== 'undefined' && typeof getRunGen === 'function' ? getRunGen() : '1';
  const gen3 = _nsGen === '3';
  const gen45 = _nsGen === '4' || _nsGen === '5';
  const gen2Like = gen2 || gen3 || gen45; // gens 3-5 reuse the gen 2 trainer re-skins
  const ICON_SPRITES = {
    [NODE_TYPES.BATTLE]:    (gen3 || gen45) ? 'sprites/gen3/grass.png'    : gen2 ? 'sprites/gen2/grass.png'    : 'sprites/grass.png',
    [NODE_TYPES.CATCH]:     (gen3 || gen45) ? 'sprites/gen3/pokeball.png' : gen2 ? 'sprites/gen2/pokeball.png' : 'sprites/catchPokemon.png',
    [NODE_TYPES.ITEM]:      'sprites/itemIcon.png',
    [NODE_TYPES.TRADE]:      'sprites/tradeIcon.png',
    [NODE_TYPES.LEGENDARY]:  'sprites/legendaryEncounter.png',
    [NODE_TYPES.QUESTION]:   'sprites/questionMark.png',
    [NODE_TYPES.POKECENTER]: 'sprites/Poke Center.png',
    [NODE_TYPES.MOVE_TUTOR]: 'sprites/moveTutor.png',
  };
  if (ICON_SPRITES[node.type]) return ICON_SPRITES[node.type];
  if (node.type === NODE_TYPES.TRAINER) {
    const key = node.trainerSprite || (() => {
      const keys = TRAINER_SPRITE_KEYS.filter(k => {
        if (!gen2Like && GEN2_ONLY_TRAINER_KEYS.has(k)) return false;
        if (gen2Like  && GEN1_ONLY_TRAINER_KEYS.has(k)) return false;
        return true;
      });
      let h = 0;
      for (const c of node.id) h = (h * 31 + c.charCodeAt(0)) | 0;
      return keys[Math.abs(h) % keys.length];
    })();
    return getTrainerSpritePath(key, gen2Like);
  }
  if (node.type === NODE_TYPES.BOSS) {
    if (typeof state !== 'undefined' && state.isEndlessMode) return 'sprites/misteryTrainer.png';
    const mi = node.mapIndex ?? -1;
    if (typeof state !== 'undefined' && state.bothGens) {
      if (mi >= 0 && mi < 8) {
        const gen = (state.gymGens && state.gymGens[mi]) || 1;
        return gen === 5 ? UNOVA_GYM_LEADER_SPRITES[mi]
             : gen === 4 ? SINNOH_GYM_LEADER_SPRITES[mi]
             : gen === 3 ? HOENN_GYM_LEADER_SPRITES[mi]
             : gen === 2 ? JOHTO_GYM_LEADER_SPRITES[mi]
             : GYM_LEADER_SPRITES[mi];
      }
      return 'sprites/champ.png';
    }
    if (gen3) {
      if (mi === 8) return 'sprites/gen3/steven.png';
      if (mi >= 0 && mi < 8) return HOENN_GYM_LEADER_SPRITES[mi];
    }
    if (_nsGen === '4') {
      if (mi === 8) return 'sprites/gen4/cynthia.png';
      if (mi >= 0 && mi < 8) return SINNOH_GYM_LEADER_SPRITES[mi];
    }
    if (_nsGen === '5') {
      if (mi === 8) return 'sprites/gen5/alder.png';
      if (mi >= 0 && mi < 8) return UNOVA_GYM_LEADER_SPRITES[mi];
    }
    if (typeof state !== 'undefined' && state.gen2Mode) {
      if (mi === 17) return 'sprites/trainers/red.png';
      if (mi === 8)  return 'sprites/gen2/lance.png';
      if (mi >= 9 && mi < 17) return KANTO_GYM_LEADER_SPRITES[mi - 9];
      if (mi >= 0 && mi < 8) return JOHTO_GYM_LEADER_SPRITES[mi];
    }
    if (mi >= 0 && mi < GYM_LEADER_SPRITES.length) return GYM_LEADER_SPRITES[mi];
    return 'sprites/champ.png';
  }
  if (node.type === NODE_TYPES.SILVER) {
    if (gen3) {
      const team = (state.villainTeam === 'magma') ? 'magma' : 'aqua';
      const isLeaderMap = state.currentMap === 7;
      if (team === 'magma') return isLeaderMap ? 'sprites/gen3/maxie.png' : 'sprites/gen3/magma-admin.png';
      return isLeaderMap ? 'sprites/gen3/archie.png' : 'sprites/gen3/aqua-admin.png';
    }
    if (gen45) {
      const encIdx = { 1: 0, 3: 1, 5: 2, 7: 3 }[state.currentMap] ?? 0;
      return (typeof VILLAIN_ENC_SPRITES !== 'undefined' && VILLAIN_ENC_SPRITES[_nsGen])
        ? VILLAIN_ENC_SPRITES[_nsGen][encIdx]
        : 'sprites/gen2/silver.png';
    }
    return 'sprites/gen2/silver.png';
  }
  return null;
}

// Rendering — top-to-bottom layout
const _mapTooltip = (() => {
  let el = null;
  // On touch devices the tooltip would sit under the finger — dock it as a
  // bottom sheet instead (isTouchUI lives in ui.js; loaded by runtime).
  const touch = () => typeof isTouchUI === 'function' && isTouchUI();
  return {
    show(label, x, y) {
      if (!document.getElementById('map-screen')?.classList.contains('active')) return;
      if (!el) el = document.getElementById('map-node-tooltip');
      if (!el) return;
      el.innerHTML = label;
      if (touch()) {
        el.classList.add('docked');
        el.style.left = ''; el.style.top = '';
      } else {
        el.classList.remove('docked');
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      }
      el.classList.add('visible');
    },
    move(x, y) {
      if (!el || el.classList.contains('docked')) return;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    },
    hide() {
      if (!el) el = document.getElementById('map-node-tooltip');
      if (el) el.classList.remove('visible', 'docked');
    },
  };
})();

// Touch: tapping outside a map node closes the docked node sheet.
document.addEventListener('click', e => {
  if (!e.target.closest('#map-container svg g')) _mapTooltip.hide();
});

function renderMap(map, container, onNodeClick) {
  container.innerHTML = '';
  const W = container.clientWidth || 600;
  const H = container.clientHeight || 500;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('overflow', 'visible');
  svg.style.width = '100%';
  svg.style.height = '100%';

  const layerCount = map.layers.length;
  const padY = 28;

  const positions = {};
  for (let l = 0; l < map.layers.length; l++) {
    const layer = map.layers[l];
    const y = layerCount > 1 ? padY + (l / (layerCount - 1)) * (H - 2 * padY) : H / 2;
    const nodeGap = W / (layer.length + 0.2);
    for (let c = 0; c < layer.length; c++) {
      const x = layer.length === 1 ? W / 2 : W / 2 + (c - (layer.length - 1) / 2) * nodeGap;
      positions[layer[c].id] = { x, y };
    }
  }

  // Responsive node sizing: shrink nodes when rows/columns are packed tight
  // (long maps, small/mobile screens) so they never overlap, and keep them
  // full-size when there's room. Scales every node's icon/circle/glyph.
  const maxLayerW = Math.max(...map.layers.map(l => l.length));
  const rowGap = layerCount > 1 ? (H - 2 * padY) / (layerCount - 1) : H;
  const colGap = W / (maxLayerW + 0.2);
  const nodeScale = Math.max(0.45, Math.min(1.1, Math.min(rowGap, colGap) / 56));

  // Shared defs: glassy platform gradient under clickable nodes
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <radialGradient id="map-plate" cx="0.5" cy="0.4" r="0.65">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="0.65" stop-color="#eaf4ff" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#b8d4ee" stop-opacity="0.1"/>
    </radialGradient>
    <radialGradient id="map-aura-gold" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd76b" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#ffb830" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#ff9800" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="map-aura-red" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ff6a5a" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#e03028" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#b01810" stop-opacity="0"/>
    </radialGradient>`;
  svg.appendChild(defs);

  // Draw ALL edges — modern dotted route trails on a soft "road bed",
  // gently bowed so paths read organic instead of ruler-straight.
  for (const edge of map.edges) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) continue;
    const fromNode = map.nodes[edge.from];
    const toNode   = map.nodes[edge.to];
    const travelled = fromNode.visited && toNode.visited;
    const onPath = (fromNode.visited || fromNode.accessible) && (toNode.visited || toNode.accessible);
    // A "next step" edge leads from where you are now into a node you can click.
    const isNextStep = fromNode.visited && toNode.accessible && !toNode.visited;

    const exv = to.x - from.x, eyv = to.y - from.y;
    const elen = Math.hypot(exv, eyv) || 1;
    let hash = 0;
    for (const ch of edge.from + edge.to) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    // Winding S-curve (cubic): the two control points bow to OPPOSITE sides,
    // so routes meander like real footpaths instead of straight hops.
    const sgn = (hash & 1) ? 1 : -1;
    const mag = Math.min(18, elen * 0.16) * sgn;
    const nxv = -eyv / elen, nyv = exv / elen;
    const c1x = from.x + exv / 3 + nxv * mag,  c1y = from.y + eyv / 3 + nyv * mag;
    const c2x = from.x + exv * 2 / 3 - nxv * mag, c2y = from.y + eyv * 2 / 3 - nyv * mag;
    const d = `M${from.x} ${from.y} C${c1x} ${c1y} ${c2x} ${c2y} ${to.x} ${to.y}`;

    // road bed: a wide soft dark trail grounding the route on the terrain.
    // Distant routes get a whisper of a bed so the map doesn't turn into
    // a dark spiderweb on branchy layers.
    const bed = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bed.setAttribute('d', d);
    bed.setAttribute('fill', 'none');
    bed.setAttribute('stroke', `rgba(24,18,8,${travelled || onPath || isNextStep ? 0.26 : 0.10})`);
    bed.setAttribute('stroke-width', isNextStep ? '10' : '8');
    bed.setAttribute('stroke-linecap', 'round');
    svg.appendChild(bed);

    const trail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trail.setAttribute('d', d);
    trail.setAttribute('fill', 'none');
    trail.setAttribute('stroke-linecap', 'round');
    if (travelled) {
      // route already walked: a calm solid ribbon
      trail.setAttribute('stroke', 'rgba(150,210,165,0.5)');
      trail.setAttribute('stroke-width', '3');
    } else if (isNextStep) {
      // golden dot trail flowing toward the clickable node
      trail.setAttribute('stroke', '#ffe066');
      trail.setAttribute('stroke-width', '4.5');
      trail.setAttribute('stroke-dasharray', '0.1 11');
      trail.style.filter = 'drop-shadow(0 0 3px #ffe066)';
      const flow = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      flow.setAttribute('attributeName', 'stroke-dashoffset');
      flow.setAttribute('values', '22.2;0');
      flow.setAttribute('dur', '0.8s');
      flow.setAttribute('repeatCount', 'indefinite');
      trail.appendChild(flow);
    } else {
      // future routes: quiet dotted trails, brighter when reachable soon
      trail.setAttribute('stroke', onPath ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.20)');
      trail.setAttribute('stroke-width', onPath ? '3.2' : '2.6');
      trail.setAttribute('stroke-dasharray', '0.1 9');
    }
    svg.appendChild(trail);
  }


  // Draw ALL nodes (all are revealed)
  for (const [id, node] of Object.entries(map.nodes)) {
    const pos = positions[id];
    if (!pos) continue;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${pos.x},${pos.y})`);

    const isClickable = node.accessible && !node.visited;
    const isInaccessible = !node.accessible && !node.visited;
    const isCurrent = state.currentNode && node.id === state.currentNode.id;

    g.style.cursor = isClickable ? 'pointer' : 'default';
    if (isInaccessible) { g.style.opacity = '0.75'; }
    // START stays at full colour throughout the run — it carries the
    // Normal/Nuzlocke mode indication.
    if (node.visited && node.type !== NODE_TYPES.START) g.style.filter = 'grayscale(0.5) brightness(0.62)';
    if (isClickable) g.style.filter = 'drop-shadow(0 0 6px #fff) drop-shadow(0 0 3px #ffe066)';

    // Clickable nodes gently bob up and down to read as interactive. additive
    // "sum" layers the bob on top of the node's base translate(x,y).
    if (isClickable) {
      const bob = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform');
      bob.setAttribute('attributeName', 'transform');
      bob.setAttribute('type', 'translate');
      bob.setAttribute('additive', 'sum');
      bob.setAttribute('values', '0 0; 0 -4; 0 0');
      bob.setAttribute('dur', '1.6s');
      bob.setAttribute('repeatCount', 'indefinite');
      bob.setAttribute('calcMode', 'spline');
      bob.setAttribute('keyTimes', '0; 0.5; 1');
      bob.setAttribute('keySplines', '0.45 0 0.55 1; 0.45 0 0.55 1');
      g.appendChild(bob);

      // Comfortable tap target (kept ≥40px diameter even when icons are scaled
      // down on small screens), drawn behind the icon so it only catches taps.
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hit.setAttribute('r', Math.max(20, 24 * nodeScale));
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('pointer-events', 'all');
      g.appendChild(hit);
    }

    const isBossNode = node.type === NODE_TYPES.BOSS;
    const sprite = getNodeSprite(node);

    if (sprite) {
      // ---- Sprite-based node ----

      // Sprite image, no circle background
      // Human figures (trainer/boss) are taller than wide; icons are square
      const isHumanFigure = node.type === NODE_TYPES.TRAINER || node.type === NODE_TYPES.BOSS || node.type === NODE_TYPES.SILVER;
      // The rival/villain encounter draws noticeably larger than route
      // trainers — its size alone marks it as a special fight.
      const isSilverNode = node.type === NODE_TYPES.SILVER;
      const iw = (isSilverNode ? 54 : isHumanFigure ? (isBossNode ? 60 : 38) : (isBossNode ? 60 : 40)) * nodeScale;
      const ih = (isSilverNode ? 70 : isHumanFigure ? (isBossNode ? 60 : 52) : (isBossNode ? 60 : 40)) * nodeScale;

      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', sprite.replace(/ /g, '%20'));
      img.setAttribute('x', -(iw / 2));
      img.setAttribute('y', -(ih / 2));
      img.setAttribute('width', iw);
      img.setAttribute('height', ih);
      img.setAttribute('image-rendering', 'pixelated');
      img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      g.appendChild(img);

      // Soft ground shadow settles every sprite onto the terrain
      const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      shadow.setAttribute('cx', 0);
      shadow.setAttribute('cy', ih / 2 - 1);
      shadow.setAttribute('rx', iw * 0.38);
      shadow.setAttribute('ry', 4.5 * nodeScale);
      shadow.setAttribute('fill', 'rgba(0,0,0,0.32)');
      g.insertBefore(shadow, img);

      // BIG-FIGHT presence: gym leaders and rival/villain ambushes get an
      // aura, a slowly rotating seal and a GYM/VS tag — nobody should walk
      // past these thinking they're routine nodes.
      const isBigFight = (isBossNode || isSilverNode) && !node.visited;
      if (isBigFight) {
        const gold = isBossNode;
        const auraR = Math.max(iw, ih) * 0.95;
        const aura = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        aura.setAttribute('r', auraR);
        aura.setAttribute('fill', `url(#map-aura-${gold ? 'gold' : 'red'})`);
        const auraA = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        auraA.setAttribute('attributeName', 'opacity');
        auraA.setAttribute('values', '0.6;1;0.6');
        auraA.setAttribute('dur', '1.8s');
        auraA.setAttribute('repeatCount', 'indefinite');
        aura.appendChild(auraA);
        g.insertBefore(aura, shadow);

        const seal = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        seal.setAttribute('r', Math.max(iw, ih) * 0.62);
        seal.setAttribute('fill', 'none');
        seal.setAttribute('stroke', gold ? '#ffd76b' : '#ff6a5a');
        seal.setAttribute('stroke-width', '2.5');
        seal.setAttribute('stroke-dasharray', '7 6');
        const spin = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform');
        spin.setAttribute('attributeName', 'transform');
        spin.setAttribute('type', 'rotate');
        spin.setAttribute('from', '0 0 0');
        spin.setAttribute('to', `${360 * (gold ? 1 : -1)} 0 0`);
        spin.setAttribute('dur', '14s');
        spin.setAttribute('repeatCount', 'indefinite');
        seal.appendChild(spin);
        g.insertBefore(seal, shadow);

        // floating tag: GYM (gold) / VS (red)
        const tag = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const tagW = (gold ? 34 : 24) * Math.max(nodeScale, 0.8);
        const tagH = 14 * Math.max(nodeScale, 0.8);
        const tagY = -ih / 2 - tagH - 2;
        const tagBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        tagBg.setAttribute('x', -tagW / 2);
        tagBg.setAttribute('y', tagY);
        tagBg.setAttribute('width', tagW);
        tagBg.setAttribute('height', tagH);
        tagBg.setAttribute('rx', 3.5);
        tagBg.setAttribute('fill', gold ? '#c8a000' : '#d02820');
        tagBg.setAttribute('stroke', '#fff');
        tagBg.setAttribute('stroke-width', '1.5');
        tag.appendChild(tagBg);
        const tagTx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tagTx.setAttribute('x', 0);
        tagTx.setAttribute('y', tagY + tagH / 2 + 0.5);
        tagTx.setAttribute('text-anchor', 'middle');
        tagTx.setAttribute('dominant-baseline', 'central');
        tagTx.setAttribute('font-family', "'Press Start 2P', monospace");
        tagTx.setAttribute('font-size', `${7 * Math.max(nodeScale, 0.8)}`);
        tagTx.setAttribute('fill', '#fff');
        tagTx.textContent = gold ? 'GYM' : 'VS';
        tag.appendChild(tagTx);
        const tagBob = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform');
        tagBob.setAttribute('attributeName', 'transform');
        tagBob.setAttribute('type', 'translate');
        tagBob.setAttribute('additive', 'sum');
        tagBob.setAttribute('values', '0 0; 0 -3; 0 0');
        tagBob.setAttribute('dur', '1.1s');
        tagBob.setAttribute('repeatCount', 'indefinite');
        tag.appendChild(tagBob);
        g.appendChild(tag);
      }

      // Clickable: glassy platform plate + expanding pulse ring (modern
      // "you can go here" marker)
      if (isClickable) {
        const pr = Math.max(iw, ih) * 0.55;
        const plate = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        plate.setAttribute('cy', 4 * nodeScale);
        plate.setAttribute('r', pr);
        plate.setAttribute('fill', 'url(#map-plate)');
        plate.setAttribute('stroke', 'rgba(255,255,255,0.85)');
        plate.setAttribute('stroke-width', '1.5');
        g.insertBefore(plate, shadow);

        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cy', 4 * nodeScale);
        ring.setAttribute('r', pr);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', '#ffd76b');
        ring.setAttribute('stroke-width', '2.5');
        const ringR = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        ringR.setAttribute('attributeName', 'r');
        ringR.setAttribute('values', `${pr};${pr + 11}`);
        ringR.setAttribute('dur', '1.4s');
        ringR.setAttribute('repeatCount', 'indefinite');
        ring.appendChild(ringR);
        const ringO = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        ringO.setAttribute('attributeName', 'stroke-opacity');
        ringO.setAttribute('values', '0.9;0');
        ringO.setAttribute('dur', '1.4s');
        ringO.setAttribute('repeatCount', 'indefinite');
        ring.appendChild(ringO);
        g.insertBefore(ring, shadow);
      }

      if (isCurrent) {
        const check = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        check.setAttribute('text-anchor', 'middle');
        check.setAttribute('dominant-baseline', 'central');
        check.setAttribute('font-size', `${16 * nodeScale}`);
        check.setAttribute('fill', '#fff');
        check.textContent = '✓';
        g.appendChild(check);
      }

      if (isBossNode && typeof state !== 'undefined' && state.isEndlessMode
          && window.matchMedia('(pointer: coarse)').matches) {
        const trainerData = typeof endlessState !== 'undefined' && endlessState.currentRegion
          ? endlessState.currentRegion.trainers[endlessState.mapIndexInRegion]
          : null;
        if (trainerData?.speciesIds?.length) {
          const ids = trainerData.speciesIds;
          const iconSize = 28;
          const gap = 3;
          const totalW = ids.length * iconSize + (ids.length - 1) * gap;
          const startX = -(totalW / 2);
          const startY = ih / 2 - 24;
          const BASE = 'sprites/pokemon/';
          ids.forEach((id, i) => {
            const lvl = (trainerData.level ?? 0) + (trainerData.levelOffsets?.[i] ?? i);
            const cx = startX + i * (iconSize + gap) + iconSize / 2;

            const lvlText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            lvlText.setAttribute('x', cx);
            lvlText.setAttribute('y', startY - 2);
            lvlText.setAttribute('text-anchor', 'middle');
            lvlText.setAttribute('font-family', "'Press Start 2P', monospace");
            lvlText.setAttribute('font-size', '5');
            lvlText.setAttribute('fill', '#fff');
            lvlText.setAttribute('paint-order', 'stroke');
            lvlText.setAttribute('stroke', '#000');
            lvlText.setAttribute('stroke-width', '2');
            lvlText.textContent = `${lvl}`;
            g.appendChild(lvlText);

            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            icon.setAttribute('href', `${BASE}${id}.png`);
            icon.setAttribute('x', startX + i * (iconSize + gap));
            icon.setAttribute('y', startY);
            icon.setAttribute('width', iconSize);
            icon.setAttribute('height', iconSize);
            icon.setAttribute('image-rendering', 'pixelated');
            g.appendChild(icon);
          });
        }
      }

    } else {
      // ---- Circle-based node ----
      const r = (isBossNode ? 22 : 18) * nodeScale;

      // soft ground shadow so the token sits ON the map
      const cShadow = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      cShadow.setAttribute('cy', r * 0.9);
      cShadow.setAttribute('rx', r * 0.85);
      cShadow.setAttribute('ry', 4 * nodeScale);
      cShadow.setAttribute('fill', 'rgba(0,0,0,0.32)');
      g.appendChild(cShadow);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', r);
      circle.setAttribute('fill', isInaccessible ? '#2a2a3a' : getNodeColor(node));
      circle.setAttribute('stroke', isClickable ? '#fff' : (isInaccessible ? '#444' : '#555'));
      circle.setAttribute('stroke-width', isClickable ? '3' : '1');

      if (isClickable) {
        // expanding pulse ring, same language as the sprite nodes
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('r', r);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', '#ffd76b');
        ring.setAttribute('stroke-width', '2.5');
        const ringR = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        ringR.setAttribute('attributeName', 'r');
        ringR.setAttribute('values', `${r};${r + 11}`);
        ringR.setAttribute('dur', '1.4s');
        ringR.setAttribute('repeatCount', 'indefinite');
        ring.appendChild(ringR);
        const ringO = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        ringO.setAttribute('attributeName', 'stroke-opacity');
        ringO.setAttribute('values', '0.9;0');
        ringO.setAttribute('dur', '1.4s');
        ringO.setAttribute('repeatCount', 'indefinite');
        ring.appendChild(ringO);
        g.appendChild(ring);
      }
      g.appendChild(circle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', `${14 * nodeScale}`);
      text.setAttribute('fill', isInaccessible ? '#aaa' : '#fff');
      text.textContent = isCurrent ? '✓' : getNodeIcon(node);
      g.appendChild(text);
    }

    const label = getNodeLabel(node);
    let hoverLabel = label;
    if (node.type === NODE_TYPES.BOSS && typeof state !== 'undefined' && state.isEndlessMode) {
      const trainerData = typeof endlessState !== 'undefined' && endlessState.currentRegion
        ? endlessState.currentRegion.trainers[endlessState.mapIndexInRegion]
        : null;
      if (trainerData?.speciesIds?.length) {
        const BASE = 'sprites/pokemon/';
        const imgs = trainerData.speciesIds.map(id =>
          `<img src="${BASE}${id}.png" style="width:28px;height:28px;image-rendering:pixelated;" onerror="this.style.display='none'">`
        ).join('');
        const name = trainerData.archetype?.name || '???';
        hoverLabel = `<div style="font-size:7px;margin-bottom:3px;text-align:center;">${name}</div><div style="display:flex;flex-wrap:wrap;gap:2px;justify-content:center;">${imgs}</div>`;
      }
    }
    g.addEventListener('mouseenter', e => { if (_hoverEnabled) _mapTooltip.show(hoverLabel, e.clientX, e.clientY); });
    g.addEventListener('mousemove',  e => { _mapTooltip.move(e.clientX, e.clientY); if (_hoverEnabled) _mapTooltip.show(hoverLabel, e.clientX, e.clientY); });
    g.addEventListener('mouseleave', () => _mapTooltip.hide());

    // Prevent native long-press image menu on mobile
    g.addEventListener('contextmenu', e => e.preventDefault());

    // Touch: long press shows the docked info sheet, short tap enters node.
    // The sheet STAYS OPEN after lifting the finger (it was hidden on
    // touchend, forcing you to read it under your own hand) — it closes on
    // tapping anywhere outside a node (document handler above).
    let _lpTimer = null;
    let _lpFired = false;
    g.addEventListener('touchstart', e => {
      _lpFired = false;
      const touch = e.touches[0];
      _lpTimer = setTimeout(() => {
        _lpFired = true;
        _mapTooltip.show(hoverLabel, touch.clientX, touch.clientY);
      }, 350);
    }, { passive: true });
    g.addEventListener('touchmove', () => {
      clearTimeout(_lpTimer);
      _mapTooltip.hide();
    }, { passive: true });
    g.addEventListener('touchend', e => {
      clearTimeout(_lpTimer);
      if (!_lpFired && isClickable) onNodeClick(node);
      e.preventDefault();
    });

    if (isClickable) {
      g.addEventListener('click', () => onNodeClick(node));
    }

    svg.appendChild(g);
  }

  container.appendChild(svg);
}

function getNodeColor(node) {
  // The START node doubles as the run's mode indicator — a subtle blue tint
  // for Normal, subtle red tint for Nuzlocke. Kept close to the default
  // gray-blue (#4a4a6a) so it reads as flavour, not a UI shout.
  if (node.type === NODE_TYPES.START) {
    const nuz = typeof state !== 'undefined' && state.nuzlockeMode;
    return nuz ? '#6a4050' : '#3a4566';
  }
  if (node.visited) return '#333';
  const colors = {
    [NODE_TYPES.START]:      '#4a4a6a',
    [NODE_TYPES.BATTLE]:     '#6a2a2a',
    [NODE_TYPES.CATCH]:      '#2a6a2a',
    [NODE_TYPES.ITEM]:       '#2a4a6a',
    [NODE_TYPES.QUESTION]:   '#6a4a2a',
    [NODE_TYPES.BOSS]:       '#8a2a8a',
    [NODE_TYPES.POKECENTER]: '#006666',
    [NODE_TYPES.TRAINER]:    '#6a3a1a',
    [NODE_TYPES.LEGENDARY]:  '#7a6a00',
    [NODE_TYPES.MOVE_TUTOR]: '#3a4a6a',
    [NODE_TYPES.TRADE]:      '#1a5a5a',
    [NODE_TYPES.SILVER]:     '#5a2a7a',
  };
  return colors[node.type] || '#444';
}

function getNodeIcon(node) {
  if (node.visited) return '✓';
  const icons = {
    [NODE_TYPES.START]:      '★',
    [NODE_TYPES.BATTLE]:     '⚔',
    [NODE_TYPES.CATCH]:      '⬟',
    [NODE_TYPES.ITEM]:       '✦',
    [NODE_TYPES.QUESTION]:   '?',
    [NODE_TYPES.BOSS]:       '♛',
    [NODE_TYPES.POKECENTER]: '+',
    [NODE_TYPES.TRAINER]:    '⚑',
    [NODE_TYPES.LEGENDARY]:  '⚝',
    [NODE_TYPES.MOVE_TUTOR]: '♪',
    [NODE_TYPES.TRADE]:      '⇄',
    [NODE_TYPES.SILVER]:     '⚔',
  };
  return icons[node.type] || '●';
}

function getSilverHoverLabel() {
  if (typeof SILVER_ENCOUNTERS === 'undefined') {
    return 'Rival Silver — +3 Levels';
  }
  // Encounter scales to the current map slot, not the win count, so skipping
  // earlier Silver fights doesn't trivialize a later one.
  const SILVER_ENC_BY_MAP = { 1: 0, 3: 1, 5: 2, 7: 3 };
  const mapIdx     = (typeof state !== 'undefined') ? state.currentMap : 1;
  const idx        = SILVER_ENC_BY_MAP[mapIdx] ?? 0;
  // Gens 3-5: the rival slot is a villain-team ambush instead of Silver.
  const _hlGen = typeof state !== 'undefined' && typeof getRunGen === 'function' ? getRunGen() : '1';
  const isGen3 = _hlGen === '3' && typeof AQUA_MAGMA_ENCOUNTERS !== 'undefined';
  const isGen45 = (_hlGen === '4' && typeof GALACTIC_ENCOUNTERS !== 'undefined')
    || (_hlGen === '5' && typeof PLASMA_ENCOUNTERS !== 'undefined');
  const isVillainLbl = isGen3 || isGen45;
  const data = isGen3
    ? AQUA_MAGMA_ENCOUNTERS[state.villainTeam || 'aqua'][Math.min(idx, 3)]
    : isGen45
    ? (_hlGen === '4' ? GALACTIC_ENCOUNTERS : PLASMA_ENCOUNTERS)[Math.min(idx, 3)]
    : SILVER_ENCOUNTERS[Math.min(idx, SILVER_ENCOUNTERS.length - 1)];
  const team       = data.team.slice();
  const starterId  = (!isVillainLbl && typeof state !== 'undefined') ? state.starterSpeciesId : null;
  const starterArr = starterId && typeof SILVER_STARTER_LINES !== 'undefined' ? SILVER_STARTER_LINES[starterId] : null;
  if (starterArr && team.length) {
    const stage  = idx < 1 ? 0 : idx < 3 ? 1 : 2;
    const last   = team[team.length - 1];
    team[team.length - 1] = { ...starterArr[stage], level: last.level };
  }
  const teamHtml = team.map(p =>
    `<div style="color:#ccc;font-size:9px;">${p.name} <span style="color:#aaa;">Lv${p.level}</span></div>`
  ).join('');
  const nuzlockeMode = typeof state !== 'undefined' && state.nuzlockeMode;
  const noPermaDeath = nuzlockeMode
    ? `<div style="color:#7ecf7e;font-size:9px;margin-bottom:4px;">No Perma-Death</div>`
    : '';
  const title = isVillainLbl ? data.leader : 'Rival Silver';
  return `<div style="font-weight:bold;margin-bottom:2px;">${title}</div>` +
         `<div style="color:#ffd76b;font-size:9px;">+3 Levels for the whole team</div>` +
         `<div style="color:#7ecf7e;font-size:9px;margin-bottom:4px;">Heals you after battle</div>` +
         noPermaDeath +
         teamHtml;
}

function getNodeLabel(node) {
  if (node.visited) return 'Visited';
  if (node.type === NODE_TYPES.BOSS) {
    const mi = node.mapIndex ?? -1;
    const bothGens = typeof state !== 'undefined' && state.bothGens;
    const rolledGen = bothGens && mi >= 0 && mi < 8 && state.gymGens ? state.gymGens[mi] : 0;
    const isGen3 = (typeof state !== 'undefined' && typeof getRunGen === 'function' && getRunGen() === '3') ||
      rolledGen === 3;
    const isGen2 = !isGen3 && ((typeof state !== 'undefined' && state.gen2Mode) || rolledGen === 2);
    const _lblGen = typeof state !== 'undefined' && typeof getRunGen === 'function' ? getRunGen() : '1';
    const leaders = (_lblGen === '4' || rolledGen === 4) && typeof SINNOH_GYM_LEADERS !== 'undefined' ? SINNOH_GYM_LEADERS
      : (_lblGen === '5' || rolledGen === 5) && typeof UNOVA_GYM_LEADERS !== 'undefined' ? UNOVA_GYM_LEADERS
      : isGen3 ? (typeof HOENN_GYM_LEADERS !== 'undefined' ? HOENN_GYM_LEADERS : null)
      : isGen2 ? (typeof JOHTO_GYM_LEADERS !== 'undefined' ? JOHTO_GYM_LEADERS : null)
      : (typeof GYM_LEADERS !== 'undefined' ? GYM_LEADERS : null);
    if (leaders && mi >= 0 && mi < leaders.length) {
      const leader = leaders[mi];
      const teamHtml = leader.team.map(p => `
        <div class="tt-poke-row">
          <img class="tt-poke-sprite" src="sprites/pokemon/${p.speciesId}.png" onerror="this.style.visibility='hidden'">
          <span class="tt-poke-name">${p.name}</span>
          ${p.heldItem && typeof itemIconHtml === 'function' ? `<span class="tt-poke-item">${itemIconHtml(p.heldItem, 16)}</span>` : ''}
          <span class="tt-poke-lv">Lv${p.level}</span>
        </div>`).join('');
      return `<div class="tt-title">${leader.name} — ${leader.type} Gym</div><div class="tt-team">${teamHtml}</div>`;
    }
    if (_lblGen === '4' && mi === 8) return '<div style="font-weight:bold;">Elite Four &amp; Cynthia</div>';
    if (_lblGen === '5' && mi === 8) return '<div style="font-weight:bold;">Elite Four &amp; Alder</div>';
    if (isGen3 && mi === 8) return '<div style="font-weight:bold;">Elite Four &amp; Steven</div>';
    if (isGen2 && mi === 8) return '<div style="font-weight:bold;">Elite Four &amp; Lance</div>';
    if (typeof ELITE_4 !== 'undefined' && mi === 8) {
      return '<div style="font-weight:bold;">Elite Four &amp; Champion</div>';
    }
    return 'Gym Leader';
  }
  const isGen2Mode = typeof state !== 'undefined' &&
    (state.gen2Mode || (typeof getRunGen === 'function' && ['3', '4', '5'].includes(getRunGen())));
  const labels = {
    [NODE_TYPES.START]:      'Start',
    [NODE_TYPES.BATTLE]:     'Wild Battle — no XP',
    [NODE_TYPES.CATCH]:      'Catch Pokemon',
    [NODE_TYPES.ITEM]:       'Item',
    [NODE_TYPES.QUESTION]:   'Random Event',
    [NODE_TYPES.POKECENTER]: 'Pokemon Center',
    [NODE_TYPES.TRAINER]:    (node.trainerSprite && TRAINER_SPRITE_NAMES[node.trainerSprite])
      ? `<div class="tt-title">${TRAINER_SPRITE_NAMES[node.trainerSprite]}</div>` +
        `<div class="tt-sub">+2 Levels — ${(isGen2Mode && TRAINER_SPECIALTIES_GEN2[node.trainerSprite]) || TRAINER_SPECIALTIES[node.trainerSprite] || 'Various Pokemon'}</div>`
      : 'Trainer Battle — +2 Levels',
    [NODE_TYPES.LEGENDARY]:  'Legendary Pokemon',
    [NODE_TYPES.MOVE_TUTOR]: 'Move Tutor',
    [NODE_TYPES.TRADE]:      'Trade — swap a Pokémon for one 3 levels higher',
    [NODE_TYPES.SILVER]:     getSilverHoverLabel(),
  };
  return labels[node.type] || node.type;
}

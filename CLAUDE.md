# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A client-side Pokémon roguelike (fork of pokelike.xyz). Pure vanilla JS/CSS/HTML — **no build step, no package manager, no tests, no linter**. Edit a file, reload the browser.

## Running

Must be served over HTTP (fails via `file://`):

```bash
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

`index.html` appends `?v=Date.now()` cache-busters to every CSS/JS include, so a plain reload always picks up edits.

Internet is required at runtime: Pokémon/trainer sprites load from PokeAPI and Pokémon Showdown CDNs.

Deployment is automatic: push to `main` → GitHub Pages via `.github/workflows/static.yml` (uploads the repo as-is). Live at https://pcasaspere.github.io/pokelike_v2/.

## Architecture

All JS files are classic scripts sharing one global scope, loaded in a fixed order from `index.html` (order matters — later files call functions/consts defined in earlier ones):

`data` → `map` → `battle` → `endless` → `ui` → `game` → `rules` → `cloud-save`

- `js/data.js` — TYPE_CHART, MOVE_POOL (per-type physical/special move tiers), gym leaders, Elite Four, items. Also fetches the bundled `data/pokedex.json` once at boot (names/types/stats for #1–251).
- `js/map.js` — branching node-map generation. `NODE_TYPES` and per-layer `NODE_WEIGHTS` control what appears on each map layer.
- `js/battle.js` — the ONE battle engine: a round-stepper (`runBattleRound`/`executeTurn`) driven through an injected `io` object. `runBattle` (async) is the auto driver (Battle Tower); `runInteractiveBattle` in game.js is the campaign driver. The auto path's rng/event order is load-bearing for Tower replays — verify battle.js changes with a seeded golden-log harness (Node vm + mulberry32 rng stub, diff `detailedLog` at fixed seeds) before shipping. Struggle fallbacks are Tower-only; the campaign resolves mutual-immunity standoffs via the deadlock flow in `runBattleScreen`.
- `js/endless.js` — Battle Tower mode (auto-battle gauntlet) with its own trait/tier system and its own seeded RNG; state is separate from the main run.
- `js/ui.js` — all DOM rendering: screens (`showScreen(id)` toggles the screen divs in `index.html`), team bar, battle field, and the per-move canvas attack animations (`anim*` functions drawing on `#battle-anim-canvas`).
- `js/game.js` — central mutable `state` object, main loop, node handlers (`onNodeClick` → `doBattleNode`/`doCatchNode`/`doBossNode`/…), run persistence, achievements.
- `js/rules.js` — human-readable rules modal **and** a machine-readable spec (`window.POKELIKE_RULES`, mirrored into `<script id="pokelike-llm-spec">`) that documents rules + DOM driving instructions so an LLM can play the game. Update it when gameplay rules change.
- `js/cloud-save.js` — optional sync to an external server (`save.pokelike.xyz`). The game must keep working when it's unreachable; all fetches have per-call-site timeouts because `initGame()` awaits `initCloudSave()`.

Game modes: Normal / Nuzlocke (permadeath) / Battle Tower; generations Gen 1, Gen 2, Gen 3 (Hoenn, with Team Aqua/Magma rival encounters), or "Tot" (all three mixed; leaders rolled per map, boss levels normalized). Gen selection lives in `state.runGen` ('1'|'2'|'3'|'all') with `getRunGen()` falling back to the legacy `gen2Mode`/`bothGens` booleans for old saves; per-gen tables are centralized in `GEN_RUN_CONFIG` (data.js) — branch new gen logic there, never on new booleans.

## Conventions

- **RNG**: use `rng()` (seeded mulberry32 in `game.js`), never `Math.random()`, for any game logic — the seed is saved/restored with the run. `endless.js` has its own `seededRng` for region rolls.
- **Reset safety**: `runGeneration` (game.js) is bumped whenever a run (re)starts. Long-lived async work (battle loops, animation callbacks) must capture it at start and bail if it changed, so mid-battle resets can't corrupt the new run.
- **Persistence**: everything is `localStorage`, keys prefixed `poke_` (`poke_current_run` for the in-progress run, `poke_meta`, `poke_dex`, `poke_endless_state`, etc.). `saveRun()` serializes `state` with the RNG seed; changing the shape of `state` affects existing saves.
- Screens are `<div>`s in `index.html` shown/hidden by `showScreen(id)`; there is no router.

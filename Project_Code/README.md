# QuestForge

A browser RPG for learning **Data Structures, Algorithms (C)** and **Object-Oriented Programming (C++)**.
The pixel art (16×16 tiles, 16×24 characters) is cut from the reference sheet in `assets/reference/`, and every map is a Tiled map built from it.

## Run it

Requirements: Node.js 18+, and `gcc` / `g++` on PATH (MinGW-w64 or MSYS2 on Windows).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. `npm run dev` compiles the native engines if needed, then starts the API server (port 3001) and Vite (port 5173).

Other scripts:

| Script | What it does |
|---|---|
| `npm run build:native` | Compile `native/c` → `native/bin/dsa_engine`, `native/cpp` → `native/bin/oop_engine` |
| `npm run build:assets` | Re-cut the art from `assets/reference/questforge_reference.webp` (needs Python + Pillow). Output is committed, so only needed after changing the extractor |
| `npm run build:maps` | Regenerate the Tiled maps in `assets/maps/` and check the graph each one produces |
| `npm test` | Native engine, HTTP API and data tests (`node:test`) |
| `npm start` | Build the frontend and serve everything from http://localhost:3001 |

The API port can be changed with `QUESTFORGE_API_PORT` (update the proxy in `vite.config.js` too).

## Controls

| Key | Action |
|---|---|
| 1 / 2 (title screen) | Choose hero / heroine |
| WASD / Arrows | Move |
| E | Interact / continue dialogue |
| 1–9, ↑/↓ | Pick a dialogue choice |
| H / F (Lost Path) | BFS lantern / DFS scout |
| Q / I / TAB | Quest log / inventory / **DSA inspector** (live C memory) |
| ESC | Leave a challenge |
| M | Mute |

## Architecture

```
Phaser (browser)  --HTTP+JSON-->  Express (server/)  --stdin/stdout lines-->  dsa_engine (C)
                                                     --stdin/stdout lines-->  oop_engine (C++)
```

* The browser never runs C/C++. `src/net/NativeApi.js` is its only route to the engines.
* Each engine is a **long-running process** (`server/native/NativeProcess.js`): one command per line in, one JSON object per line out, serialised so responses always match their requests. Because the process stays alive, stacks, queues, lists, the quest chain and C++ objects live in native memory for the whole session.
* `NativeProcess` is the only class that knows the transport; an N-API addon or WebAssembly bridge could replace it with the same `send(command) → Promise<json>` shape.
* All input is validated in `server/validation.js` before it reaches an engine (single-token protocol, no newlines).

### Where each concept is real

| Concept | Native code | Used in the game by |
|---|---|---|
| Linked list | `native/c/linked_list.c`, `quest_chain.c` | Quest progression (complete → follow `next` → unlock) |
| Stack | `native/c/stack.c` | Player action history (TAB inspector), route/backtracking in Lost Path, iterative DFS |
| Queue (circular buffer) | `native/c/queue.c` | Game events → notifications (FIFO pump in `HUDScene`), BFS frontier |
| Graph | `native/c/graph.c` | Lost Path (graph derived from the Tiled map, see below) |
| BFS / DFS | `bfs.c`, `dfs.c` | Lost Path lantern hint (H), scout (F), end-of-challenge comparison drawn on the forest |
| Classes, encapsulation | `native/cpp/Player.*` (private inventory) | Every reward / item check |
| Inheritance, abstraction | `GameEntity → Character → Player/NPC`, `GameEntity → InteractiveObject → Door/Chest/QuestObject` | All world entities are created as C++ objects at new game |
| Polymorphism, virtual functions | `interact()`, `greeting()`, `writeExtraJson()` | Each NPC greets differently; Guard overrides `interact()`; Door/Chest/QuestObject behave differently through the same call |

### Frontend layout

```
src/
  main.js                 Phaser config (960x640, 3:2)
  config/                 constants, asset manifest (assets.js)
  net/                    ApiClient + NativeApi
  scenes/                 Boot → World ⇄ Quest, HUD overlay
  systems/                QuestManager, DialogueSystem, InteractionSystem, MapManager, MapData, MapGraph,
                          InventorySystem, ActionHistory (stack), EventQueue (queue), AudioManager
  entities/               GameEntity, Player, NPC, InteractiveObject
  rendering/              EntityView (sprite, placeholder fallback), FogOfWar
  ui/                     DialogueBox, InteractionPrompt, Notification, QuestUI, DsaInspector, ResultPanel, Button
  challenges/             BaseChallenge + one class per quest type (registry.js)
  data/                   quests, npcs/objects, map registry (world.js), graph settings,
                          assetCatalog.js (generated: every extracted image, size, footprint)
```

* **One quest system.** Quests are data (`src/data/quests.js`). Status lives in the C linked list. `QuestManager` applies the returned snapshots; it never unlocks anything on its own.
* **Data-driven interaction.** `InteractionSystem` handles every NPC and object. `DialogueSystem` builds conversations from the NPC's C++ greeting plus the quest's status-specific lines.
* **Pluggable challenges.** `QuestScene` looks up `quest.challenge` in `challenges/registry.js`. To add gameplay, write a class and register it.

## Quests

1. **Lost Path** (Guide): walk the Whispering Woods under fog of war. BFS lantern, DFS scout, BFS vs DFS vs your route drawn on the forest.

More quests are planned. Each one is added to `src/data/quests.js`; the order of that array is the order of the quest linked list in C, so a new quest unlocks when the previous one is completed.

## Art and maps

```
assets/reference/questforge_reference.webp   the original reference sheet (source of all art)
        │  scripts/extract_assets.py          measured crop boxes, background removal, 16x24 frames
        ▼
assets/tilesets/{terrain,nature,town,castle,interiors,maze}/   tiles + props
assets/sprites/{player,npcs,objects}/   assets/items/   assets/ui/
src/data/assetCatalog.js                  url, size, collision footprint of every file
        │  scripts/build-maps.mjs              Tiled JSON (embedded tilesets), checked graphs
        ▼
assets/maps/{village,lost_path}.json   (open in Tiled to edit)
```

* `assets/reference/extracted_contact_sheet.png` shows every extracted image for a quick visual check.
* Gameplay code never uses file paths: `src/config/assets.js` maps asset IDs (player looks, NPC sprites, object sprites, item icons, UI frames) to texture keys.
* Map layers: `Ground` (tiles; tileset properties `collides` and `terrain`), `Blocked` (invisible collision tiles), `Props` (image tiles, y-sorted so you walk behind trees), `Collision` (prop footprints), `Entities` (`ref`, `kind` = npc / object / ambient / shelf / questObject), `Spawns`, `Nodes` (graph zones).
* Art is 16 px and drawn at 2× with nearest-neighbour (`pixelArt: true`).

### From map to algorithm

```
Tiled map ─► walkable / blocked tile grid ─► zones (Nodes layer) ─► graph ─► C engine (BFS/DFS) ─► gameplay
```

`src/systems/MapGraph.js` builds the graph from the map: each clearing/town zone is a node, and an edge exists exactly where a walkable corridor joins two zones without passing through a third. For weighted maps the edge weight is the sum of the terrain factors of the tiles along the corridor. A per-tile graph would exceed the engine's 256-node limit; zones keep the graph small and match what the player experiences. `build-maps.mjs` fails if a map's corridors produce a graph different from the design (e.g. two trails merging), and the tests check the derived graphs too.

## Adding art

* New crop from the reference: add a box to `scripts/extract_assets.py` and run `npm run build:assets`; it appears in `assetCatalog.js` and is loaded automatically.
* New map content: edit `scripts/build-maps.mjs` (or edit the JSON in Tiled) and run `npm run build:maps`. Note that `build:maps` overwrites hand edits made in Tiled.
* Sounds: add files to `assets/audio/` and list them in `ASSET_MANIFEST.audio`; `AudioManager` already calls `play('talk')` etc. and silently skips missing sounds.

## Limitations (by design for this prototype)

* State is in memory per server process; starting a new game resets it. One player per server. No database, no save file.
* The game needs the native engines; if they are not built, the boot screen says so instead of faking results.

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
| `npm test` | Native engine, HTTP API, data and leaderboard tests (`node:test`). Set `MONGODB_TEST_URI` to also run the store tests against a real MongoDB (they use and then drop a throw-away `questforge_test_*` database) |
| `npm run feedback [n]` | Print the latest player feedback from MongoDB (needs `MONGODB_URI`) |
| `npm start` | Build the frontend and serve everything from http://localhost:3001 |

The API port can be changed with `QUESTFORGE_API_PORT` (update the proxy in `vite.config.js` too).

## Controls

| Key | Action |
|---|---|
| 1 / 2 (title screen) | Choose hero / heroine |
| L / F (title and end screen) | Leaderboard / send feedback |
| S (end screen) | Save your score to the leaderboard |
| WASD / Arrows | Move |
| E | Interact / continue dialogue |
| 1–9, ↑/↓ | Pick a dialogue choice |
| H / F (Lost Path) | BFS lantern / DFS scout |
| ENTER / SPACE, S, R, 1–4 (lessons) | Next step, skip repeated steps, restart the part, answer a prediction |
| ← / → (Royal Registry practice) | Send the record left / right |
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
| Linked list | `native/c/linked_list.c`, `quest_chain.c` | Quest progression (complete → follow `next` → unlock). Tower floor 3 |
| Stack | `native/c/stack.c` | Player action history (TAB inspector), route/backtracking in graph challenges, iterative DFS, Tower Stack Chamber (`STACK_CREATE` sets a capacity: full = overflow, empty = underflow) |
| Circular queue | `native/c/queue.c` (FRONT, REAR, size; `index = (index + 1) % capacity`) | Game events → notifications (FIFO pump in `HUDScene`), BFS frontier, Tower Queue Chamber |
| Linear queue | `native/c/queue.c` (`LQUEUE_*`) | Tower Queue Chamber: shows why freed slots are wasted without wrap-around |
| Graph | `native/c/graph.c` | Lost Path, Royal Route (graph derived from the Tiled map, see below) |
| BFS / DFS | `bfs.c`, `dfs.c`, `search_trace.c` | Lost Path lantern hint (H), scout (F) and the step-by-step walkthroughs: `TRACE` runs the same search with a recorder that copies the real queue / stack after every operation |
| AVL tree | `native/c/avl.c` | Garden of Balance: `AVL_INSERT` returns every step (placement, imbalance + case, each rotation) with a snapshot of the tree; heights, balance factors and validity are computed in C. Duplicates are ignored; no deletion |
| Binary search tree | `native/c/bst.c` | Royal Registry: every insert, search and in-order listing, with the comparisons C made |
| Bubble / Selection / Insertion Sort | `native/c/sort.c` | Order of the Forge: `SORT_START` copies the rack into C, each `SORT_STEP` performs ONE compare / swap / shift / insert and returns the whole state |
| Dijkstra / A* | `dijkstra.c`, `astar.c`, `priority_queue.c` | Royal Route: judges the route the player walked; both routes drawn on the roads, a courier walks the optimal one |
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
                          InventorySystem, ActionHistory (stack), EventQueue (queue), AudioManager,
                          Walkthrough (player-paced lesson steps, skip repeated steps)
  entities/               GameEntity, Player, NPC, InteractiveObject
  rendering/              EntityView (sprite, placeholder fallback), FogOfWar, GraphOverlay, TreeView
  ui/                     DialogueBox, InteractionPrompt, Notification, QuestUI, DsaInspector, ResultPanel, Button,
                          LessonPanel (explanation panel shared by the lessons)
  challenges/             BaseChallenge + one class per quest type (registry.js),
                          lessons/ (BFS / DFS / BST steps built from C engine responses)
  data/                   quests, npcs/objects, map registry (world.js), graph settings,
                          assetCatalog.js (generated: every extracted image, size, footprint)
```

* **One quest system.** Quests are data (`src/data/quests.js`). Status lives in the C linked list. `QuestManager` applies the returned snapshots; it never unlocks anything on its own.
* **Data-driven interaction.** `InteractionSystem` handles every NPC and object. `DialogueSystem` builds conversations from the NPC's C++ greeting plus the quest's status-specific lines.
* **Pluggable challenges.** `QuestScene` looks up `quest.challenge` in `challenges/registry.js`. To add gameplay, write a class and register it.

## Quests

1. **Lost Path** (Guide): walk the Whispering Woods under fog of war while a journal draws the graph you discover. At the shrine, BFS (to the shrine) and DFS (a full traversal) are replayed one C operation at a time on the forest map, then compared.
2. **The Royal Registry** (King): the King's numbered records become a Binary Search Tree. Guided insertion, a successful and an unsuccessful search, then the player guides records down the tree; every move is checked against the path C reports. (The Royal Route challenge and its Dijkstra / A* code are kept, but no quest uses them now.)
3. **The Order of the Forge** (Blacksmith): sort a weapon rack lightest to heaviest. Bubble, Selection and Insertion Sort are walked through one C operation at a time (predictions, skip a pass, restart), then the player picks one and makes every decision on a new crate. (The old ore-gathering `ForgeChallenge` and its map are kept, but no quest uses them now.)
4. **The Unbalanced Garden** (Elarion, the Garden Keeper, by the hedged garden at the south-west of the village where the library used to be; enter through the Garden of Balance gate): AVL trees in five stages - a crooked BST, height and balance factor (click nodes to inspect), the four rotations (LL, RR, LR, RL), guided practice and a graded final restoration. Every insertion and rotation runs in C.
5. **Human Etiquette** (King, in the castle courtyard): dialogue only. Rewards the Royal Seal.
6. **Tower of Trials** (Guard, entered through the Tower Door on the island, which needs the Seal): Stack Chamber, Queue Chamber (linear, then circular queue), Comparison Chamber and the Guardian's trial. Chambers unlock in order; progress is kept in the quest. Every operation runs in C, including overflow and underflow.

Quests unlock in this order because they form one linked list.

**The ending.** When the C quest chain reports every main quest COMPLETED (after the Tower), the HUD says "Return to King Aldric" and the King gets a "!". Talking to him plays his farewell once; after the last line the world fades out and `EndScene` shows *A New Journey Awaits* with the journey statistics (player name from `services.profile`, falling back to "Explorer"; main quests from the quest data; bonus coin locations = village objects with `bonus: true`, opened state and gold read from the C++ `Chest` objects), over the title-screen music. *Return to Title Screen* goes back to the title; a new game resets everything. Ending text: `src/data/ending.js`, logic: `src/systems/Adventure.js`. State is per session (nothing is saved across page reloads).

## Leaderboard and feedback (MongoDB)

At the end of a journey, *Save Score* asks for an explorer name and posts the run; the title screen and end screen both have *Leaderboard* and *Feedback*.

**Score** (`src/data/scoring.js`, shared by browser and server):

| Part | Points |
|---|---|
| Main quests completed | 100 each |
| First-try answers to lesson questions | up to 400 (400 × first-try correct / questions asked) |
| Bonus coins collected | 2 each |

Ties go to the faster journey (wall-clock time from New Game to the King's farewell), then the earlier run. A question counts once, on its first attempt (`src/systems/ScoreKeeper.js`, fed by `Walkthrough.answer` / `LiveWalkthrough.answer`), so retrying after a wrong pick or restarting a lesson cannot raise accuracy. The leaderboard shows each name's best run (names compare case-insensitively). The server **recomputes** the score from its parts and rejects impossible numbers; only finished journeys can be submitted, and games that used the dev quest jump (`?quest=` / F9) cannot be submitted.

**Feedback** stores a 1–5 rating, a 3–500 character message, an optional name, where it was sent from (title / end) and the date. No IP addresses are stored. Feedback has no public API route; read it with `npm run feedback`.

**Setup with MongoDB Atlas (free tier):**

1. Create a free cluster at https://www.mongodb.com/cloud/atlas, add a database user, and allow your IP under *Network Access*.
2. *Connect → Drivers* gives a connection string. Copy `.env.example` to `.env` and set `MONGODB_URI` to it (with your database user's password). `.env` is git-ignored - never commit it or paste the string into code.
3. Restart `npm run dev`. The server log says `Leaderboard + feedback: MongoDB (database "questforge")`. The `runs` and `feedback` collections and their indexes are created on first use.

Without `MONGODB_URI` the server keeps scores and feedback **in memory only** (lost when it stops) and the game says so in every panel. If the database is unreachable the API answers `503 STORE_UNAVAILABLE` and the rest of the game keeps working.

API (`server/routes/online.js`): `GET /api/online/status`, `GET /api/online/leaderboard?limit=10`, `POST /api/online/scores` (10 per 10 min per address), `POST /api/online/feedback` (5 per 10 min per address).

## Deploying (share a link with friends)

**One game per player.** Every browser tab gets a random session id (`sessionStorage`, sent as `X-QuestForge-Session`), and the server runs a private C + C++ engine pair for each session (`server/sessions.js`). Friends playing at the same time never share a quest chain, inventory or world. Leaderboard and feedback are shared.

* A session starts on the title screen (`GET /api/health` / `POST /api/game/reset`).
* After `QUESTFORGE_SESSION_IDLE_MIN` minutes without requests (default 30) its engines are stopped; the game then says "Session ended" and reloads to the title. A server restart has the same effect (game progress lives in the engines, not in the database).
* At most `QUESTFORGE_MAX_SESSIONS` players at once (default 20); when full, the longest-idle player (idle 5+ minutes) makes room, otherwise newcomers see "The server is full".
* Requests without the header share one `default` session (curl, tests).

**Docker** (`Dockerfile`): the build stage compiles the engines for Linux and bundles the frontend; the run stage holds only the server, `dist/`, `native/bin/` and `src/data` (scoring rules shared with the server). It listens on `$PORT` (set by the host) or 3001, and sets `QUESTFORGE_TRUST_PROXY=1` so rate limits see real client addresses behind the host's proxy. `.env` is excluded from the image (`.dockerignore`).

```bash
docker build -t questforge .
docker run -p 3001:3001 -e MONGODB_URI="<your Atlas string>" -e MONGODB_DB=QuestForge questforge
```

**Render (free) - step by step:**

1. Put the project on GitHub (`.env` is git-ignored; check it is not in the repository before pushing).
2. Atlas → *Network Access* → *Add IP Address* → *Allow access from anywhere* (`0.0.0.0/0`). Cloud hosts have no fixed IP. Your database user's password is then the protection, so use a long random one.
3. Render → *New* → *Blueprint* → pick the repository. `render.yaml` (at the repository root, pointing at `Project_Code/`) creates a free Docker web service and asks for `MONGODB_URI`: paste your Atlas connection string there. `MONGODB_DB` must match your local `.env` exactly (database names are case-sensitive).
4. When the deploy is live, share the `https://….onrender.com` link.

Free-tier notes: the service sleeps after about 15 idle minutes and the next visit takes roughly a minute to wake it (any games in progress are lost when it sleeps). Each player uses two small processes; 10 players at once is a safe start on 512 MB.

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
assets/maps/{village,lost_path,royal_route,garden,forge_yard}.json   (open in Tiled to edit)
```

* `assets/reference/extracted_contact_sheet.png` shows every extracted image for a quick visual check.
* Gameplay code never uses file paths: `src/config/assets.js` maps asset IDs (player looks, NPC sprites, object sprites, item icons, UI frames) to texture keys.
* Map layers: `Ground` (tiles; tileset properties `collides` and `terrain`), `Blocked` (invisible collision tiles), `Props` (image tiles, y-sorted so you walk behind trees), `Collision` (prop footprints), `Entities` (`ref`, `kind` = npc / object / ambient / shelf / questObject), `Spawns`, `Nodes` (graph zones).
* Art is 16 px and drawn at 2× with nearest-neighbour (`pixelArt: true`).

### From map to algorithm

```
Tiled map ─► walkable / blocked tile grid ─► zones (Nodes layer) ─► graph ─► C engine (BFS/DFS/Dijkstra/A*) ─► gameplay
```

`src/systems/MapGraph.js` builds the graph from the map: each clearing/town zone is a node, and an edge exists exactly where a walkable corridor joins two zones without passing through a third. Royal Route edge weights are the sum of the terrain factors of the tiles along the road (so a marsh road really costs more), and are never below the straight-line distance, which keeps the A* heuristic consistent. A per-tile graph would exceed the engine's 256-node limit; zones keep the graph small and match what the player experiences. `build-maps.mjs` fails if a map's corridors produce a graph different from the design (e.g. two trails merging), and the tests check the derived graphs too.

## Adding art

* New crop from the reference: add a box to `scripts/extract_assets.py` and run `npm run build:assets`; it appears in `assetCatalog.js` and is loaded automatically.
* New map content: edit `scripts/build-maps.mjs` (or edit the JSON in Tiled) and run `npm run build:maps`. Note that `build:maps` overwrites hand edits made in Tiled.
* Sounds: add files to `assets/audio/` and list them in `ASSET_MANIFEST.audio`; `AudioManager` already calls `play('talk')` etc. and silently skips missing sounds.

## Limitations (by design for this prototype)

* Game state lives in each player's engine processes: it is lost when the session idles out or the server restarts / sleeps. No save file (MongoDB holds only leaderboard runs and feedback).
* The leaderboard has no accounts: anyone can submit under any name, and a determined player could post made-up numbers within the server's limits. Fine for a class leaderboard; a public one would need sign-in and server-side tracking of answers.
* Rate limits use the client address; behind a reverse proxy set `QUESTFORGE_TRUST_PROXY=1` (the Dockerfile does) or every player shares one limit.
* The game needs the native engines; if they are not built, the boot screen says so instead of faking results.

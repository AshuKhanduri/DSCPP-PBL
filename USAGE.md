# 🎮 QuestForge: Usage & Setup Guide

Welcome to **QuestForge**! This guide details environment setup, native compilation, running the client/server architecture, playing the game, and running automated tests.

---

## 📋 System Prerequisites

Ensure you have the following installed before starting:
1. **Node.js**: `v20.19.0` or higher (Node v22 or v24 recommended). Verify with:
   ```bash
   node --version
   npm --version
   ```
2. **C/C++ Toolchain**:
   - **Windows**: [MinGW-w64](https://www.mingw-w64.org/) or [MSYS2](https://www.msys2.org/) with `gcc` and `g++` on your system `PATH`.
   - **Linux**: `sudo apt install build-essential`
   - **macOS**: `xcode-select --install`
   - Verify compiler availability:
     ```bash
     gcc --version
     g++ --version
     ```
3. **Web Browser**: Any modern evergreen browser with WebGL and ES Module support (Chrome, Edge, Firefox, Brave, Safari).

---

## 🛠️ Installation & Build

All application commands must be executed inside the [`Project_Code/`](file:///c:/Users/Aryan/Desktop/pbl-utkarsh/Project_Code) directory.

### Step 1: Install Node Dependencies
```bash
cd Project_Code
npm install
```

### Step 2: Compile Native C and C++ Engines
QuestForge relies on two compiled native executables located in `Project_Code/native/bin/`:
- `dsa_engine`: Compiled from C11 sources (`native/c/`) with `-std=c11 -O2 -Wall -Wextra -lm`.
- `oop_engine`: Compiled from C++17 sources (`native/cpp/`) with `-std=c++17 -O2 -Wall -Wextra`.

To compile both targets automatically:
```bash
npm run build:native
```
> **Note for Windows**: The build script includes `-static` by default to prevent missing MinGW runtime DLL errors when Node spawns child processes.

---

## 🚀 Running the Game

You have two execution modes available:

### Option A: Unified Dev Server (Recommended)
This launches both the Express backend API (`http://localhost:3001`) and the Vite frontend dev server (`http://localhost:5173`) concurrently:
```bash
npm run dev
```
Navigate to **`http://localhost:5173`** in your browser.

### Option B: Separate Terminal Execution
If you prefer running the client and server in separate terminal windows:
- **Terminal 1 (Backend Express Server)**:
  ```bash
  npm run server
  ```
  *(Server runs on port 3001 and spawns the C & C++ background engines)*
- **Terminal 2 (Frontend Vite Client)**:
  ```bash
  npm run client
  ```
  *(Client runs on port 5173 with automatic `/api` proxying to port 3001)*

---

## 🕹️ Controls & Gameplay Walkthrough

### Keyboard Controls

| Key | Context | Action |
| :--- | :--- | :--- |
| **W, A, S, D** or **Arrow Keys** | All Scenes | Move the Player character |
| **Space** or **E** | Village | Interact with nearby NPCs (dialogue) and objects (chests, shrines, doors) |
| **Enter** / **Space** | Dialogue Box | Advance dialogue messages / Select conversation choices |
| **H** | Whispering Woods (Lost Path) | **Guide's Lantern (BFS)**: Lights the next immediate clearing on the shortest path |
| **F** | Whispering Woods (Lost Path) | **Scout's Vision (DFS)**: Sends a scout to explore clearings in depth-first order |
| **Tab** / **I** | Any Scene | Toggle DSA Inspector HUD |

---

### Step-by-Step Gameplay Flow

#### 1. Awakening in the Village
- You spawn near the village center.
- Walk up to the **Guide** NPC standing near the forest path and press **Space** to converse.
- The dialogue system loads quest dialogue from `src/data/quests.js`.
- Accept the quest **"Lost Path"**. This registers the quest in the C++ `Player` entity and unlocks the quest in the C `quest_chain` linked list.

#### 2. Journey into the Whispering Woods
- Transition onto the **Lost Path** challenge map.
- The map is shrouded in **Fog of War**. Only clearings (graph nodes) you have visited are visible.
- As you walk from clearing to clearing, your route is pushed onto the C **`route` stack**:
  - Walking forward pushes the next node.
  - Backtracking along your footsteps **pops** the previous node from the stack, allowing you to undo wrong turns.
- Use your limited abilities:
  - **Press `H`**: The C `dsa_engine` computes BFS from your current clearing to the Old Shrine and lights the optimal next path.
  - **Press `F`**: The C `dsa_engine` triggers DFS to scout deep unexplored branches.

#### 3. Reaching the Old Shrine
- Once you reach the Old Shrine, the quest completes!
- An analysis panel appears, comparing:
  - **Your Actual Route** (retrieved from the C route stack)
  - **Optimal BFS Path** (shortest hop path calculated in C)
  - **DFS Path** (topological depth traversal)
- Quest rewards (Gold, XP, Guide's Lantern) are awarded directly to the C++ Player object.

---

## 🧪 Testing & Validation

QuestForge includes comprehensive automated tests covering data integrity, map representations, and native engine protocol operations.

Run the test suite:
```bash
cd Project_Code
npm test
```

### What is tested:
- **C Stack**: LIFO ordering, underflow handling, multi-element push/pop.
- **C Circular Queue**: FIFO ordering, capacity limits, circular buffer index wrap-around, overflow errors.
- **C Linked List**: Head/tail insertions, arbitrary node insertions, deletions, order retention.
- **C Quest Chain**: State progression (`LOCKED` ➔ `AVAILABLE` ➔ `ACTIVE` ➔ `COMPLETED`).
- **C Graph & BFS/DFS**: Shortest path optimality via BFS, valid tree exploration via DFS, disconnected graph detection.
- **C++ Entity Hierarchy**: Polymorphic `interact()` dispatch on `Player`, `NPC`, and `InteractiveObject` instances.
- **Map & Asset Integrity**: Verification that all maps and required sprite definitions align.

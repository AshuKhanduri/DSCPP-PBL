# 🏛️ System Architecture & IPC Protocol

QuestForge bridges web technologies with low-level native systems using a decoupled, high-performance **3-Tier Hybrid Architecture**.

---

## 🏗️ Architectural Layers

```mermaid
graph TD
    subgraph Client ["Frontend Client (Phaser 4 + ES Modules)"]
        SceneMgr["Phaser Scene Manager\n(BootScene, WorldScene, QuestScene, HUDScene)"]
        Components["UI Components\n(DialogueBox, DsaInspector, QuestUI)"]
        ClientApi["ApiClient / NativeApi HTTP Layer"]
    end

    subgraph Server ["Middleware Server (Node.js + Express 5)"]
        Router["Express Routing Layer\n(/api/dsa, /api/oop)"]
        DsaService["DsaService.js\nValidation & Tokenization"]
        OopService["OopService.js\nEntity State Synchronization"]
        ProcWrap["NativeProcess.js\nPersistent Child Process Manager"]
    end

    subgraph Native ["Native Engine Layer (C11 & C++17)"]
        DSA["dsa_engine (C11 Binary)\n- Stacks & Queues in heap memory\n- Linked Lists & Quest FSM\n- Graph Adjacency List & BFS/DFS"]
        OOP["oop_engine (C++17 Binary)\n- EntityManager with polymorphic vector\n- GameEntity, Character, Player, NPC\n- InteractiveObject (Chests, Shrines)"]
    end

    SceneMgr --> ClientApi
    Components --> ClientApi
    ClientApi -->|HTTP REST Requests (JSON)| Router
    Router --> DsaService
    Router --> OopService
    DsaService --> ProcWrap
    OopService --> ProcWrap
    ProcWrap -->|Line-buffered ASCII stdin| DSA
    DSA -->|Single-line JSON stdout| ProcWrap
    ProcWrap -->|Line-buffered ASCII stdin| OOP
    OOP -->|Single-line JSON stdout| ProcWrap
```

---

## ⚡ Inter-Process Communication (IPC) Protocol

Instead of embedding heavy native add-on frameworks (like Node-API or WebAssembly) that can complicate compilation across heterogeneous operating systems, QuestForge utilizes **Persistent Standard Input / Output (stdin / stdout) IPC**.

### Characteristics of the IPC Protocol:
1. **Long-Running Daemons**: `dsa_engine` and `oop_engine` are spawned once when Express boots and stay alive indefinitely in memory.
2. **Deterministic State Retention**: All stacks, circular queues, linked lists, and entity objects reside permanently in C/C++ heap memory. State is never recreated per request.
3. **Atomic Request/Response**:
   - The Node middleware writes **one line** to stdin with space-delimited command tokens.
   - The native binary processes the command, serializes the response, and writes **one line of JSON** to stdout followed by `\n`.
   - Node parses the JSON response and fulfills the awaiting Promise.

---

## 📡 REST API Reference

### 1. Data Structures & Algorithms (`/api/dsa`)

| Method | Endpoint | Request Body | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dsa/state` | None | Returns a complete snapshot of all active stacks, queues, and quest chain |
| `POST` | `/api/dsa/stack/push` | `{ stack, value, numericValue }` | Pushes an element onto named stack `stack` (e.g. `'history'` or `'route'`) |
| `POST` | `/api/dsa/stack/pop` | `{ stack }` | Pops the top element from named stack `stack` |
| `POST` | `/api/dsa/stack/clear`| `{ stack }` | Clears all elements from named stack `stack` |
| `GET` | `/api/dsa/stack/:name`| Query: `limit` | Returns top $N$ items of named stack |
| `POST` | `/api/dsa/queue/enqueue`| `{ queue, text, value }` | Enqueues an item into circular buffer `queue` |
| `POST` | `/api/dsa/queue/dequeue`| `{ queue }` | Dequeues the front item from `queue` |
| `POST` | `/api/dsa/path` | `{ algorithm, start, goal, graph }` | Runs BFS or DFS on the provided graph representation in C |

### 2. Object-Oriented Entities (`/api/oop`)

| Method | Endpoint | Request Body | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/oop/entities` | None | Returns serialized list of all entities in the C++ `EntityManager` |
| `POST` | `/api/oop/interact` | `{ id }` | Dispatches `interact()` on entity with identifier `id` |
| `POST` | `/api/oop/player/move`| `{ x, y }` | Updates Player coordinate position in C++ memory |
| `POST` | `/api/oop/reset` | None | Resets the C++ world state and re-seeds default entities |

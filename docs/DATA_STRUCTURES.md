# 🧱 C Data Structures & Algorithms Implementation

All fundamental data structures and graph traversal algorithms in QuestForge are written in clean, standard **C11** with zero external dependencies. They reside in `Project_Code/native/c/`.

---

## 1. Stack (LIFO) - `stack.h` & `stack.c`

Implemented as a singly linked list with a `top` pointer, ensuring strict $O(1)$ push and pop operations without arbitrary array-resizing penalties.

```c
typedef struct StackNode {
    int value;                 /* Numeric payload (e.g. node id) */
    int aux;                   /* Secondary payload */
    char text[DS_TEXT_MAX];    /* Action description / token */
    struct StackNode *next;    /* Pointer to node below */
} StackNode;

typedef struct {
    StackNode *top;
    int size;
} Stack;
```

### Operations & Complexity
- `stack_push(Stack *s, int value, int aux, const char *text)`: Allocates a new `StackNode`, sets its `next` pointer to the current `top`, and updates `top`. **Time: $O(1)$**, **Space: $O(1)$**.
- `stack_pop(Stack *s, StackNode *out)`: Copies top element data to `out`, moves `top` to `top->next`, and frees the old head. **Time: $O(1)$**, **Space: $O(1)$**.
- `stack_peek(const Stack *s)`: Returns a read-only pointer to the top node. **Time: $O(1)$**.
- `stack_clear(Stack *s)`: Repeatedly pops all nodes until `top == NULL`. **Time: $O(N)$**.

### Game Usage:
- **Player Action History**: Stores player actions for display in the DSA Inspector and for undo systems.
- **Route Backtracking**: In the Lost Path challenge, moving between nodes pushes to the route stack; retreating pops from it.

---

## 2. Circular Queue (FIFO) - `queue.h` & `queue.c`

Implemented as a contiguous circular buffer with `head` and `tail` indices that wrap around using modulo arithmetic: `index = (index + 1) % capacity`.

```c
typedef struct {
    int value;
    int aux;
    char text[DS_TEXT_MAX];
} QueueItem;

typedef struct {
    QueueItem *items;
    int capacity;
    int head;   /* Index of front item */
    int tail;   /* Index where next item is written */
    int size;
} Queue;
```

### Operations & Complexity
- `queue_enqueue(Queue *q, int value, int aux, const char *text)`: Inserts item at `items[tail]` and advances `tail = (tail + 1) % capacity`. Rejects if full. **Time: $O(1)$**.
- `queue_dequeue(Queue *q, QueueItem *out)`: Extracts item from `items[head]` and advances `head = (head + 1) % capacity`. Rejects if empty. **Time: $O(1)$**.
- `queue_is_full(const Queue *q)`: Checks if `size == capacity`. **Time: $O(1)$**.
- `queue_is_empty(const Queue *q)`: Checks if `size == 0`. **Time: $O(1)$**.

### Game Usage:
- **Event Dispatcher**: As quest milestones trigger or notifications occur, events are enqueued and processed sequentially in FIFO order.
- **BFS Frontier**: Used internally by Breadth-First Search to track the exploration frontier.

---

## 3. Singly Linked List - `linked_list.h` & `linked_list.c`

Maintains pointers to both `head` and `tail`, supporting $O(1)$ insertions at both ends and arbitrary intermediate insertions via `list_insert_after`.

```c
typedef struct ListNode {
    char id[DS_ID_MAX];
    int value;
    char text[DS_TEXT_MAX];
    struct ListNode *next;
} ListNode;

typedef struct {
    ListNode *head;
    ListNode *tail;
    int size;
} LinkedList;
```

### Operations & Complexity
- `list_insert_head(LinkedList *l, ...)`: $O(1)$
- `list_insert_tail(LinkedList *l, ...)`: $O(1)$
- `list_remove(LinkedList *l, const char *id)`: $O(N)$ traversal, $O(1)$ deletion.

### Game Usage:
- **Quest Chain (`quest_chain.h`)**: Implements quest sequencing. Quests form a linked chain where completing node $k$ unlocks pointer $k \rightarrow \text{next}$.

---

## 4. Graph & Graph Search Algorithms - `graph.h`, `bfs.c`, `dfs.c`

Graphs are represented using an **Adjacency List** structure:
- Nodes $V = \{0, 1, \dots, n-1\}$ have fixed 2D spatial coordinates $(x, y)$.
- Edges $E$ have destination index $v$ and weight $w$.

```c
typedef struct Edge {
    int to;
    int weight;
    struct Edge *next;
} Edge;

typedef struct {
    int id;
    int x, y;
    Edge *edges;
} GraphNode;
```

### Breadth-First Search (BFS) - `bfs.c`
- Implemented using our native circular `Queue`.
- Guarantees the **shortest unweighted path** (minimum number of edge hops) from `start` to `goal`.
- Maintains an array `visited[]` and a predecessor array `parent[]` to reconstruct the optimal path once `goal` is dequeued.
- **Complexity**: Time $O(V + E)$, Space $O(V)$.

### Depth-First Search (DFS) - `dfs.c`
- Implemented iteratively using our native `Stack` to avoid call-stack overflow on deep graphs.
- Explores deep along each branch before backtracking.
- **Complexity**: Time $O(V + E)$, Space $O(V)$.

/*
 * dsa_engine.c - long-running C process used by the Node.js server.
 *
 * Protocol: Node writes ONE command per line to stdin; the engine writes ONE
 * JSON object per line to stdout. Because the process stays alive, every
 * stack / queue / linked list / quest chain lives in C memory between
 * requests - the JavaScript side only ever sees JSON snapshots.
 *
 * Tokens are separated by single spaces and never contain spaces themselves
 * (the Node layer validates this).
 *
 *   PING | RESET | STATE
 *   STACK_CREATE <name> <capacity>  (0 = unlimited; a full stack refuses PUSH: overflow)
 *   STACK_PUSH <name> <text> [value] | STACK_POP <name> | STACK_PEEK <name>
 *   STACK_LIST <name> [limit]         | STACK_CLEAR <name>
 *   QUEUE_CREATE <name> <capacity>    | QUEUE_ENQ <name> <text> [value]
 *   QUEUE_DEQ <name> | QUEUE_PEEK <name> | QUEUE_LIST <name> | QUEUE_CLEAR <name>   (circular)
 *   LQUEUE_CREATE <name> <capacity> | LQUEUE_ENQ <name> <text> [value] | LQUEUE_DEQ <name>
 *   LQUEUE_PEEK <name> | LQUEUE_LIST <name> | LQUEUE_CLEAR <name>                   (linear)
 *   Overflow / underflow answer {"ok":false,"error":...,"condition":...} plus the full state.
 *   LIST_INSERT <name> HEAD|TAIL <text> | LIST_INSERT <name> AFTER <after> <text>
 *   LIST_REMOVE <name> <text> | LIST_SHOW <name> | LIST_CLEAR <name>
 *   QUEST_RESET | QUEST_ADD <id> | QUEST_START <id> | QUEST_COMPLETE <id> | QUEST_STATE
 *   PATH <BFS|DFS|DIJKSTRA|ASTAR> <start> <goal> <directed> <hscale>
 *        <n> (x y)*n <m> (u v w)*m
 *   TRACE <BFS|DFS> ...same arguments as PATH...   (PATH result + every step)
 *   BST_INSERT <name> <key> | BST_SEARCH <name> <key> | BST_INORDER <name>
 *   BST_SHOW <name> | BST_CLEAR <name>
 *   SORT_START <name> <BUBBLE|SELECTION|INSERTION> <n> v1..vn | SORT_STEP <name>
 *   SORT_STATE <name> | SORT_CLEAR <name>     (one sorting operation per SORT_STEP)
 *   AVL_INSERT <name> <key> | AVL_SHOW <name> | AVL_CLEAR <name>
 *        (insert answers with every step: placement, imbalance, each rotation + tree)
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ds_common.h"
#include "stack.h"
#include "queue.h"
#include "linked_list.h"
#include "quest_chain.h"
#include "graph.h"
#include "bst.h"
#include "sort.h"
#include "avl.h"

#define MAX_NAMED 16
#define NAME_MAX_LEN 32
#define MAX_TOKENS 16384
#define DEFAULT_QUEUE_CAPACITY 32
#define DEFAULT_LIST_LIMIT 64

typedef struct { char name[NAME_MAX_LEN]; Stack s; int used; } NamedStack;
typedef struct { char name[NAME_MAX_LEN]; Queue q; int used; } NamedQueue;
typedef struct { char name[NAME_MAX_LEN]; LinearQueue q; int used; } NamedLQueue;
typedef struct { char name[NAME_MAX_LEN]; LinkedList l; int used; } NamedList;
typedef struct { char name[NAME_MAX_LEN]; Bst t; int used; } NamedTree;
typedef struct { char name[NAME_MAX_LEN]; SortRun r; int used; } NamedSort;
typedef struct { char name[NAME_MAX_LEN]; Avl t; int used; } NamedAvl;

static NamedStack g_stacks[MAX_NAMED];
static NamedQueue g_queues[MAX_NAMED];
static NamedLQueue g_lqueues[MAX_NAMED];
static NamedList  g_lists[MAX_NAMED];
static NamedTree  g_trees[MAX_NAMED];
static NamedSort  g_sorts[MAX_NAMED];
static NamedAvl   g_avls[MAX_NAMED];
static QuestChain g_quests;

/* ------------------------------------------------------------------ output */

static void respond_error(const char *code, const char *message)
{
    fputs("{\"ok\":false,\"error\":", stdout);
    json_string(code);
    fputs(",\"message\":", stdout);
    json_string(message);
    fputs("}\n", stdout);
}

/* ------------------------------------------------------- named containers */

static void name_copy(char *dst, const char *src)
{
    strncpy(dst, src, NAME_MAX_LEN - 1);
    dst[NAME_MAX_LEN - 1] = '\0';
}

static Stack *get_stack(const char *name, int create)
{
    for (int i = 0; i < MAX_NAMED; i++)
        if (g_stacks[i].used && strcmp(g_stacks[i].name, name) == 0) return &g_stacks[i].s;
    if (!create) return NULL;
    for (int i = 0; i < MAX_NAMED; i++) {
        if (g_stacks[i].used) continue;
        g_stacks[i].used = 1;
        name_copy(g_stacks[i].name, name);
        stack_init(&g_stacks[i].s);
        return &g_stacks[i].s;
    }
    return NULL;
}

static Queue *get_queue(const char *name, int create, int capacity)
{
    for (int i = 0; i < MAX_NAMED; i++)
        if (g_queues[i].used && strcmp(g_queues[i].name, name) == 0) return &g_queues[i].q;
    if (!create) return NULL;
    for (int i = 0; i < MAX_NAMED; i++) {
        if (g_queues[i].used) continue;
        if (!queue_init(&g_queues[i].q, capacity)) return NULL;
        g_queues[i].used = 1;
        name_copy(g_queues[i].name, name);
        return &g_queues[i].q;
    }
    return NULL;
}

/* create = 1: (re)create with the given capacity, freeing any old array of that name. */
static LinearQueue *get_lqueue(const char *name, int create, int capacity)
{
    for (int i = 0; i < MAX_NAMED; i++) {
        if (!g_lqueues[i].used || strcmp(g_lqueues[i].name, name) != 0) continue;
        if (!create) return &g_lqueues[i].q;
        lqueue_free(&g_lqueues[i].q);
        g_lqueues[i].used = 0;
    }
    if (!create) return NULL;
    for (int i = 0; i < MAX_NAMED; i++) {
        if (g_lqueues[i].used) continue;
        if (!lqueue_init(&g_lqueues[i].q, capacity)) return NULL;
        g_lqueues[i].used = 1;
        name_copy(g_lqueues[i].name, name);
        return &g_lqueues[i].q;
    }
    return NULL;
}

static LinkedList *get_list(const char *name, int create)
{
    for (int i = 0; i < MAX_NAMED; i++)
        if (g_lists[i].used && strcmp(g_lists[i].name, name) == 0) return &g_lists[i].l;
    if (!create) return NULL;
    for (int i = 0; i < MAX_NAMED; i++) {
        if (g_lists[i].used) continue;
        g_lists[i].used = 1;
        name_copy(g_lists[i].name, name);
        list_init(&g_lists[i].l);
        return &g_lists[i].l;
    }
    return NULL;
}

static Bst *get_tree(const char *name, int create)
{
    for (int i = 0; i < MAX_NAMED; i++)
        if (g_trees[i].used && strcmp(g_trees[i].name, name) == 0) return &g_trees[i].t;
    if (!create) return NULL;
    for (int i = 0; i < MAX_NAMED; i++) {
        if (g_trees[i].used) continue;
        g_trees[i].used = 1;
        name_copy(g_trees[i].name, name);
        bst_init(&g_trees[i].t);
        return &g_trees[i].t;
    }
    return NULL;
}

static void reset_all(void)
{
    for (int i = 0; i < MAX_NAMED; i++) {
        if (g_stacks[i].used) stack_clear(&g_stacks[i].s);
        if (g_queues[i].used) queue_free(&g_queues[i].q);
        if (g_lists[i].used) list_clear(&g_lists[i].l);
        if (g_trees[i].used) bst_clear(&g_trees[i].t);   /* frees every node */
        if (g_sorts[i].used) sort_free(&g_sorts[i].r);
        if (g_lqueues[i].used) lqueue_free(&g_lqueues[i].q);
        g_lqueues[i].used = 0;
        if (g_avls[i].used) avl_clear(&g_avls[i].t);   /* frees every node */
        g_avls[i].used = 0;
        g_stacks[i].used = g_queues[i].used = g_lists[i].used = g_trees[i].used = g_sorts[i].used = 0;
    }
    quest_chain_clear(&g_quests);
}

/* ------------------------------------------------------------ serialisers */

static void print_item(const char *text, int value)
{
    fputs("{\"text\":", stdout);
    json_string(text);
    printf(",\"value\":%d}", value);
}

/* Start of a failed operation that still reports the structure's state:
 * {"ok":false,"error":code,"message":...,"op":op,"condition":OVERFLOW|UNDERFLOW, <body>} */
static void begin_failure(const char *code, const char *message, const char *op, const char *condition)
{
    fputs("{\"ok\":false,\"error\":", stdout);
    json_string(code);
    fputs(",\"message\":", stdout);
    json_string(message);
    printf(",\"op\":\"%s\",\"condition\":\"%s\",", op, condition);
}

static void print_stack_body(const char *name, const Stack *s, int limit)
{
    fputs("\"name\":", stdout);
    json_string(name);
    printf(",\"size\":%d,\"capacity\":%d,\"empty\":%s,\"full\":%s,\"top\":", s->size, s->capacity,
           stack_is_empty(s) ? "true" : "false", stack_is_full(s) ? "true" : "false");
    if (s->top) json_string(s->top->text); else fputs("null", stdout);
    fputs(",\"items\":[", stdout);
    int i = 0;
    for (const StackNode *n = s->top; n && i < limit; n = n->next, i++) {
        if (i) putchar(',');
        print_item(n->text, n->value);
    }
    putchar(']');
}

/* Circular queue: items front-to-rear, plus every array slot and both indices. */
static void print_queue_body(const char *name, const Queue *q)
{
    fputs("\"name\":", stdout);
    json_string(name);
    printf(",\"size\":%d,\"capacity\":%d,\"empty\":%s,\"full\":%s,\"frontIndex\":%d,\"rearIndex\":%d,\"front\":",
           q->size, q->capacity, queue_is_empty(q) ? "true" : "false", queue_is_full(q) ? "true" : "false", q->front, q->rear);
    if (q->size) json_string(queue_peek(q)->text); else fputs("null", stdout);
    fputs(",\"items\":[", stdout);
    for (int i = 0; i < q->size; i++) {
        const QueueItem *it = queue_at(q, i);
        if (i) putchar(',');
        print_item(it->text, it->value);
    }
    fputs("],\"slots\":[", stdout);
    for (int i = 0; i < q->capacity; i++) {
        if (i) putchar(',');
        if (queue_slot_used(q, i)) print_item(q->items[i].text, q->items[i].value); else fputs("null", stdout);
    }
    putchar(']');
}

/* Linear queue: slots before FRONT are "spent" - freed but never reusable. */
static void print_lqueue_body(const char *name, const LinearQueue *q)
{
    fputs("\"name\":", stdout);
    json_string(name);
    printf(",\"size\":%d,\"capacity\":%d,\"empty\":%s,\"full\":%s,\"frontIndex\":%d,\"rearIndex\":%d,\"front\":",
           lqueue_size(q), q->capacity, lqueue_is_empty(q) ? "true" : "false", lqueue_is_full(q) ? "true" : "false", q->front, q->rear);
    if (!lqueue_is_empty(q)) json_string(lqueue_peek(q)->text); else fputs("null", stdout);
    fputs(",\"items\":[", stdout);
    for (int i = q->front; i <= q->rear; i++) {
        if (i > q->front) putchar(',');
        print_item(q->items[i].text, q->items[i].value);
    }
    fputs("],\"slots\":[", stdout);
    for (int i = 0; i < q->capacity; i++) {
        if (i) putchar(',');
        if (i < q->front && i <= q->rear) fputs("\"spent\"", stdout);
        else if (i >= q->front && i <= q->rear) print_item(q->items[i].text, q->items[i].value);
        else fputs("null", stdout);
    }
    putchar(']');
}

static void print_list_body(const char *name, const LinkedList *l)
{
    fputs("\"name\":", stdout);
    json_string(name);
    printf(",\"size\":%d,\"head\":", l->size);
    if (l->head) json_string(l->head->key); else fputs("null", stdout);
    fputs(",\"tail\":", stdout);
    if (l->tail) json_string(l->tail->key); else fputs("null", stdout);
    fputs(",\"items\":[", stdout);
    for (const ListNode *n = l->head; n; n = n->next) {
        json_string(n->key);
        if (n->next) putchar(',');
    }
    putchar(']');
}

static void print_quest_body(void)
{
    fputs("\"current\":", stdout);
    if (g_quests.current) json_string(g_quests.current->key); else fputs("null", stdout);
    fputs(",\"chain\":[", stdout);
    int i = 0;
    for (const ListNode *n = g_quests.list.head; n; n = n->next, i++) {
        if (i) putchar(',');
        fputs("{\"id\":", stdout);
        json_string(n->key);
        fputs(",\"status\":", stdout);
        json_string(quest_status_name(n->status));
        fputs(",\"next\":", stdout);
        if (n->next) json_string(n->next->key); else fputs("null", stdout);
        putchar('}');
    }
    putchar(']');
}

/* Pre-order list of nodes: {"key":k,"left":k|null,"right":k|null}. Keys are
 * unique, so the client rebuilds the exact shape from this list. */
static void print_tree_nodes(const BstNode *n, int *first)
{
    if (!n) return;
    if (!*first) putchar(',');
    *first = 0;
    printf("{\"key\":%d,\"left\":", n->key);
    if (n->left) printf("%d", n->left->key); else fputs("null", stdout);
    fputs(",\"right\":", stdout);
    if (n->right) printf("%d", n->right->key); else fputs("null", stdout);
    putchar('}');
    print_tree_nodes(n->left, first);
    print_tree_nodes(n->right, first);
}

static void print_tree_body(const char *name, const Bst *t)
{
    fputs("\"name\":", stdout);
    json_string(name);
    fputs(",\"tree\":{\"root\":", stdout);
    if (t->root) printf("%d", t->root->key); else fputs("null", stdout);
    printf(",\"size\":%d,\"height\":%d,\"nodes\":[", t->size, bst_height(t));
    int first = 1;
    print_tree_nodes(t->root, &first);
    fputs("]}", stdout);
}

static void print_bst_path(const BstPath *p)
{
    fputs("\"path\":[", stdout);
    for (int i = 0; i < p->len; i++) {
        if (i) putchar(',');
        printf("{\"key\":%d,\"cmp\":\"%s\"}", p->keys[i], bst_cmp_name(p->cmps[i]));
    }
    putchar(']');
}

static void print_trace(const SearchTrace *t, int stack_pairs)
{
    fputs(",\"trace\":[", stdout);
    for (int i = 0; i < t->len; i++) {
        const TraceEvent *e = &t->events[i];
        if (i) putchar(',');
        fputs("{\"op\":", stdout);
        json_string(trace_op_name(e->op));
        printf(",\"node\":%d,\"other\":%d,\"flag\":%d", e->node, e->other, e->flag);
        if (e->snap_off >= 0) {
            fputs(stack_pairs ? ",\"stack\":" : ",\"queue\":", stdout);
            json_int_array(t->snap + e->snap_off, e->snap_len);
        }
        putchar('}');
    }
    putchar(']');
}

/* --------------------------------------------------------------- handlers */

static int arg_int(char **tok, int ntok, int idx, int fallback)
{
    if (idx >= ntok) return fallback;
    return (int)strtol(tok[idx], NULL, 10);
}

static void cmd_stack(char **tok, int ntok)
{
    const char *cmd = tok[0];
    if (ntok < 2) { respond_error("BAD_ARGS", "stack name required"); return; }
    const char *name = tok[1];

    Stack *s = get_stack(name, 1);
    if (!s) { respond_error("LIMIT", "too many stacks"); return; }

    if (strcmp(cmd, "STACK_CREATE") == 0) {
        int cap = arg_int(tok, ntok, 2, 0);
        if (cap < 0 || cap > 1024) { respond_error("BAD_ARGS", "capacity must be 0..1024 (0 = unlimited)"); return; }
        stack_clear(s);                       /* frees every node */
        s->capacity = cap;
        fputs("{\"ok\":true,\"op\":\"create\",", stdout);
        print_stack_body(name, s, DEFAULT_LIST_LIMIT);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "STACK_PUSH") == 0) {
        if (ntok < 3) { respond_error("BAD_ARGS", "STACK_PUSH <name> <text> [value]"); return; }
        if (stack_is_full(s)) {
            begin_failure("STACK_FULL", "the stack is full: cannot push (overflow)", "push", "OVERFLOW");
            print_stack_body(name, s, DEFAULT_LIST_LIMIT);
            fputs("}\n", stdout);
            return;
        }
        if (!stack_push(s, arg_int(tok, ntok, 3, 0), 0, tok[2])) { respond_error("OUT_OF_MEMORY", "push failed"); return; }
        fputs("{\"ok\":true,\"op\":\"push\",", stdout);
        print_stack_body(name, s, DEFAULT_LIST_LIMIT);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "STACK_POP") == 0 || strcmp(cmd, "STACK_PEEK") == 0) {
        int pop = strcmp(cmd, "STACK_POP") == 0;
        if (stack_is_empty(s)) {
            begin_failure("STACK_EMPTY", pop ? "cannot pop from an empty stack (underflow)" : "cannot peek at an empty stack (underflow)",
                          pop ? "pop" : "peek", "UNDERFLOW");
            print_stack_body(name, s, DEFAULT_LIST_LIMIT);
            fputs("}\n", stdout);
            return;
        }
        if (pop) {
            StackNode popped;
            stack_pop(s, &popped);
            fputs("{\"ok\":true,\"op\":\"pop\",\"popped\":", stdout);
            print_item(popped.text, popped.value);
        } else {
            fputs("{\"ok\":true,\"op\":\"peek\",\"peeked\":", stdout);   /* read the top, change nothing */
            print_item(stack_peek(s)->text, stack_peek(s)->value);
        }
        putchar(',');
        print_stack_body(name, s, DEFAULT_LIST_LIMIT);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "STACK_LIST") == 0) {
        int limit = arg_int(tok, ntok, 2, DEFAULT_LIST_LIMIT);
        if (limit < 0) limit = DEFAULT_LIST_LIMIT;
        fputs("{\"ok\":true,\"op\":\"list\",", stdout);
        print_stack_body(name, s, limit);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "STACK_CLEAR") == 0) {
        stack_clear(s);
        fputs("{\"ok\":true,\"op\":\"clear\",", stdout);
        print_stack_body(name, s, 0);
        fputs("}\n", stdout);
    } else {
        respond_error("UNKNOWN_COMMAND", cmd);
    }
}

static void cmd_queue(char **tok, int ntok)
{
    const char *cmd = tok[0];
    if (ntok < 2) { respond_error("BAD_ARGS", "queue name required"); return; }
    const char *name = tok[1];

    if (strcmp(cmd, "QUEUE_CREATE") == 0) {
        int cap = arg_int(tok, ntok, 2, DEFAULT_QUEUE_CAPACITY);
        if (cap < 1 || cap > 4096) { respond_error("BAD_ARGS", "capacity must be 1..4096"); return; }
        /* Re-creating a queue discards its old buffer. */
        for (int i = 0; i < MAX_NAMED; i++)
            if (g_queues[i].used && strcmp(g_queues[i].name, name) == 0) {
                queue_free(&g_queues[i].q);
                g_queues[i].used = 0;
            }
        Queue *q = get_queue(name, 1, cap);
        if (!q) { respond_error("LIMIT", "too many queues"); return; }
        fputs("{\"ok\":true,\"op\":\"create\",", stdout);
        print_queue_body(name, q);
        fputs("}\n", stdout);
        return;
    }

    Queue *q = get_queue(name, 1, DEFAULT_QUEUE_CAPACITY);
    if (!q) { respond_error("LIMIT", "too many queues"); return; }

    if (strcmp(cmd, "QUEUE_ENQ") == 0) {
        if (ntok < 3) { respond_error("BAD_ARGS", "QUEUE_ENQ <name> <text> [value]"); return; }
        if (!queue_enqueue(q, arg_int(tok, ntok, 3, 0), 0, tok[2])) {
            begin_failure("QUEUE_FULL", "queue is full (overflow)", "enqueue", "OVERFLOW");
            print_queue_body(name, q);
            fputs("}\n", stdout);
            return;
        }
        printf("{\"ok\":true,\"op\":\"enqueue\",\"index\":%d,", q->rear);   /* slot just written */
        print_queue_body(name, q);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "QUEUE_DEQ") == 0 || strcmp(cmd, "QUEUE_PEEK") == 0) {
        int deq = strcmp(cmd, "QUEUE_DEQ") == 0;
        if (queue_is_empty(q)) {
            begin_failure("QUEUE_EMPTY", deq ? "cannot dequeue from an empty queue (underflow)" : "cannot read the front of an empty queue (underflow)",
                          deq ? "dequeue" : "peek", "UNDERFLOW");
            print_queue_body(name, q);
            fputs("}\n", stdout);
            return;
        }
        int index = q->front;
        QueueItem item;
        if (deq) queue_dequeue(q, &item); else item = *queue_peek(q);
        printf("{\"ok\":true,\"op\":\"%s\",\"index\":%d,\"%s\":", deq ? "dequeue" : "peek", index, deq ? "dequeued" : "peeked");
        print_item(item.text, item.value);
        putchar(',');
        print_queue_body(name, q);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "QUEUE_LIST") == 0) {
        fputs("{\"ok\":true,\"op\":\"list\",", stdout);
        print_queue_body(name, q);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "QUEUE_CLEAR") == 0) {
        queue_clear(q);
        fputs("{\"ok\":true,\"op\":\"clear\",", stdout);
        print_queue_body(name, q);
        fputs("}\n", stdout);
    } else {
        respond_error("UNKNOWN_COMMAND", cmd);
    }
}

static void cmd_lqueue(char **tok, int ntok)
{
    const char *cmd = tok[0];
    if (ntok < 2) { respond_error("BAD_ARGS", "queue name required"); return; }
    const char *name = tok[1];

    if (strcmp(cmd, "LQUEUE_CREATE") == 0) {
        int cap = arg_int(tok, ntok, 2, DEFAULT_QUEUE_CAPACITY);
        if (cap < 1 || cap > 4096) { respond_error("BAD_ARGS", "capacity must be 1..4096"); return; }
        LinearQueue *q = get_lqueue(name, 1, cap);   /* re-creating frees the old array */
        if (!q) { respond_error("LIMIT", "too many linear queues"); return; }
        fputs("{\"ok\":true,\"op\":\"create\",", stdout);
        print_lqueue_body(name, q);
        fputs("}\n", stdout);
        return;
    }

    LinearQueue *q = get_lqueue(name, 0, 0);
    if (!q) { respond_error("NOT_FOUND", "no linear queue with that name (LQUEUE_CREATE first)"); return; }

    if (strcmp(cmd, "LQUEUE_ENQ") == 0) {
        if (ntok < 3) { respond_error("BAD_ARGS", "LQUEUE_ENQ <name> <text> [value]"); return; }
        if (!lqueue_enqueue(q, arg_int(tok, ntok, 3, 0), tok[2])) {
            begin_failure("QUEUE_FULL", "REAR is at the last slot: cannot enqueue (overflow)", "enqueue", "OVERFLOW");
            print_lqueue_body(name, q);
            fputs("}\n", stdout);
            return;
        }
        printf("{\"ok\":true,\"op\":\"enqueue\",\"index\":%d,", q->rear);
        print_lqueue_body(name, q);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "LQUEUE_DEQ") == 0 || strcmp(cmd, "LQUEUE_PEEK") == 0) {
        int deq = strcmp(cmd, "LQUEUE_DEQ") == 0;
        if (lqueue_is_empty(q)) {
            begin_failure("QUEUE_EMPTY", deq ? "cannot dequeue from an empty queue (underflow)" : "cannot read the front of an empty queue (underflow)",
                          deq ? "dequeue" : "peek", "UNDERFLOW");
            print_lqueue_body(name, q);
            fputs("}\n", stdout);
            return;
        }
        int index = q->front;
        QueueItem item;
        if (deq) lqueue_dequeue(q, &item); else item = *lqueue_peek(q);
        printf("{\"ok\":true,\"op\":\"%s\",\"index\":%d,\"%s\":", deq ? "dequeue" : "peek", index, deq ? "dequeued" : "peeked");
        print_item(item.text, item.value);
        putchar(',');
        print_lqueue_body(name, q);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "LQUEUE_LIST") == 0 || strcmp(cmd, "LQUEUE_CLEAR") == 0) {
        int clear = strcmp(cmd, "LQUEUE_CLEAR") == 0;
        if (clear) lqueue_clear(q);
        printf("{\"ok\":true,\"op\":\"%s\",", clear ? "clear" : "list");
        print_lqueue_body(name, q);
        fputs("}\n", stdout);
    } else {
        respond_error("UNKNOWN_COMMAND", cmd);
    }
}

static void cmd_list(char **tok, int ntok)
{
    const char *cmd = tok[0];
    if (ntok < 2) { respond_error("BAD_ARGS", "list name required"); return; }
    const char *name = tok[1];
    LinkedList *l = get_list(name, 1);
    if (!l) { respond_error("LIMIT", "too many lists"); return; }

    if (strcmp(cmd, "LIST_INSERT") == 0) {
        if (ntok < 4) { respond_error("BAD_ARGS", "LIST_INSERT <name> HEAD|TAIL|AFTER ..."); return; }
        const char *where = tok[2];
        const char *key = tok[ntok - 1];
        if (list_find(l, key)) { respond_error("DUPLICATE", "value already in the list"); return; }
        ListNode *n = NULL;
        if (strcmp(where, "HEAD") == 0) n = list_insert_head(l, key);
        else if (strcmp(where, "TAIL") == 0) n = list_insert_tail(l, key);
        else if (strcmp(where, "AFTER") == 0 && ntok >= 5) {
            n = list_insert_after(l, tok[3], key);
            if (!n) { respond_error("NOT_FOUND", "the 'after' node is not in the list"); return; }
        } else { respond_error("BAD_ARGS", "position must be HEAD, TAIL or AFTER <key>"); return; }
        if (!n) { respond_error("OUT_OF_MEMORY", "insert failed"); return; }
        fputs("{\"ok\":true,\"op\":\"insert\",", stdout);
        print_list_body(name, l);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "LIST_REMOVE") == 0) {
        if (ntok < 3) { respond_error("BAD_ARGS", "LIST_REMOVE <name> <text>"); return; }
        if (!list_remove(l, tok[2])) { respond_error("NOT_FOUND", "value not in the list"); return; }
        fputs("{\"ok\":true,\"op\":\"remove\",", stdout);
        print_list_body(name, l);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "LIST_SHOW") == 0) {
        fputs("{\"ok\":true,\"op\":\"list\",", stdout);
        print_list_body(name, l);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "LIST_CLEAR") == 0) {
        list_clear(l);
        fputs("{\"ok\":true,\"op\":\"clear\",", stdout);
        print_list_body(name, l);
        fputs("}\n", stdout);
    } else {
        respond_error("UNKNOWN_COMMAND", cmd);
    }
}

static void cmd_quest(char **tok, int ntok)
{
    const char *cmd = tok[0];
    const char *unlocked = NULL;
    QuestChainResult r = QC_OK;

    if (strcmp(cmd, "QUEST_RESET") == 0) {
        quest_chain_clear(&g_quests);
    } else if (strcmp(cmd, "QUEST_STATE") == 0) {
        /* nothing to change */
    } else {
        if (ntok < 2) { respond_error("BAD_ARGS", "quest id required"); return; }
        if (strcmp(cmd, "QUEST_ADD") == 0) r = quest_chain_add(&g_quests, tok[1]);
        else if (strcmp(cmd, "QUEST_START") == 0) r = quest_chain_start(&g_quests, tok[1]);
        else if (strcmp(cmd, "QUEST_COMPLETE") == 0) r = quest_chain_complete(&g_quests, tok[1], &unlocked);
        else { respond_error("UNKNOWN_COMMAND", cmd); return; }
    }

    if (r != QC_OK) { respond_error(quest_chain_result_name(r), tok[1]); return; }
    fputs("{\"ok\":true,\"unlocked\":", stdout);
    if (unlocked) json_string(unlocked); else fputs("null", stdout);
    putchar(',');
    print_quest_body();
    fputs("}\n", stdout);
}

static void cmd_path(char **tok, int ntok)
{
    /* PATH algo start goal directed hscale n (x y)*n m (u v w)*m */
    if (ntok < 8) { respond_error("BAD_ARGS", "PATH needs algorithm, start, goal, directed, hscale, n, nodes, m, edges"); return; }
    const char *algo = tok[1];
    int start = arg_int(tok, ntok, 2, -1);
    int goal = arg_int(tok, ntok, 3, -1);
    int directed = arg_int(tok, ntok, 4, 0);
    double hscale = strtod(tok[5], NULL);
    int n = arg_int(tok, ntok, 6, 0);
    int idx = 7;
    if (n < 1 || n > 1024 || idx + 2 * n >= ntok) { respond_error("BAD_ARGS", "invalid node list"); return; }

    Graph *g = graph_create(n, directed);
    if (!g) { respond_error("OUT_OF_MEMORY", "graph"); return; }
    for (int i = 0; i < n; i++, idx += 2)
        graph_set_position(g, i, arg_int(tok, ntok, idx, 0), arg_int(tok, ntok, idx + 1, 0));
    int m = arg_int(tok, ntok, idx++, 0);
    if (m < 0 || idx + 3 * m > ntok) { graph_free(g); respond_error("BAD_ARGS", "invalid edge list"); return; }
    for (int i = 0; i < m; i++, idx += 3) {
        if (!graph_add_edge(g, arg_int(tok, ntok, idx, -1), arg_int(tok, ntok, idx + 1, -1), arg_int(tok, ntok, idx + 2, -1))) {
            graph_free(g);
            respond_error("BAD_ARGS", "edge references an unknown node or has a negative weight");
            return;
        }
    }
    /* BFS / DFS accept goal -1: no goal, traverse everything reachable. */
    int unguided = strcmp(algo, "BFS") == 0 || strcmp(algo, "DFS") == 0;
    if (!graph_valid_node(g, start) || (!graph_valid_node(g, goal) && !(unguided && goal == NO_GOAL))) {
        graph_free(g);
        respond_error("BAD_ARGS", "start/goal out of range");
        return;
    }

    PathResult res;
    int consistent = -1;
    int ok;
    /* TRACE runs the very same search with a recorder attached. */
    int traced = strcmp(tok[0], "TRACE") == 0;
    SearchTrace trace;
    trace_init(&trace);
    if (traced && strcmp(algo, "BFS") != 0 && strcmp(algo, "DFS") != 0) {
        graph_free(g);
        respond_error("BAD_ARGS", "TRACE supports BFS and DFS");
        return;
    }
    if (strcmp(algo, "BFS") == 0) ok = bfs_search_traced(g, start, goal, &res, traced ? &trace : NULL);
    else if (strcmp(algo, "DFS") == 0) ok = dfs_search_traced(g, start, goal, &res, traced ? &trace : NULL);
    else if (strcmp(algo, "DIJKSTRA") == 0) ok = dijkstra_search(g, start, goal, &res);
    else if (strcmp(algo, "ASTAR") == 0) ok = astar_search(g, start, goal, hscale, &res, &consistent);
    else { graph_free(g); respond_error("BAD_ARGS", "algorithm must be BFS, DFS, DIJKSTRA or ASTAR"); return; }

    if (!ok || trace.failed) {
        trace_free(&trace);
        path_result_free(&res);
        graph_free(g);
        respond_error("OUT_OF_MEMORY", "search failed");
        return;
    }

    fputs("{\"ok\":true,\"algorithm\":", stdout);
    json_string(algo);
    printf(",\"found\":%s,\"path\":", res.found ? "true" : "false");
    json_int_array(res.path, res.path_len);
    printf(",\"hops\":%d,\"cost\":%ld,\"expanded\":%d,\"visitOrder\":",
           res.path_len > 0 ? res.path_len - 1 : 0, res.cost, res.expanded);
    json_int_array(res.visit_order, res.visit_len);
    if (consistent >= 0) printf(",\"heuristicConsistent\":%s", consistent ? "true" : "false");
    if (traced) print_trace(&trace, strcmp(algo, "DFS") == 0);
    fputs("}\n", stdout);

    trace_free(&trace);
    path_result_free(&res);
    graph_free(g);
}

static void cmd_bst(char **tok, int ntok)
{
    const char *cmd = tok[0];
    if (ntok < 2) { respond_error("BAD_ARGS", "tree name required"); return; }
    const char *name = tok[1];
    Bst *t = get_tree(name, 1);
    if (!t) { respond_error("LIMIT", "too many trees"); return; }
    BstPath path;
    path.len = 0;

    if (strcmp(cmd, "BST_INSERT") == 0) {
        if (ntok < 3) { respond_error("BAD_ARGS", "BST_INSERT <name> <key>"); return; }
        int key = arg_int(tok, ntok, 2, 0);
        BstResult r = bst_insert(t, key, &path);
        if (r == BST_FULL) { respond_error("TREE_FULL", "the tree holds at most 63 keys"); return; }
        if (r == BST_NO_MEMORY) { respond_error("OUT_OF_MEMORY", "insert failed"); return; }
        printf("{\"ok\":true,\"op\":\"insert\",\"key\":%d,\"inserted\":%s,\"parent\":", key, r == BST_OK ? "true" : "false");
        /* the new node hangs off the last node compared, on the side that comparison chose */
        if (r == BST_OK && path.len)
            printf("%d,\"side\":\"%s\",", path.keys[path.len - 1], path.cmps[path.len - 1] < 0 ? "LEFT" : "RIGHT");
        else
            printf("null,\"side\":%s,", r == BST_OK ? "\"ROOT\"" : "null");
    } else if (strcmp(cmd, "BST_SEARCH") == 0) {
        if (ntok < 3) { respond_error("BAD_ARGS", "BST_SEARCH <name> <key>"); return; }
        int key = arg_int(tok, ntok, 2, 0);
        int found = bst_search(t, key, &path);
        printf("{\"ok\":true,\"op\":\"search\",\"key\":%d,\"found\":%s,", key, found ? "true" : "false");
    } else if (strcmp(cmd, "BST_INORDER") == 0) {
        int keys[BST_MAX_NODES];
        int count = bst_inorder(t, keys, BST_MAX_NODES);
        fputs("{\"ok\":true,\"op\":\"inorder\",\"keys\":", stdout);
        json_int_array(keys, count);
        putchar(',');
        print_tree_body(name, t);
        fputs("}\n", stdout);
        return;
    } else if (strcmp(cmd, "BST_SHOW") == 0 || strcmp(cmd, "BST_CLEAR") == 0) {
        int clear = strcmp(cmd, "BST_CLEAR") == 0;
        if (clear) bst_clear(t);
        printf("{\"ok\":true,\"op\":\"%s\",", clear ? "clear" : "show");
        print_tree_body(name, t);
        fputs("}\n", stdout);
        return;
    } else {
        respond_error("UNKNOWN_COMMAND", cmd);
        return;
    }

    /* insert / search: the comparisons made, then the tree as it is now */
    printf("\"comparisons\":%d,", path.len);
    print_bst_path(&path);
    putchar(',');
    print_tree_body(name, t);
    fputs("}\n", stdout);
}

static SortRun *get_sort(const char *name, int create)
{
    for (int i = 0; i < MAX_NAMED; i++)
        if (g_sorts[i].used && strcmp(g_sorts[i].name, name) == 0) return &g_sorts[i].r;
    if (!create) return NULL;
    for (int i = 0; i < MAX_NAMED; i++) {
        if (g_sorts[i].used) continue;
        memset(&g_sorts[i].r, 0, sizeof(SortRun));
        g_sorts[i].used = 1;
        name_copy(g_sorts[i].name, name);
        return &g_sorts[i].r;
    }
    return NULL;
}

/* The whole state after the last operation: the game draws exactly this. */
static void print_sort(const char *name, const SortRun *r)
{
    fputs("{\"ok\":true,\"name\":", stdout);
    json_string(name);
    fputs(",\"algorithm\":", stdout);
    json_string(sort_algo_name(r->algo));
    fputs(",\"op\":", stdout);
    if (r->last.op >= 0) json_string(sort_op_name(r->last.op)); else fputs("null", stdout);
    printf(",\"a\":%d,\"b\":%d,\"result\":%d,\"step\":%d,\"pass\":%d,\"done\":%s,\"n\":%d,\"values\":",
           r->last.a, r->last.b, r->last.result, r->step, r->pass, r->done ? "true" : "false", r->n);
    json_int_array(r->a, r->n);
    fputs(",\"ids\":", stdout);
    json_int_array(r->ids, r->n);
    printf(",\"sortedLo\":%d,\"sortedHi\":%d,\"min\":%d,\"key\":%d,\"keyId\":%d,\"gap\":%d",
           r->sorted_lo, r->sorted_hi, r->min, r->has_key ? r->key : -1, r->has_key ? r->key_id : -1, r->has_key ? r->hole : -1);
    printf(",\"comparisons\":%d,\"swaps\":%d,\"shifts\":%d}\n", r->comparisons, r->swaps, r->shifts);
}

static void cmd_sort(char **tok, int ntok)
{
    const char *cmd = tok[0];
    if (ntok < 2) { respond_error("BAD_ARGS", "sort name required"); return; }
    const char *name = tok[1];
    if (strcmp(cmd, "SORT_START") == 0) {
        if (ntok < 4) { respond_error("BAD_ARGS", "SORT_START <name> <algorithm> <n> v1..vn"); return; }
        int algo = sort_parse_algo(tok[2]);
        int n = arg_int(tok, ntok, 3, -1);
        if (algo < 0) { respond_error("BAD_ARGS", "algorithm must be BUBBLE, SELECTION or INSERTION"); return; }
        if (n < 0 || n > SORT_MAX_ITEMS || ntok != 4 + n) { respond_error("BAD_ARGS", "n must be 0..64 and match the number of values"); return; }
        int values[SORT_MAX_ITEMS];
        for (int i = 0; i < n; i++) values[i] = arg_int(tok, ntok, 4 + i, 0);
        SortRun *r = get_sort(name, 1);
        if (!r) { respond_error("LIMIT", "too many sort runs"); return; }
        if (!sort_start(r, algo, values, n)) { respond_error("OUT_OF_MEMORY", "sort start failed"); return; }
        print_sort(name, r);
        return;
    }
    SortRun *r = get_sort(name, 0);
    if (!r) { respond_error("NOT_FOUND", "no sort run with that name (SORT_START first)"); return; }
    if (strcmp(cmd, "SORT_STEP") == 0) { sort_step(r); print_sort(name, r); }
    else if (strcmp(cmd, "SORT_STATE") == 0) print_sort(name, r);
    else if (strcmp(cmd, "SORT_CLEAR") == 0) {
        for (int i = 0; i < MAX_NAMED; i++)
            if (g_sorts[i].used && &g_sorts[i].r == r) { sort_free(r); g_sorts[i].used = 0; }
        fputs("{\"ok\":true,\"op\":\"clear\"}\n", stdout);
    } else respond_error("UNKNOWN_COMMAND", cmd);
}

static Avl *get_avl(const char *name)
{
    for (int i = 0; i < MAX_NAMED; i++)
        if (g_avls[i].used && strcmp(g_avls[i].name, name) == 0) return &g_avls[i].t;
    for (int i = 0; i < MAX_NAMED; i++) {
        if (g_avls[i].used) continue;
        g_avls[i].used = 1;
        name_copy(g_avls[i].name, name);
        avl_init(&g_avls[i].t);
        return &g_avls[i].t;
    }
    return NULL;
}

/* {"root":k|null,"size":n,"height":h,"nodes":[{"key","left","right","height","bf"}...]} */
static void print_avl_snapshot(const AvlSnapshot *s)
{
    fputs("{\"root\":", stdout);
    if (s->count) printf("%d", s->root); else fputs("null", stdout);
    printf(",\"size\":%d,\"height\":%d,\"nodes\":[", s->count, s->count ? s->nodes[0].height : 0);
    for (int i = 0; i < s->count; i++) {
        const AvlSnapNode *n = &s->nodes[i];
        if (i) putchar(',');
        printf("{\"key\":%d,\"left\":", n->key);
        if (n->left >= 0) printf("%d", n->left); else fputs("null", stdout);
        fputs(",\"right\":", stdout);
        if (n->right >= 0) printf("%d", n->right); else fputs("null", stdout);
        printf(",\"height\":%d,\"bf\":%d}", n->height, n->bf);
    }
    fputs("]}", stdout);
}

static void print_avl_state(const char *name, const Avl *t)
{
    AvlSnapshot snap;
    int keys[AVL_MAX_NODES];
    int count = avl_inorder(t, keys, AVL_MAX_NODES);
    avl_snapshot(t, &snap);
    fputs("\"name\":", stdout);
    json_string(name);
    printf(",\"valid\":%s,\"inorder\":", avl_is_valid(t) ? "true" : "false");
    json_int_array(keys, count);
    fputs(",\"tree\":", stdout);
    print_avl_snapshot(&snap);
}

static void cmd_avl(char **tok, int ntok)
{
    static AvlTrace trace;            /* ~20 KB: kept off the stack */
    const char *cmd = tok[0];
    if (ntok < 2) { respond_error("BAD_ARGS", "tree name required"); return; }
    const char *name = tok[1];
    Avl *t = get_avl(name);
    if (!t) { respond_error("LIMIT", "too many AVL trees"); return; }

    if (strcmp(cmd, "AVL_INSERT") == 0) {
        if (ntok < 3) { respond_error("BAD_ARGS", "AVL_INSERT <name> <key>"); return; }
        char *end;
        long key = strtol(tok[2], &end, 10);
        /* keys are 0..99999: -1 marks "no child" in snapshots */
        if (*end || key < 0 || key > 99999) { respond_error("BAD_ARGS", "key must be an integer 0..99999"); return; }
        AvlResult r = avl_insert(t, (int)key, &trace);
        if (r == AVL_FULL) { respond_error("TREE_FULL", "the tree holds at most 63 keys"); return; }
        if (r == AVL_NO_MEMORY) { respond_error("OUT_OF_MEMORY", "insert failed"); return; }
        printf("{\"ok\":true,\"op\":\"insert\",\"key\":%ld,\"inserted\":%s,\"duplicate\":%s,\"path\":[",
               key, r == AVL_OK ? "true" : "false", r == AVL_DUPLICATE ? "true" : "false");
        for (int i = 0; i < trace.path_len; i++) {
            if (i) putchar(',');
            printf("{\"key\":%d,\"cmp\":\"%s\"}", trace.keys[i], trace.cmps[i] < 0 ? "LESS" : trace.cmps[i] > 0 ? "GREATER" : "EQUAL");
        }
        fputs("],\"unbalanced\":", stdout);
        const AvlEvent *u = NULL;
        for (int i = 0; r == AVL_OK && i < trace.event_count; i++) if (trace.events[i].type == AVL_EV_UNBALANCED) u = &trace.events[i];
        if (u) {
            printf("{\"key\":%d,\"bf\":%d,\"case\":\"%s\",\"child\":%d,\"grandchild\":", u->a, u->bf, avl_case_name(u->rcase), u->b);
            if (u->c >= 0) printf("%d}", u->c); else fputs("null}", stdout);
        } else fputs("null", stdout);
        fputs(",\"steps\":[", stdout);
        for (int i = 0; r == AVL_OK && i < trace.event_count; i++) {
            const AvlEvent *e = &trace.events[i];
            if (i) putchar(',');
            if (e->type == AVL_EV_PLACED) {
                printf("{\"event\":\"PLACED\",\"key\":%d,\"parent\":", e->a);
                if (e->b >= 0) printf("%d,\"side\":\"%s\"", e->b, e->c ? "RIGHT" : "LEFT"); else fputs("null,\"side\":\"ROOT\"", stdout);
            } else if (e->type == AVL_EV_UNBALANCED) {
                printf("{\"event\":\"UNBALANCED\",\"key\":%d,\"bf\":%d,\"case\":\"%s\",\"child\":%d,\"grandchild\":", e->a, e->bf, avl_case_name(e->rcase), e->b);
                if (e->c >= 0) printf("%d", e->c); else fputs("null", stdout);
            } else {
                printf("{\"event\":\"ROTATE\",\"dir\":\"%s\",\"pivot\":%d,\"newTop\":%d,\"moved\":", e->dir == 'L' ? "LEFT" : "RIGHT", e->a, e->b);
                if (e->c >= 0) printf("%d", e->c); else fputs("null", stdout);
            }
            fputs(",\"tree\":", stdout);
            print_avl_snapshot(&e->snap);
            putchar('}');
        }
        fputs("],", stdout);
        print_avl_state(name, t);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "AVL_SHOW") == 0 || strcmp(cmd, "AVL_CLEAR") == 0) {
        int clear = strcmp(cmd, "AVL_CLEAR") == 0;
        if (clear) avl_clear(t);
        printf("{\"ok\":true,\"op\":\"%s\",", clear ? "clear" : "show");
        print_avl_state(name, t);
        fputs("}\n", stdout);
    } else {
        respond_error("UNKNOWN_COMMAND", cmd);
    }
}

static void cmd_state(void)
{
    Stack *history = get_stack("history", 1);
    Queue *events = get_queue("events", 1, DEFAULT_QUEUE_CAPACITY);
    fputs("{\"ok\":true,\"history\":{", stdout);
    if (history) print_stack_body("history", history, 12);
    fputs("},\"events\":{", stdout);
    if (events) print_queue_body("events", events);
    fputs("},\"quests\":{", stdout);
    print_quest_body();
    fputs("}}\n", stdout);
}

/* ------------------------------------------------------------------- main */

static char *read_line(void)
{
    size_t cap = 256, len = 0;
    char *buf = (char *)malloc(cap);
    if (!buf) return NULL;
    int c;
    while ((c = getchar()) != EOF && c != '\n') {
        if (c == '\r') continue;
        if (len + 1 >= cap) {
            cap *= 2;
            char *grown = (char *)realloc(buf, cap);
            if (!grown) { free(buf); return NULL; }
            buf = grown;
        }
        buf[len++] = (char)c;
    }
    if (c == EOF && len == 0) { free(buf); return NULL; }
    buf[len] = '\0';
    return buf;
}

static int tokenize(char *line, char **tok, int max)
{
    int n = 0;
    char *p = line;
    while (*p && n < max) {
        while (*p == ' ' || *p == '\t') p++;
        if (!*p) break;
        tok[n++] = p;
        while (*p && *p != ' ' && *p != '\t') p++;
        if (*p) *p++ = '\0';
    }
    return n;
}

int main(void)
{
    static char *tok[MAX_TOKENS];
    quest_chain_init(&g_quests);

    char *line;
    while ((line = read_line()) != NULL) {
        int ntok = tokenize(line, tok, MAX_TOKENS);
        if (ntok == 0) { free(line); continue; }
        const char *cmd = tok[0];

        if (strcmp(cmd, "PING") == 0) fputs("{\"ok\":true,\"engine\":\"dsa\",\"language\":\"C\"}\n", stdout);
        else if (strcmp(cmd, "RESET") == 0) { reset_all(); fputs("{\"ok\":true,\"op\":\"reset\"}\n", stdout); }
        else if (strcmp(cmd, "STATE") == 0) cmd_state();
        else if (strncmp(cmd, "STACK_", 6) == 0) cmd_stack(tok, ntok);
        else if (strncmp(cmd, "QUEUE_", 6) == 0) cmd_queue(tok, ntok);
        else if (strncmp(cmd, "LQUEUE_", 7) == 0) cmd_lqueue(tok, ntok);
        else if (strncmp(cmd, "LIST_", 5) == 0) cmd_list(tok, ntok);
        else if (strncmp(cmd, "QUEST_", 6) == 0) cmd_quest(tok, ntok);
        else if (strcmp(cmd, "PATH") == 0 || strcmp(cmd, "TRACE") == 0) cmd_path(tok, ntok);
        else if (strncmp(cmd, "BST_", 4) == 0) cmd_bst(tok, ntok);
        else if (strncmp(cmd, "SORT_", 5) == 0) cmd_sort(tok, ntok);
        else if (strncmp(cmd, "AVL_", 4) == 0) cmd_avl(tok, ntok);
        else if (strcmp(cmd, "QUIT") == 0) { free(line); break; }
        else respond_error("UNKNOWN_COMMAND", cmd);

        fflush(stdout);   /* one response per line, delivered immediately */
        free(line);
    }
    reset_all();
    return 0;
}

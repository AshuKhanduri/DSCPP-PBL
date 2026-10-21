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
 *   STACK_PUSH <name> <text> [value] | STACK_POP <name> | STACK_PEEK <name>
 *   STACK_LIST <name> [limit]         | STACK_CLEAR <name>
 *   QUEUE_CREATE <name> <capacity>    | QUEUE_ENQ <name> <text> [value]
 *   QUEUE_DEQ <name> | QUEUE_LIST <name> | QUEUE_CLEAR <name>
 *   LIST_INSERT <name> HEAD|TAIL <text> | LIST_INSERT <name> AFTER <after> <text>
 *   LIST_REMOVE <name> <text> | LIST_SHOW <name> | LIST_CLEAR <name>
 *   QUEST_RESET | QUEST_ADD <id> | QUEST_START <id> | QUEST_COMPLETE <id> | QUEST_STATE
 *   PATH <BFS|DFS> <start> <goal> <directed> <hscale>
 *        <n> (x y)*n <m> (u v w)*m
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

#define MAX_NAMED 16
#define NAME_MAX_LEN 32
#define MAX_TOKENS 16384
#define DEFAULT_QUEUE_CAPACITY 32
#define DEFAULT_LIST_LIMIT 64

typedef struct { char name[NAME_MAX_LEN]; Stack s; int used; } NamedStack;
typedef struct { char name[NAME_MAX_LEN]; Queue q; int used; } NamedQueue;
typedef struct { char name[NAME_MAX_LEN]; LinkedList l; int used; } NamedList;

static NamedStack g_stacks[MAX_NAMED];
static NamedQueue g_queues[MAX_NAMED];
static NamedList  g_lists[MAX_NAMED];
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

static void reset_all(void)
{
    for (int i = 0; i < MAX_NAMED; i++) {
        if (g_stacks[i].used) stack_clear(&g_stacks[i].s);
        if (g_queues[i].used) queue_free(&g_queues[i].q);
        if (g_lists[i].used) list_clear(&g_lists[i].l);
        g_stacks[i].used = g_queues[i].used = g_lists[i].used = 0;
    }
    quest_chain_clear(&g_quests);
}

/* ------------------------------------------------------------ serialisers */

static void print_stack_body(const char *name, const Stack *s, int limit)
{
    fputs("\"name\":", stdout);
    json_string(name);
    printf(",\"size\":%d,\"top\":", s->size);
    if (s->top) json_string(s->top->text); else fputs("null", stdout);
    fputs(",\"items\":[", stdout);
    int i = 0;
    for (const StackNode *n = s->top; n && i < limit; n = n->next, i++) {
        if (i) putchar(',');
        fputs("{\"text\":", stdout);
        json_string(n->text);
        printf(",\"value\":%d}", n->value);
    }
    putchar(']');
}

static void print_queue_body(const char *name, const Queue *q)
{
    fputs("\"name\":", stdout);
    json_string(name);
    printf(",\"size\":%d,\"capacity\":%d,\"front\":", q->size, q->capacity);
    if (q->size) json_string(queue_peek(q)->text); else fputs("null", stdout);
    fputs(",\"items\":[", stdout);
    for (int i = 0; i < q->size; i++) {
        const QueueItem *it = queue_at(q, i);
        if (i) putchar(',');
        fputs("{\"text\":", stdout);
        json_string(it->text);
        printf(",\"value\":%d}", it->value);
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

    if (strcmp(cmd, "STACK_PUSH") == 0) {
        if (ntok < 3) { respond_error("BAD_ARGS", "STACK_PUSH <name> <text> [value]"); return; }
        Stack *s = get_stack(name, 1);
        if (!s) { respond_error("LIMIT", "too many stacks"); return; }
        if (!stack_push(s, arg_int(tok, ntok, 3, 0), 0, tok[2])) { respond_error("OUT_OF_MEMORY", "push failed"); return; }
        fputs("{\"ok\":true,\"op\":\"push\",", stdout);
        print_stack_body(name, s, DEFAULT_LIST_LIMIT);
        fputs("}\n", stdout);
        return;
    }

    Stack *s = get_stack(name, 1);
    if (!s) { respond_error("LIMIT", "too many stacks"); return; }

    if (strcmp(cmd, "STACK_POP") == 0) {
        StackNode popped;
        if (!stack_pop(s, &popped)) { respond_error("STACK_EMPTY", "cannot pop from an empty stack (underflow)"); return; }
        fputs("{\"ok\":true,\"op\":\"pop\",\"popped\":{\"text\":", stdout);
        json_string(popped.text);
        printf(",\"value\":%d},", popped.value);
        print_stack_body(name, s, DEFAULT_LIST_LIMIT);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "STACK_PEEK") == 0 || strcmp(cmd, "STACK_LIST") == 0) {
        int limit = arg_int(tok, ntok, 2, DEFAULT_LIST_LIMIT);
        if (limit < 0) limit = DEFAULT_LIST_LIMIT;
        if (strcmp(cmd, "STACK_PEEK") == 0) limit = 1;
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
            respond_error("QUEUE_FULL", "queue is full (overflow)");
            return;
        }
        fputs("{\"ok\":true,\"op\":\"enqueue\",", stdout);
        print_queue_body(name, q);
        fputs("}\n", stdout);
    } else if (strcmp(cmd, "QUEUE_DEQ") == 0) {
        QueueItem item;
        if (!queue_dequeue(q, &item)) { respond_error("QUEUE_EMPTY", "cannot dequeue from an empty queue (underflow)"); return; }
        fputs("{\"ok\":true,\"op\":\"dequeue\",\"dequeued\":{\"text\":", stdout);
        json_string(item.text);
        printf(",\"value\":%d},", item.value);
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
    double hscale = strtod(tok[5], NULL);   /* reserved for weighted searches */
    (void)hscale;
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
    if (!graph_valid_node(g, start) || !graph_valid_node(g, goal)) {
        graph_free(g);
        respond_error("BAD_ARGS", "start/goal out of range");
        return;
    }

    PathResult res;
    int ok;
    if (strcmp(algo, "BFS") == 0) ok = bfs_search(g, start, goal, &res);
    else if (strcmp(algo, "DFS") == 0) ok = dfs_search(g, start, goal, &res);
    else { graph_free(g); respond_error("BAD_ARGS", "algorithm must be BFS or DFS"); return; }

    if (!ok) {
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
    fputs("}\n", stdout);

    path_result_free(&res);
    graph_free(g);
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
        else if (strncmp(cmd, "LIST_", 5) == 0) cmd_list(tok, ntok);
        else if (strncmp(cmd, "QUEST_", 6) == 0) cmd_quest(tok, ntok);
        else if (strcmp(cmd, "PATH") == 0) cmd_path(tok, ntok);
        else if (strcmp(cmd, "QUIT") == 0) { free(line); break; }
        else respond_error("UNKNOWN_COMMAND", cmd);

        fflush(stdout);   /* one response per line, delivered immediately */
        free(line);
    }
    reset_all();
    return 0;
}

#include "search_trace.h"
#include <stdlib.h>

static const char *OP_NAMES[] = {
    "START", "DEQUEUE", "CHECK", "DISCOVER", "DONE", "POP", "SKIP", "VISIT", "PUSH", "GOAL", "EXHAUSTED",
};

const char *trace_op_name(int op)
{
    if (op < 0 || op > TR_EXHAUSTED) return "UNKNOWN";
    return OP_NAMES[op];
}

void trace_init(SearchTrace *t)
{
    t->events = NULL;
    t->len = t->cap = 0;
    t->snap = NULL;
    t->snap_len = t->snap_cap = 0;
    t->failed = 0;
}

void trace_free(SearchTrace *t)
{
    free(t->events);
    free(t->snap);
    trace_init(t);
}

static TraceEvent *next_event(SearchTrace *t)
{
    if (t->failed) return NULL;
    if (t->len == t->cap) {
        int cap = t->cap ? t->cap * 2 : 64;
        TraceEvent *grown = (TraceEvent *)realloc(t->events, sizeof(TraceEvent) * (size_t)cap);
        if (!grown) { t->failed = 1; return NULL; }
        t->events = grown;
        t->cap = cap;
    }
    return &t->events[t->len++];
}

static int reserve_snap(SearchTrace *t, int extra)
{
    if (t->snap_len + extra <= t->snap_cap) return 1;
    int cap = t->snap_cap ? t->snap_cap : 256;
    while (cap < t->snap_len + extra) cap *= 2;
    int *grown = (int *)realloc(t->snap, sizeof(int) * (size_t)cap);
    if (!grown) { t->failed = 1; return 0; }
    t->snap = grown;
    t->snap_cap = cap;
    return 1;
}

void trace_event(SearchTrace *t, int op, int node, int other, int flag)
{
    if (!t) return;
    TraceEvent *e = next_event(t);
    if (!e) return;
    e->op = op;
    e->node = node;
    e->other = other;
    e->flag = flag;
    e->snap_off = -1;
    e->snap_len = 0;
}

void trace_event_queue(SearchTrace *t, int op, int node, int other, const Queue *q)
{
    if (!t) return;
    if (!reserve_snap(t, q->size)) return;
    trace_event(t, op, node, other, 0);
    if (t->failed) return;
    TraceEvent *e = &t->events[t->len - 1];
    e->snap_off = t->snap_len;
    for (int i = 0; i < q->size; i++) t->snap[t->snap_len++] = queue_at(q, i)->value;
    e->snap_len = q->size;
}

void trace_event_stack(SearchTrace *t, int op, int node, int other, const Stack *s)
{
    if (!t) return;
    if (!reserve_snap(t, s->size * 2)) return;
    trace_event(t, op, node, other, 0);
    if (t->failed) return;
    TraceEvent *e = &t->events[t->len - 1];
    e->snap_off = t->snap_len;
    for (const StackNode *n = s->top; n; n = n->next) {
        t->snap[t->snap_len++] = n->value;
        t->snap[t->snap_len++] = n->aux;
    }
    e->snap_len = s->size * 2;
}

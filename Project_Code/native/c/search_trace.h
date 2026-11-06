/*
 * search_trace.h - optional step-by-step recording of BFS / DFS.
 *
 * bfs.c and dfs.c call these hooks at every operation they perform (enqueue,
 * dequeue, push, pop, neighbour check, ...). After each operation that changes
 * the frontier, the hook copies the REAL Queue / Stack contents, so the game's
 * walkthrough shows exactly what the C data structure held at that moment.
 * Passing NULL instead of a trace costs nothing: every hook returns at once.
 */
#ifndef SEARCH_TRACE_H
#define SEARCH_TRACE_H

#include "queue.h"
#include "stack.h"

typedef enum {
    TR_START,      /* BFS: start marked visited + enqueued   DFS: start pushed      */
    TR_DEQUEUE,    /* BFS: node removed from the front of the queue                 */
    TR_CHECK,      /* node = u, other = neighbour v, flag = 1 if v already visited  */
    TR_DISCOVER,   /* BFS: v (other = parent u) marked visited and enqueued         */
    TR_DONE,       /* finished scanning u's neighbours, flag = number added         */
    TR_POP,        /* DFS: entry popped from the top, other = who pushed it         */
    TR_SKIP,       /* DFS: popped node was already visited, entry discarded         */
    TR_VISIT,      /* DFS: popped node marked visited, other = parent               */
    TR_PUSH,       /* DFS: v pushed, other = u (the node that pushed it)            */
    TR_GOAL,       /* goal reached                                                  */
    TR_EXHAUSTED   /* frontier empty, goal not reachable                            */
} TraceOp;

typedef struct {
    int op, node, other, flag;
    int snap_off;  /* offset into SearchTrace.snap, -1 = no snapshot          */
    int snap_len;  /* ints in the snapshot (queue: 1 per item, stack: 2)       */
} TraceEvent;

typedef struct {
    TraceEvent *events;
    int len, cap;
    int *snap;
    int snap_len, snap_cap;
    int failed;    /* an allocation failed; the trace is incomplete */
} SearchTrace;

void trace_init(SearchTrace *t);
void trace_free(SearchTrace *t);
const char *trace_op_name(int op);

/* Record an event without a snapshot. */
void trace_event(SearchTrace *t, int op, int node, int other, int flag);
/* Record an event plus the queue contents, front to rear. */
void trace_event_queue(SearchTrace *t, int op, int node, int other, const Queue *q);
/* Record an event plus the stack contents, top to bottom, as (value, aux) pairs. */
void trace_event_stack(SearchTrace *t, int op, int node, int other, const Stack *s);

#endif

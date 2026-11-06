/*
 * bfs.c - Breadth-First Search.
 *
 * Explores the graph level by level using the circular Queue from queue.c.
 * On an unweighted graph the first time the goal is reached is via a path
 * with the fewest edges (hops) - which is what Lost Path uses for scoring
 * and for the Guide's lantern hint.
 *
 * bfs_search_traced() additionally records every operation (search_trace.h)
 * together with the queue contents, for the step-by-step walkthrough.
 */
#include "graph.h"
#include "queue.h"
#include <stdlib.h>

int bfs_search(const Graph *g, int start, int goal, PathResult *out)
{
    return bfs_search_traced(g, start, goal, out, NULL);
}

int bfs_search_traced(const Graph *g, int start, int goal, PathResult *out, SearchTrace *trace)
{
    path_result_init(out, g->n);
    if (!graph_valid_node(g, start) || (goal != NO_GOAL && !graph_valid_node(g, goal))) return 0;

    int *parent = (int *)malloc(sizeof(int) * (size_t)g->n);
    char *seen = (char *)calloc((size_t)g->n, 1);
    Queue frontier;
    if (!parent || !seen || !queue_init(&frontier, g->n)) {
        free(parent); free(seen);
        return 0;
    }
    for (int i = 0; i < g->n; i++) parent[i] = -1;

    seen[start] = 1;
    queue_enqueue(&frontier, start, 0, NULL);
    trace_event_queue(trace, TR_START, start, -1, &frontier);

    QueueItem item;
    while (queue_dequeue(&frontier, &item)) {
        int u = item.value;
        trace_event_queue(trace, TR_DEQUEUE, u, parent[u], &frontier);
        out->visit_order[out->visit_len++] = u;
        out->expanded++;
        if (u == goal) {
            trace_event(trace, TR_GOAL, u, parent[u], 0);
            path_result_build(out, g, parent, start, goal);
            break;
        }
        int added = 0;
        for (Edge *e = g->adj[u]; e; e = e->next) {
            trace_event(trace, TR_CHECK, u, e->to, seen[e->to]);
            if (seen[e->to]) continue;
            seen[e->to] = 1;          /* mark on discovery: each node enqueued once */
            parent[e->to] = u;
            queue_enqueue(&frontier, e->to, 0, NULL);
            trace_event_queue(trace, TR_DISCOVER, e->to, u, &frontier);
            added++;
        }
        trace_event(trace, TR_DONE, u, -1, added);
    }
    if (!out->found) trace_event(trace, TR_EXHAUSTED, -1, -1, 0);

    queue_free(&frontier);
    free(parent);
    free(seen);
    return 1;
}

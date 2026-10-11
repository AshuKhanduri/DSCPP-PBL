/*
 * bfs.c - Breadth-First Search.
 *
 * Explores the graph level by level using the circular Queue from queue.c.
 * On an unweighted graph the first time the goal is reached is via a path
 * with the fewest edges (hops) - which is what Lost Path uses for scoring
 * and for the Guide's lantern hint.
 */
#include "graph.h"
#include "queue.h"
#include <stdlib.h>

int bfs_search(const Graph *g, int start, int goal, PathResult *out)
{
    path_result_init(out, g->n);
    if (!graph_valid_node(g, start) || !graph_valid_node(g, goal)) return 0;

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

    QueueItem item;
    while (queue_dequeue(&frontier, &item)) {
        int u = item.value;
        out->visit_order[out->visit_len++] = u;
        out->expanded++;
        if (u == goal) {
            path_result_build(out, g, parent, start, goal);
            break;
        }
        for (Edge *e = g->adj[u]; e; e = e->next) {
            if (seen[e->to]) continue;
            seen[e->to] = 1;          /* mark on discovery: each node enqueued once */
            parent[e->to] = u;
            queue_enqueue(&frontier, e->to, 0, NULL);
        }
    }

    queue_free(&frontier);
    free(parent);
    free(seen);
    return 1;
}

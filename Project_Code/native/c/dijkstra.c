/*
 * dijkstra.c - Dijkstra's single-source shortest path (non-negative weights).
 *
 * Uses the binary min-heap from priority_queue.c with lazy deletion: stale
 * heap entries are skipped when popped. Stops as soon as the goal is
 * settled. Complexity O((V + E) log V).
 */
#include "graph.h"
#include "priority_queue.h"
#include <stdlib.h>

int dijkstra_search(const Graph *g, int start, int goal, PathResult *out)
{
    path_result_init(out, g->n);
    if (!graph_valid_node(g, start) || !graph_valid_node(g, goal)) return 0;

    long *dist = (long *)malloc(sizeof(long) * (size_t)g->n);
    int *parent = (int *)malloc(sizeof(int) * (size_t)g->n);
    char *settled = (char *)calloc((size_t)g->n, 1);
    PriorityQueue pq;
    if (!dist || !parent || !settled || !pq_init(&pq, g->n * 2)) {
        free(dist); free(parent); free(settled);
        return 0;
    }
    for (int i = 0; i < g->n; i++) { dist[i] = -1; parent[i] = -1; }

    dist[start] = 0;
    pq_push(&pq, start, 0.0);

    PQItem item;
    while (pq_pop(&pq, &item)) {
        int u = item.node;
        if (settled[u]) continue;            /* stale entry */
        settled[u] = 1;
        out->visit_order[out->visit_len++] = u;
        out->expanded++;
        if (u == goal) break;
        for (Edge *e = g->adj[u]; e; e = e->next) {
            long candidate = dist[u] + e->weight;
            if (settled[e->to]) continue;
            if (dist[e->to] < 0 || candidate < dist[e->to]) {   /* relax */
                dist[e->to] = candidate;
                parent[e->to] = u;
                pq_push(&pq, e->to, (double)candidate);
            }
        }
    }

    if (settled[goal]) path_result_build(out, g, parent, start, goal);

    pq_free(&pq);
    free(dist);
    free(parent);
    free(settled);
    return 1;
}

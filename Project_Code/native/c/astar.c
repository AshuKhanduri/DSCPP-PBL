/*
 * astar.c - A* search.
 *
 * Like Dijkstra, but the heap is ordered by f(n) = g(n) + h(n), where h(n) is
 * the straight-line distance from n to the goal divided by `hscale` (the
 * number of map pixels that one unit of edge cost represents). This makes
 * the search goal-directed: it usually expands fewer nodes than Dijkstra.
 *
 * Optimality requires h to be admissible. We check the stronger
 * *consistency* condition  w(u,v) >= h_dist(u,v)  on every edge and report
 * it, so the game can show whether A*'s answer is guaranteed optimal.
 * Nodes are re-opened if a cheaper g is found, so the search stays correct
 * even when the heuristic is not consistent.
 */
#include "graph.h"
#include "priority_queue.h"
#include <math.h>
#include <stdlib.h>

static double heuristic(const Graph *g, int a, int b, double hscale)
{
    double dx = (double)(g->x[a] - g->x[b]);
    double dy = (double)(g->y[a] - g->y[b]);
    return sqrt(dx * dx + dy * dy) / hscale;
}

static int check_consistency(const Graph *g, double hscale)
{
    for (int u = 0; u < g->n; u++)
        for (Edge *e = g->adj[u]; e; e = e->next)
            if ((double)e->weight + 1e-9 < heuristic(g, u, e->to, hscale)) return 0;
    return 1;
}

int astar_search(const Graph *g, int start, int goal, double hscale, PathResult *out, int *consistent_out)
{
    path_result_init(out, g->n);
    if (hscale <= 0) hscale = 1.0;
    if (consistent_out) *consistent_out = check_consistency(g, hscale);
    if (!graph_valid_node(g, start) || !graph_valid_node(g, goal)) return 0;

    long *gscore = (long *)malloc(sizeof(long) * (size_t)g->n);
    int *parent = (int *)malloc(sizeof(int) * (size_t)g->n);
    char *closed = (char *)calloc((size_t)g->n, 1);
    PriorityQueue open;
    if (!gscore || !parent || !closed || !pq_init(&open, g->n * 2)) {
        free(gscore); free(parent); free(closed);
        return 0;
    }
    for (int i = 0; i < g->n; i++) { gscore[i] = -1; parent[i] = -1; }

    gscore[start] = 0;
    pq_push(&open, start, heuristic(g, start, goal, hscale));

    int visit_cap = g->n * 2;
    int reached = 0;
    PQItem item;
    while (pq_pop(&open, &item)) {
        int u = item.node;
        double f_expected = (double)gscore[u] + heuristic(g, u, goal, hscale);
        if (closed[u] && item.priority >= f_expected - 1e-9) continue; /* stale */
        if (item.priority > f_expected + 1e-9) continue;               /* stale */
        closed[u] = 1;
        if (out->visit_len < visit_cap) out->visit_order[out->visit_len++] = u;
        out->expanded++;
        if (u == goal) { reached = 1; break; }
        for (Edge *e = g->adj[u]; e; e = e->next) {
            long tentative = gscore[u] + e->weight;
            if (gscore[e->to] < 0 || tentative < gscore[e->to]) {
                gscore[e->to] = tentative;
                parent[e->to] = u;
                closed[e->to] = 0;           /* (re)open */
                pq_push(&open, e->to, (double)tentative + heuristic(g, e->to, goal, hscale));
            }
        }
    }

    if (reached) path_result_build(out, g, parent, start, goal);

    pq_free(&open);
    free(gscore);
    free(parent);
    free(closed);
    return 1;
}

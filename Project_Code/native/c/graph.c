#include "graph.h"
#include <stdlib.h>

Graph *graph_create(int n, int directed)
{
    Graph *g = (Graph *)calloc(1, sizeof(Graph));
    if (!g) return NULL;
    g->n = n;
    g->directed = directed;
    g->x = (int *)calloc((size_t)n, sizeof(int));
    g->y = (int *)calloc((size_t)n, sizeof(int));
    g->adj = (Edge **)calloc((size_t)n, sizeof(Edge *));
    if (!g->x || !g->y || !g->adj) { graph_free(g); return NULL; }
    return g;
}

void graph_free(Graph *g)
{
    if (!g) return;
    if (g->adj) {
        for (int i = 0; i < g->n; i++) {
            Edge *e = g->adj[i];
            while (e) { Edge *next = e->next; free(e); e = next; }
        }
    }
    free(g->adj);
    free(g->x);
    free(g->y);
    free(g);
}

int graph_valid_node(const Graph *g, int node)
{
    return node >= 0 && node < g->n;
}

void graph_set_position(Graph *g, int node, int x, int y)
{
    if (!graph_valid_node(g, node)) return;
    g->x[node] = x;
    g->y[node] = y;
}

/* Append so neighbours are explored in the order the edges were declared. */
static int append_edge(Graph *g, int u, int v, int w)
{
    Edge *e = (Edge *)malloc(sizeof(Edge));
    if (!e) return 0;
    e->to = v;
    e->weight = w;
    e->next = NULL;
    Edge **slot = &g->adj[u];
    while (*slot) slot = &(*slot)->next;
    *slot = e;
    return 1;
}

int graph_add_edge(Graph *g, int u, int v, int weight)
{
    if (!graph_valid_node(g, u) || !graph_valid_node(g, v) || weight < 0) return 0;
    if (!append_edge(g, u, v, weight)) return 0;
    if (!g->directed && u != v) return append_edge(g, v, u, weight);
    return 1;
}

int graph_edge_weight(const Graph *g, int u, int v)
{
    int best = -1;
    for (Edge *e = g->adj[u]; e; e = e->next)
        if (e->to == v && (best < 0 || e->weight < best)) best = e->weight;
    return best;
}

void path_result_init(PathResult *r, int n)
{
    r->found = 0;
    r->path = (int *)malloc(sizeof(int) * (size_t)(n > 0 ? n : 1));
    r->visit_order = (int *)malloc(sizeof(int) * (size_t)(n > 0 ? n * 2 : 1));
    r->path_len = 0;
    r->visit_len = 0;
    r->cost = 0;
    r->expanded = 0;
}

void path_result_free(PathResult *r)
{
    free(r->path);
    free(r->visit_order);
    r->path = r->visit_order = NULL;
}

void path_result_build(PathResult *r, const Graph *g, const int *parent, int start, int goal)
{
    /* Walk parent pointers backwards from the goal, then reverse. */
    int len = 0;
    for (int v = goal; v != -1; v = parent[v]) {
        r->path[len++] = v;
        if (v == start) break;
        if (len > g->n) { r->found = 0; r->path_len = 0; return; } /* safety */
    }
    for (int i = 0; i < len / 2; i++) {
        int t = r->path[i];
        r->path[i] = r->path[len - 1 - i];
        r->path[len - 1 - i] = t;
    }
    r->path_len = len;
    r->found = (len > 0 && r->path[0] == start);
    r->cost = 0;
    for (int i = 0; i + 1 < len; i++) r->cost += graph_edge_weight(g, r->path[i], r->path[i + 1]);
}

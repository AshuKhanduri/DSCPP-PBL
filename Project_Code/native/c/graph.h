/*
 * graph.h - weighted graph stored as adjacency lists.
 *
 * Every node also carries (x, y) coordinates. They are only needed by A*,
 * whose heuristic is the straight-line distance to the goal.
 */
#ifndef GRAPH_H
#define GRAPH_H

typedef struct Edge {
    int to;
    int weight;
    struct Edge *next;
} Edge;

typedef struct {
    int n;          /* number of nodes (ids 0..n-1) */
    int directed;
    int *x, *y;     /* node coordinates             */
    Edge **adj;     /* adj[u] = list of edges out of u, in insertion order */
} Graph;

Graph *graph_create(int n, int directed);
void   graph_free(Graph *g);
void   graph_set_position(Graph *g, int node, int x, int y);
int    graph_add_edge(Graph *g, int u, int v, int weight); /* 1 ok, 0 invalid */
int    graph_valid_node(const Graph *g, int node);

/* Result shared by every path-finding algorithm. Caller frees with path_result_free. */
typedef struct {
    int found;
    int *path;          /* node ids from start to goal                 */
    int path_len;
    int *visit_order;   /* order in which nodes were expanded/visited  */
    int visit_len;
    long cost;          /* sum of edge weights along `path`            */
    int expanded;       /* number of nodes expanded                    */
} PathResult;

void path_result_init(PathResult *r, int n);
void path_result_free(PathResult *r);
/* Rebuild start->goal path from a parent[] array and compute its cost. */
void path_result_build(PathResult *r, const Graph *g, const int *parent, int start, int goal);
/* Weight of the edge u->v, or -1 if none. */
int  graph_edge_weight(const Graph *g, int u, int v);

int  bfs_search(const Graph *g, int start, int goal, PathResult *out);
int  dfs_search(const Graph *g, int start, int goal, PathResult *out);

#endif

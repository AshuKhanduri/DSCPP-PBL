/*
 * dfs.c - Depth-First Search (iterative).
 *
 * Uses the linked-list Stack from stack.c instead of recursion. Each stack
 * entry stores (node, parent) so the DFS tree path can be rebuilt. DFS finds
 * *a* path, not necessarily the shortest one - Lost Path shows this contrast
 * next to BFS after the challenge ends.
 */
#include "graph.h"
#include "stack.h"
#include <stdlib.h>

int dfs_search(const Graph *g, int start, int goal, PathResult *out)
{
    path_result_init(out, g->n);
    if (!graph_valid_node(g, start) || !graph_valid_node(g, goal)) return 0;

    int *parent = (int *)malloc(sizeof(int) * (size_t)g->n);
    char *visited = (char *)calloc((size_t)g->n, 1);
    int *scratch = (int *)malloc(sizeof(int) * (size_t)(g->n * 2 + 1));
    if (!parent || !visited || !scratch) {
        free(parent); free(visited); free(scratch);
        return 0;
    }
    for (int i = 0; i < g->n; i++) parent[i] = -1;

    Stack stack;
    stack_init(&stack);
    stack_push(&stack, start, -1, NULL);

    StackNode top;
    while (stack_pop(&stack, &top)) {
        int u = top.value;
        if (visited[u]) continue;
        visited[u] = 1;
        parent[u] = top.aux;
        out->visit_order[out->visit_len++] = u;
        out->expanded++;
        if (u == goal) {
            path_result_build(out, g, parent, start, goal);
            break;
        }
        /* Push neighbours in reverse so the first-declared edge is explored first. */
        int count = 0;
        for (Edge *e = g->adj[u]; e && count < g->n * 2; e = e->next)
            if (!visited[e->to]) scratch[count++] = e->to;
        for (int i = count - 1; i >= 0; i--)
            stack_push(&stack, scratch[i], u, NULL);
    }

    stack_clear(&stack);
    free(parent);
    free(visited);
    free(scratch);
    return 1;
}

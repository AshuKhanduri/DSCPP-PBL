/*
 * dfs.c - Depth-First Search (iterative).
 *
 * Uses the linked-list Stack from stack.c instead of recursion. Each stack
 * entry stores (node, parent) so the DFS tree path can be rebuilt. DFS finds
 * *a* path, not necessarily the shortest one - Lost Path shows this contrast
 * next to BFS after the challenge ends.
 *
 * Neighbours are pushed when a node is visited and only checked for
 * "visited" again when popped, so a node can sit on the stack twice; the
 * stale copy is discarded when it surfaces (TR_SKIP in the trace).
 * dfs_search_traced() records every push / pop / visit with the stack contents.
 */
#include "graph.h"
#include "stack.h"
#include <stdlib.h>

int dfs_search(const Graph *g, int start, int goal, PathResult *out)
{
    return dfs_search_traced(g, start, goal, out, NULL);
}

int dfs_search_traced(const Graph *g, int start, int goal, PathResult *out, SearchTrace *trace)
{
    path_result_init(out, g->n);
    if (!graph_valid_node(g, start) || (goal != NO_GOAL && !graph_valid_node(g, goal))) return 0;

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
    trace_event_stack(trace, TR_START, start, -1, &stack);

    StackNode top;
    while (stack_pop(&stack, &top)) {
        int u = top.value;
        trace_event_stack(trace, TR_POP, u, top.aux, &stack);
        if (visited[u]) {
            trace_event(trace, TR_SKIP, u, top.aux, 0);
            continue;
        }
        visited[u] = 1;
        parent[u] = top.aux;
        trace_event(trace, TR_VISIT, u, top.aux, 0);
        out->visit_order[out->visit_len++] = u;
        out->expanded++;
        if (u == goal) {
            trace_event(trace, TR_GOAL, u, top.aux, 0);
            path_result_build(out, g, parent, start, goal);
            break;
        }
        /* Push neighbours in reverse so the first-declared edge is explored first. */
        int count = 0;
        for (Edge *e = g->adj[u]; e && count < g->n * 2; e = e->next) {
            trace_event(trace, TR_CHECK, u, e->to, visited[e->to]);
            if (!visited[e->to]) scratch[count++] = e->to;
        }
        for (int i = count - 1; i >= 0; i--) {
            stack_push(&stack, scratch[i], u, NULL);
            trace_event_stack(trace, TR_PUSH, scratch[i], u, &stack);
        }
        trace_event(trace, TR_DONE, u, -1, count);
    }
    if (!out->found) trace_event(trace, TR_EXHAUSTED, -1, -1, 0);

    stack_clear(&stack);
    free(parent);
    free(visited);
    free(scratch);
    return 1;
}

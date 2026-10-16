/*
 * stack.h - LIFO stack implemented as a singly linked list of nodes.
 *
 * Used by the game for:
 *   - the player's action history (newest action on top)
 *   - the route "breadcrumb" stack in graph challenges (backtracking)
 *   - iterative DFS (dfs.c)
 *
 * push / pop / peek are all O(1).
 */
#ifndef STACK_H
#define STACK_H

#include "ds_common.h"

typedef struct StackNode {
    int value;                 /* numeric payload (e.g. graph node id)   */
    int aux;                   /* secondary payload (e.g. DFS parent)    */
    char text[DS_TEXT_MAX];    /* text payload (e.g. "ACCEPT_QUEST:x")   */
    struct StackNode *next;    /* node below this one                    */
} StackNode;

typedef struct {
    StackNode *top;
    int size;
} Stack;

void stack_init(Stack *s);
int  stack_push(Stack *s, int value, int aux, const char *text); /* 1 ok, 0 alloc fail */
int  stack_pop(Stack *s, StackNode *out);                        /* 1 ok, 0 empty      */
const StackNode *stack_peek(const Stack *s);                     /* NULL when empty    */
int  stack_is_empty(const Stack *s);
void stack_clear(Stack *s);

#endif

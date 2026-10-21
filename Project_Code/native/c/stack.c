#include "stack.h"
#include <stdlib.h>

void stack_init(Stack *s)
{
    s->top = NULL;
    s->size = 0;
}

int stack_push(Stack *s, int value, int aux, const char *text)
{
    StackNode *node = (StackNode *)malloc(sizeof(StackNode));
    if (!node) return 0;
    node->value = value;
    node->aux = aux;
    ds_copy_text(node->text, text);
    node->next = s->top;       /* new node sits above the old top */
    s->top = node;
    s->size++;
    return 1;
}

int stack_pop(Stack *s, StackNode *out)
{
    if (!s->top) return 0;
    StackNode *node = s->top;
    s->top = node->next;
    s->size--;
    if (out) {
        *out = *node;
        out->next = NULL;
    }
    free(node);
    return 1;
}

const StackNode *stack_peek(const Stack *s)
{
    return s->top;
}

int stack_is_empty(const Stack *s)
{
    return s->top == NULL;
}

void stack_clear(Stack *s)
{
    while (stack_pop(s, NULL)) { }
}

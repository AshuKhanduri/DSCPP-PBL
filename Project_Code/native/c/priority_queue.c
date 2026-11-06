#include "priority_queue.h"
#include <stdlib.h>

static int less(const PQItem *a, const PQItem *b)
{
    if (a->priority != b->priority) return a->priority < b->priority;
    return a->seq < b->seq;
}

static void swap(PQItem *a, PQItem *b)
{
    PQItem t = *a; *a = *b; *b = t;
}

int pq_init(PriorityQueue *pq, int capacity)
{
    if (capacity < 4) capacity = 4;
    pq->items = (PQItem *)malloc(sizeof(PQItem) * (size_t)capacity);
    pq->size = 0;
    pq->capacity = pq->items ? capacity : 0;
    pq->next_seq = 0;
    return pq->items != NULL;
}

void pq_free(PriorityQueue *pq)
{
    free(pq->items);
    pq->items = NULL;
    pq->size = pq->capacity = 0;
}

int pq_push(PriorityQueue *pq, int node, double priority)
{
    if (pq->size == pq->capacity) {
        int cap = pq->capacity * 2;
        PQItem *grown = (PQItem *)realloc(pq->items, sizeof(PQItem) * (size_t)cap);
        if (!grown) return 0;
        pq->items = grown;
        pq->capacity = cap;
    }
    int i = pq->size++;
    pq->items[i].node = node;
    pq->items[i].priority = priority;
    pq->items[i].seq = pq->next_seq++;
    /* sift up */
    while (i > 0) {
        int parent = (i - 1) / 2;
        if (!less(&pq->items[i], &pq->items[parent])) break;
        swap(&pq->items[i], &pq->items[parent]);
        i = parent;
    }
    return 1;
}

int pq_pop(PriorityQueue *pq, PQItem *out)
{
    if (pq->size == 0) return 0;
    *out = pq->items[0];
    pq->items[0] = pq->items[--pq->size];
    /* sift down */
    int i = 0;
    for (;;) {
        int l = 2 * i + 1, r = l + 1, smallest = i;
        if (l < pq->size && less(&pq->items[l], &pq->items[smallest])) smallest = l;
        if (r < pq->size && less(&pq->items[r], &pq->items[smallest])) smallest = r;
        if (smallest == i) break;
        swap(&pq->items[i], &pq->items[smallest]);
        i = smallest;
    }
    return 1;
}

int pq_is_empty(const PriorityQueue *pq)
{
    return pq->size == 0;
}

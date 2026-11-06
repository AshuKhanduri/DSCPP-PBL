/*
 * priority_queue.h - binary min-heap keyed by a double priority.
 * Used by Dijkstra (priority = distance) and A* (priority = g + h).
 * Ties are broken by insertion order so results are deterministic.
 */
#ifndef PRIORITY_QUEUE_H
#define PRIORITY_QUEUE_H

typedef struct {
    int node;
    double priority;
    long seq;
} PQItem;

typedef struct {
    PQItem *items;
    int size;
    int capacity;
    long next_seq;
} PriorityQueue;

int  pq_init(PriorityQueue *pq, int capacity);
void pq_free(PriorityQueue *pq);
int  pq_push(PriorityQueue *pq, int node, double priority); /* grows as needed */
int  pq_pop(PriorityQueue *pq, PQItem *out);                /* 0 when empty    */
int  pq_is_empty(const PriorityQueue *pq);

#endif

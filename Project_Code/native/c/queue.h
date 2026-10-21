/*
 * queue.h - FIFO queue implemented as a fixed-capacity circular buffer.
 *
 * Used by the game for:
 *   - the game event queue (QUEST_STARTED, OBJECTIVE_UPDATE, ...) whose
 *     dequeued items become on-screen notifications in FIFO order
 *   - BFS frontier (bfs.c)
 *
 * enqueue / dequeue / peek are O(1).
 */
#ifndef QUEUE_H
#define QUEUE_H

#include "ds_common.h"

typedef struct {
    int value;
    int aux;
    char text[DS_TEXT_MAX];
} QueueItem;

typedef struct {
    QueueItem *items;
    int capacity;
    int head;   /* index of the front item              */
    int tail;   /* index where the next item is written */
    int size;
} Queue;

int  queue_init(Queue *q, int capacity);   /* 1 ok, 0 alloc fail */
void queue_free(Queue *q);
int  queue_enqueue(Queue *q, int value, int aux, const char *text); /* 1 ok, 0 full */
int  queue_dequeue(Queue *q, QueueItem *out);                       /* 1 ok, 0 empty */
const QueueItem *queue_peek(const Queue *q);
const QueueItem *queue_at(const Queue *q, int i); /* i-th item from the front */
int  queue_is_empty(const Queue *q);
int  queue_is_full(const Queue *q);
void queue_clear(Queue *q);

#endif

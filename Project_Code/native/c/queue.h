/*
 * queue.h - FIFO queues in a fixed-size array.
 *
 * Queue (circular): FRONT = index of the first item, REAR = index of the last
 * item, size = how many items are stored. Both indices move forward with
 *     index = (index + 1) % capacity
 * so after the last slot they wrap back to slot 0 and freed slots are reused.
 * empty  <=> size == 0        full <=> size == capacity
 * (REAR starts at -1: the first enqueue goes to (-1 + 1) % capacity = 0.)
 *
 * Used by the game for:
 *   - the game event queue (QUEST_STARTED, OBJECTIVE_UPDATE, ...) whose
 *     dequeued items become on-screen notifications in FIFO order
 *   - the Tower of Trials circular-queue chamber
 *   - BFS frontier (bfs.c)
 *
 * LinearQueue: the simple array queue, kept to show its limitation in the
 * Tower. REAR only moves right (rear + 1, no wrap) and FRONT only moves right,
 * so once REAR reaches the last slot nothing more fits - even if dequeues
 * have freed slots at the start of the array.
 * empty  <=> front > rear     full <=> rear == capacity - 1
 *
 * enqueue / dequeue / peek are O(1) for both.
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
    int front;  /* index of the front item                                */
    int rear;   /* index of the rear (last) item, -1 before the first one  */
    int size;
} Queue;

int  queue_init(Queue *q, int capacity);   /* 1 ok, 0 alloc fail */
void queue_free(Queue *q);
int  queue_enqueue(Queue *q, int value, int aux, const char *text); /* 1 ok, 0 full */
int  queue_dequeue(Queue *q, QueueItem *out);                       /* 1 ok, 0 empty */
const QueueItem *queue_peek(const Queue *q);
const QueueItem *queue_at(const Queue *q, int i); /* i-th item from the front */
int  queue_slot_used(const Queue *q, int index);  /* is array slot `index` occupied? */
int  queue_is_empty(const Queue *q);
int  queue_is_full(const Queue *q);
void queue_clear(Queue *q);

typedef struct {
    QueueItem *items;
    int capacity;
    int front;  /* index of the front item                              */
    int rear;   /* index of the last item, -1 before the first enqueue   */
} LinearQueue;

int  lqueue_init(LinearQueue *q, int capacity);
void lqueue_free(LinearQueue *q);
int  lqueue_enqueue(LinearQueue *q, int value, const char *text);  /* 1 ok, 0 rear at the end */
int  lqueue_dequeue(LinearQueue *q, QueueItem *out);               /* 1 ok, 0 empty */
const QueueItem *lqueue_peek(const LinearQueue *q);
int  lqueue_size(const LinearQueue *q);
int  lqueue_is_empty(const LinearQueue *q);
int  lqueue_is_full(const LinearQueue *q);
void lqueue_clear(LinearQueue *q);

#endif

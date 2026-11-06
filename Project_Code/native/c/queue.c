#include "queue.h"
#include <stdlib.h>

/* ------------------------------------------------------------ circular */

int queue_init(Queue *q, int capacity)
{
    if (capacity < 1) capacity = 1;
    q->items = (QueueItem *)malloc(sizeof(QueueItem) * (size_t)capacity);
    q->capacity = q->items ? capacity : 0;
    q->front = 0;
    q->rear = -1;
    q->size = 0;
    return q->items != NULL;
}

void queue_free(Queue *q)
{
    free(q->items);
    q->items = NULL;
    q->capacity = q->front = q->size = 0;
    q->rear = -1;
}

int queue_enqueue(Queue *q, int value, int aux, const char *text)
{
    if (q->size == q->capacity) return 0;          /* overflow */
    q->rear = (q->rear + 1) % q->capacity;          /* wrap around */
    QueueItem *slot = &q->items[q->rear];
    slot->value = value;
    slot->aux = aux;
    ds_copy_text(slot->text, text);
    q->size++;
    return 1;
}

int queue_dequeue(Queue *q, QueueItem *out)
{
    if (q->size == 0) return 0;                     /* underflow */
    if (out) *out = q->items[q->front];
    q->front = (q->front + 1) % q->capacity;        /* wrap around */
    q->size--;
    return 1;
}

const QueueItem *queue_peek(const Queue *q)
{
    return q->size ? &q->items[q->front] : NULL;
}

const QueueItem *queue_at(const Queue *q, int i)
{
    if (i < 0 || i >= q->size) return NULL;
    return &q->items[(q->front + i) % q->capacity];
}

/* Slot `index` is used when it lies within `size` steps of FRONT (with wrap). */
int queue_slot_used(const Queue *q, int index)
{
    if (index < 0 || index >= q->capacity) return 0;
    return (index - q->front + q->capacity) % q->capacity < q->size;
}

int queue_is_empty(const Queue *q) { return q->size == 0; }
int queue_is_full(const Queue *q)  { return q->size == q->capacity; }

void queue_clear(Queue *q)
{
    q->front = 0;
    q->rear = -1;
    q->size = 0;
}

/* -------------------------------------------------------------- linear */

int lqueue_init(LinearQueue *q, int capacity)
{
    if (capacity < 1) capacity = 1;
    q->items = (QueueItem *)malloc(sizeof(QueueItem) * (size_t)capacity);
    q->capacity = q->items ? capacity : 0;
    lqueue_clear(q);
    return q->items != NULL;
}

void lqueue_free(LinearQueue *q)
{
    free(q->items);
    q->items = NULL;
    q->capacity = 0;
    lqueue_clear(q);
}

int lqueue_enqueue(LinearQueue *q, int value, const char *text)
{
    if (q->rear == q->capacity - 1) return 0;       /* REAR at the last slot: overflow */
    q->rear++;
    q->items[q->rear].value = value;
    q->items[q->rear].aux = 0;
    ds_copy_text(q->items[q->rear].text, text);
    return 1;
}

int lqueue_dequeue(LinearQueue *q, QueueItem *out)
{
    if (q->front > q->rear) return 0;               /* underflow */
    if (out) *out = q->items[q->front];
    q->front++;                                     /* the slot is never used again */
    return 1;
}

const QueueItem *lqueue_peek(const LinearQueue *q)
{
    return q->front <= q->rear ? &q->items[q->front] : NULL;
}

int lqueue_size(const LinearQueue *q) { return q->rear - q->front + 1; }
int lqueue_is_empty(const LinearQueue *q) { return q->front > q->rear; }
int lqueue_is_full(const LinearQueue *q) { return q->rear == q->capacity - 1; }

void lqueue_clear(LinearQueue *q)
{
    q->front = 0;
    q->rear = -1;
}

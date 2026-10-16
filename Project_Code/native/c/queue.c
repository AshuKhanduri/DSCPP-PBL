#include "queue.h"
#include <stdlib.h>

int queue_init(Queue *q, int capacity)
{
    if (capacity < 1) capacity = 1;
    q->items = (QueueItem *)malloc(sizeof(QueueItem) * (size_t)capacity);
    q->capacity = q->items ? capacity : 0;
    q->head = q->tail = q->size = 0;
    return q->items != NULL;
}

void queue_free(Queue *q)
{
    free(q->items);
    q->items = NULL;
    q->capacity = q->head = q->tail = q->size = 0;
}

int queue_enqueue(Queue *q, int value, int aux, const char *text)
{
    if (q->size == q->capacity) return 0;          /* overflow */
    QueueItem *slot = &q->items[q->tail];
    slot->value = value;
    slot->aux = aux;
    ds_copy_text(slot->text, text);
    q->tail = (q->tail + 1) % q->capacity;         /* wrap around */
    q->size++;
    return 1;
}

int queue_dequeue(Queue *q, QueueItem *out)
{
    if (q->size == 0) return 0;                    /* underflow */
    if (out) *out = q->items[q->head];
    q->head = (q->head + 1) % q->capacity;
    q->size--;
    return 1;
}

const QueueItem *queue_peek(const Queue *q)
{
    return q->size ? &q->items[q->head] : NULL;
}

const QueueItem *queue_at(const Queue *q, int i)
{
    if (i < 0 || i >= q->size) return NULL;
    return &q->items[(q->head + i) % q->capacity];
}

int queue_is_empty(const Queue *q) { return q->size == 0; }
int queue_is_full(const Queue *q)  { return q->size == q->capacity; }

void queue_clear(Queue *q)
{
    q->head = q->tail = q->size = 0;
}

#include "linked_list.h"
#include <stdlib.h>
#include <string.h>

void list_init(LinkedList *l)
{
    l->head = l->tail = NULL;
    l->size = 0;
}

static ListNode *new_node(const char *key)
{
    ListNode *n = (ListNode *)malloc(sizeof(ListNode));
    if (!n) return NULL;
    ds_copy_text(n->key, key);
    n->status = 0;
    n->next = NULL;
    return n;
}

ListNode *list_insert_head(LinkedList *l, const char *key)
{
    ListNode *n = new_node(key);
    if (!n) return NULL;
    n->next = l->head;
    l->head = n;
    if (!l->tail) l->tail = n;
    l->size++;
    return n;
}

ListNode *list_insert_tail(LinkedList *l, const char *key)
{
    ListNode *n = new_node(key);
    if (!n) return NULL;
    if (l->tail) l->tail->next = n;
    else l->head = n;
    l->tail = n;
    l->size++;
    return n;
}

ListNode *list_find(const LinkedList *l, const char *key)
{
    for (ListNode *cur = l->head; cur; cur = cur->next)
        if (strcmp(cur->key, key) == 0) return cur;
    return NULL;
}

int list_index_of(const LinkedList *l, const char *key)
{
    int i = 0;
    for (ListNode *cur = l->head; cur; cur = cur->next, i++)
        if (strcmp(cur->key, key) == 0) return i;
    return -1;
}

ListNode *list_insert_after(LinkedList *l, const char *after_key, const char *key)
{
    ListNode *prev = list_find(l, after_key);
    if (!prev) return NULL;
    ListNode *n = new_node(key);
    if (!n) return NULL;
    n->next = prev->next;       /* splice: prev -> n -> old next */
    prev->next = n;
    if (l->tail == prev) l->tail = n;
    l->size++;
    return n;
}

int list_remove(LinkedList *l, const char *key)
{
    ListNode *prev = NULL;
    for (ListNode *cur = l->head; cur; prev = cur, cur = cur->next) {
        if (strcmp(cur->key, key) != 0) continue;
        if (prev) prev->next = cur->next;
        else l->head = cur->next;
        if (l->tail == cur) l->tail = prev;
        free(cur);
        l->size--;
        return 1;
    }
    return 0;
}

void list_clear(LinkedList *l)
{
    ListNode *cur = l->head;
    while (cur) {
        ListNode *next = cur->next;
        free(cur);
        cur = next;
    }
    list_init(l);
}

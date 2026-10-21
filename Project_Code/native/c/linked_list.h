/*
 * linked_list.h - singly linked list with head and tail pointers.
 *
 * Used by the game for:
 *   - the quest chain (quest_chain.c): Quest1 -> Quest2 -> ... -> QuestN
 *
 * insert_head / insert_tail are O(1); find / insert_after / remove are O(n).
 */
#ifndef LINKED_LIST_H
#define LINKED_LIST_H

#include "ds_common.h"

typedef struct ListNode {
    char key[DS_TEXT_MAX];
    int status;               /* free-form per-node state (quest status) */
    struct ListNode *next;
} ListNode;

typedef struct {
    ListNode *head;
    ListNode *tail;
    int size;
} LinkedList;

void      list_init(LinkedList *l);
ListNode *list_insert_head(LinkedList *l, const char *key);
ListNode *list_insert_tail(LinkedList *l, const char *key);
ListNode *list_insert_after(LinkedList *l, const char *after_key, const char *key); /* NULL if after_key missing */
int       list_remove(LinkedList *l, const char *key);  /* 1 removed, 0 not found */
ListNode *list_find(const LinkedList *l, const char *key);
int       list_index_of(const LinkedList *l, const char *key); /* -1 if missing */
void      list_clear(LinkedList *l);

#endif

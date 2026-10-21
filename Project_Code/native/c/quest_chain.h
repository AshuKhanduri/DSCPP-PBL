/*
 * quest_chain.h - quest progression built on the linked list.
 *
 *   [lost_path] -> [royal_route] -> [blacksmith] -> ... -> NULL
 *
 * Rules (enforced here, not in JavaScript):
 *   - the first quest added is AVAILABLE, the rest start LOCKED
 *   - only an AVAILABLE quest can be started (-> ACTIVE)
 *   - only an ACTIVE quest can be completed (-> COMPLETED)
 *   - completing a quest follows node->next and unlocks it (-> AVAILABLE)
 *   - `current` always points at the node the player is working on
 */
#ifndef QUEST_CHAIN_H
#define QUEST_CHAIN_H

#include "linked_list.h"

typedef enum {
    QUEST_LOCKED = 0,
    QUEST_AVAILABLE = 1,
    QUEST_ACTIVE = 2,
    QUEST_COMPLETED = 3
} QuestStatus;

typedef enum {
    QC_OK = 0,
    QC_NOT_FOUND,
    QC_BAD_STATE,
    QC_DUPLICATE,
    QC_ALLOC
} QuestChainResult;

typedef struct {
    LinkedList list;
    ListNode *current;
} QuestChain;

void quest_chain_init(QuestChain *qc);
void quest_chain_clear(QuestChain *qc);
QuestChainResult quest_chain_add(QuestChain *qc, const char *quest_id);
QuestChainResult quest_chain_start(QuestChain *qc, const char *quest_id);
QuestChainResult quest_chain_complete(QuestChain *qc, const char *quest_id, const char **unlocked_out);
const char *quest_status_name(int status);
const char *quest_chain_result_name(QuestChainResult r);

#endif

#include "quest_chain.h"
#include <stddef.h>

void quest_chain_init(QuestChain *qc)
{
    list_init(&qc->list);
    qc->current = NULL;
}

void quest_chain_clear(QuestChain *qc)
{
    list_clear(&qc->list);
    qc->current = NULL;
}

QuestChainResult quest_chain_add(QuestChain *qc, const char *quest_id)
{
    if (list_find(&qc->list, quest_id)) return QC_DUPLICATE;
    ListNode *node = list_insert_tail(&qc->list, quest_id);
    if (!node) return QC_ALLOC;
    if (qc->list.size == 1) {
        node->status = QUEST_AVAILABLE;
        qc->current = node;
    } else {
        node->status = QUEST_LOCKED;
    }
    return QC_OK;
}

QuestChainResult quest_chain_start(QuestChain *qc, const char *quest_id)
{
    ListNode *node = list_find(&qc->list, quest_id);
    if (!node) return QC_NOT_FOUND;
    if (node->status == QUEST_ACTIVE) return QC_OK;        /* idempotent */
    if (node->status != QUEST_AVAILABLE) return QC_BAD_STATE;
    node->status = QUEST_ACTIVE;
    qc->current = node;
    return QC_OK;
}

QuestChainResult quest_chain_complete(QuestChain *qc, const char *quest_id, const char **unlocked_out)
{
    if (unlocked_out) *unlocked_out = NULL;
    ListNode *node = list_find(&qc->list, quest_id);
    if (!node) return QC_NOT_FOUND;
    if (node->status != QUEST_ACTIVE) return QC_BAD_STATE;
    node->status = QUEST_COMPLETED;

    /* Progression = follow the next pointer. */
    ListNode *next = node->next;
    if (next && next->status == QUEST_LOCKED) {
        next->status = QUEST_AVAILABLE;
        if (unlocked_out) *unlocked_out = next->key;
    }
    qc->current = next;   /* NULL once the final quest is done */
    return QC_OK;
}

const char *quest_status_name(int status)
{
    switch (status) {
        case QUEST_LOCKED: return "LOCKED";
        case QUEST_AVAILABLE: return "AVAILABLE";
        case QUEST_ACTIVE: return "ACTIVE";
        case QUEST_COMPLETED: return "COMPLETED";
        default: return "UNKNOWN";
    }
}

const char *quest_chain_result_name(QuestChainResult r)
{
    switch (r) {
        case QC_OK: return "OK";
        case QC_NOT_FOUND: return "QUEST_NOT_FOUND";
        case QC_BAD_STATE: return "INVALID_QUEST_STATE";
        case QC_DUPLICATE: return "DUPLICATE_QUEST";
        case QC_ALLOC: return "OUT_OF_MEMORY";
        default: return "UNKNOWN";
    }
}

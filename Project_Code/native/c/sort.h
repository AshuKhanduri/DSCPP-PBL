/*
 * sort.h - Bubble, Selection and Insertion Sort, executed ONE operation per
 * call so the game can explain each operation as it happens (the Blacksmith's
 * "Order of the Forge" quest).
 *
 * A SortRun owns a copy of the values plus a parallel ids[] array: ids move
 * together with their values, so the game can tell which item moved (and that
 * equal weights keep their order in Bubble and Insertion Sort).
 *
 *   sort_start()  copies the input            sort_step()  performs one operation
 *   sort_free()   releases the arrays
 *
 * Operations (SortOp) per algorithm:
 *   Bubble     COMPARE a[j],a[j+1] -> SWAP (only if a[j] > a[j+1]) -> ... -> PASS_END;
 *              a pass without swaps proves the array is sorted -> DONE
 *   Selection  PASS_START (min = first unsorted) -> COMPARE each later element
 *              with the current minimum -> SWAP or PLACE (min already first) -> ... -> DONE
 *   Insertion  TAKE_KEY a[i] -> COMPARE key with the element left of the gap
 *              -> SHIFT it right (only if larger) -> ... -> INSERT key into the gap -> ... -> DONE
 */
#ifndef SORT_H
#define SORT_H

#define SORT_MAX_ITEMS 64

typedef enum { SORT_BUBBLE, SORT_SELECTION, SORT_INSERTION } SortAlgo;

typedef enum {
    SOP_COMPARE, SOP_SWAP, SOP_PASS_END, SOP_PASS_START, SOP_PLACE,
    SOP_TAKE_KEY, SOP_SHIFT, SOP_INSERT, SOP_DONE
} SortOp;

/* What the last sort_step() did. Unused fields are -1. */
typedef struct {
    int op;
    int a, b;          /* indices involved (compare / swap / shift from a to b)       */
    int result;        /* COMPARE: bubble 1 = must swap; selection 1 = new minimum;
                          insertion 1 = element is larger than the key (must shift)   */
} SortStepInfo;

typedef struct {
    int algo;
    int n;
    int *a;            /* values                                                      */
    int *ids;          /* item identity travelling with each value                    */
    int done;
    int step;          /* operations performed so far                                 */
    int pass;          /* 1-based pass number (0 before the first pass)               */
    int comparisons, swaps, shifts;
    /* algorithm state */
    int i, j;          /* bubble: j = left of the pair, i = passes finished
                          selection: i = first unsorted, j = element being scanned
                          insertion: i = index of the current key                     */
    int min;           /* selection: index of the current minimum                     */
    int key, key_id, hole, has_key;   /* insertion: lifted key and the gap it left    */
    int swapped;       /* bubble: a swap happened in this pass                         */
    int pending;       /* the next call must perform the action decided by a COMPARE   */
    int sorted_lo, sorted_hi;         /* [lo, hi) = sorted portion                     */
    SortStepInfo last;
} SortRun;

const char *sort_algo_name(int algo);
const char *sort_op_name(int op);
int  sort_parse_algo(const char *name);                 /* -1 if unknown       */

/* 1 ok, 0 = out of memory or n out of range. Frees any previous arrays. */
int  sort_start(SortRun *r, int algo, const int *values, int n);
/* Perform exactly one operation; after DONE every call reports DONE again. */
void sort_step(SortRun *r);
void sort_free(SortRun *r);

#endif

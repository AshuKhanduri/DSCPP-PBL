#include "sort.h"
#include <stdlib.h>
#include <string.h>

static const char *ALGO_NAMES[] = { "BUBBLE", "SELECTION", "INSERTION" };
static const char *OP_NAMES[] = {
    "COMPARE", "SWAP", "PASS_END", "PASS_START", "PLACE", "TAKE_KEY", "SHIFT", "INSERT", "DONE",
};

const char *sort_algo_name(int algo) { return algo >= 0 && algo <= SORT_INSERTION ? ALGO_NAMES[algo] : "UNKNOWN"; }
const char *sort_op_name(int op) { return op >= 0 && op <= SOP_DONE ? OP_NAMES[op] : "UNKNOWN"; }

int sort_parse_algo(const char *name)
{
    for (int i = 0; i <= SORT_INSERTION; i++)
        if (strcmp(name, ALGO_NAMES[i]) == 0) return i;
    return -1;
}

void sort_free(SortRun *r)
{
    free(r->a);
    free(r->ids);
    memset(r, 0, sizeof(*r));
}

int sort_start(SortRun *r, int algo, const int *values, int n)
{
    sort_free(r);
    if (n < 0 || n > SORT_MAX_ITEMS || algo < 0 || algo > SORT_INSERTION) return 0;
    size_t bytes = sizeof(int) * (size_t)(n > 0 ? n : 1);
    r->a = (int *)malloc(bytes);
    r->ids = (int *)malloc(bytes);
    if (!r->a || !r->ids) { sort_free(r); return 0; }
    for (int k = 0; k < n; k++) { r->a[k] = values[k]; r->ids[k] = k; }
    r->algo = algo;
    r->n = n;
    r->min = r->key = r->key_id = r->hole = -1;
    r->last.op = -1;
    r->last.a = r->last.b = r->last.result = -1;
    /* sorted portion before any work: bubble grows from the right, the others from the left */
    if (algo == SORT_BUBBLE) { r->sorted_lo = n; r->sorted_hi = n; }
    else if (algo == SORT_INSERTION) { r->sorted_lo = 0; r->sorted_hi = n > 0 ? 1 : 0; r->i = 1; }
    else { r->sorted_lo = 0; r->sorted_hi = 0; }
    return 1;
}

static void record(SortRun *r, int op, int a, int b, int result)
{
    r->last.op = op;
    r->last.a = a;
    r->last.b = b;
    r->last.result = result;
    r->step++;
}

static void finish(SortRun *r)
{
    r->done = 1;
    r->sorted_lo = 0;
    r->sorted_hi = r->n;
    r->min = -1;
    record(r, SOP_DONE, -1, -1, -1);
}

static void swap_items(SortRun *r, int x, int y)
{
    int t = r->a[x]; r->a[x] = r->a[y]; r->a[y] = t;
    t = r->ids[x]; r->ids[x] = r->ids[y]; r->ids[y] = t;
}

/* Bubble: compare neighbours left to right; a larger left value is swapped
 * right, so the largest unsorted value "bubbles" to the end of each pass. */
static void bubble_step(SortRun *r)
{
    int end = r->n - 1 - r->i;               /* last index of the unsorted part */
    if (r->n < 2 || r->pending == 2) { finish(r); return; }
    if (r->pending == 1) {                   /* the COMPARE decided to swap */
        swap_items(r, r->j, r->j + 1);
        r->swaps++;
        r->swapped = 1;
        r->pending = 0;
        record(r, SOP_SWAP, r->j, r->j + 1, 1);
        r->j++;
    } else if (r->j < end) {
        if (r->j == 0) r->pass = r->i + 1;   /* a pass begins with its first comparison */
        r->comparisons++;
        int must = r->a[r->j] > r->a[r->j + 1];   /* equal values never swap: stable */
        record(r, SOP_COMPARE, r->j, r->j + 1, must);
        if (must) r->pending = 1; else r->j++;
    } else {                                 /* end of the pass: a[end] is in its final place */
        r->sorted_lo = end;
        r->i++;
        record(r, SOP_PASS_END, end, -1, r->swapped);
        if (!r->swapped || r->n - 1 - r->i <= 0) r->pending = 2;   /* no swaps = sorted */
        else { r->j = 0; r->swapped = 0; }
    }
}

/* Selection: scan the unsorted part for its minimum, then swap that minimum
 * to the front of the unsorted part. */
static void selection_step(SortRun *r)
{
    if (r->i >= r->n - 1) { finish(r); return; }
    if (r->pending == 0) {
        r->pass++;
        r->min = r->i;                       /* first unsorted element is the minimum so far */
        r->j = r->i + 1;
        r->pending = 1;
        record(r, SOP_PASS_START, r->i, -1, -1);
    } else if (r->j < r->n) {
        r->comparisons++;
        int was = r->min;
        int smaller = r->a[r->j] < r->a[r->min];  /* strictly smaller: first of equal values stays minimum */
        if (smaller) r->min = r->j;
        record(r, SOP_COMPARE, r->j, was, smaller);
        r->j++;
    } else {
        if (r->min != r->i) {
            swap_items(r, r->i, r->min);
            r->swaps++;
            record(r, SOP_SWAP, r->i, r->min, 1);
        } else {
            record(r, SOP_PLACE, r->i, r->i, 0);
        }
        r->i++;
        r->sorted_hi = r->i;
        r->min = -1;
        r->pending = 0;
    }
}

/* Insertion: lift a[i] out as the key, shift larger sorted elements one place
 * right, and drop the key into the gap that is left. */
static void insertion_step(SortRun *r)
{
    if (!r->has_key) {
        if (r->i >= r->n) { finish(r); return; }
        r->key = r->a[r->i];
        r->key_id = r->ids[r->i];
        r->hole = r->i;
        r->has_key = 1;
        r->pass++;
        record(r, SOP_TAKE_KEY, r->i, -1, -1);
    } else if (r->pending == 1) {            /* the COMPARE found a larger element: shift it */
        r->a[r->hole] = r->a[r->hole - 1];
        r->ids[r->hole] = r->ids[r->hole - 1];
        r->shifts++;
        r->pending = 0;
        record(r, SOP_SHIFT, r->hole - 1, r->hole, 1);
        r->hole--;
    } else if (r->pending == 2 || r->hole == 0) {
        record(r, SOP_INSERT, r->hole, r->i, r->hole == 0);
        r->a[r->hole] = r->key;
        r->ids[r->hole] = r->key_id;
        r->has_key = 0;
        r->pending = 0;
        r->i++;
        r->sorted_hi = r->i;
        r->key = r->key_id = r->hole = -1;
    } else {
        r->comparisons++;
        int larger = r->a[r->hole - 1] > r->key;  /* equal values stay left of the key: stable */
        record(r, SOP_COMPARE, r->hole - 1, r->hole, larger);
        r->pending = larger ? 1 : 2;
    }
}

void sort_step(SortRun *r)
{
    if (r->done) { record(r, SOP_DONE, -1, -1, -1); r->step--; return; }
    if (r->algo == SORT_BUBBLE) bubble_step(r);
    else if (r->algo == SORT_SELECTION) selection_step(r);
    else insertion_step(r);
}

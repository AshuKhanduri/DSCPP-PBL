#include "avl.h"
#include <limits.h>
#include <stdlib.h>

static const char *CASE_NAMES[] = { "NONE", "LL", "RR", "LR", "RL" };

const char *avl_case_name(int rcase) { return rcase >= 0 && rcase <= AVL_CASE_RL ? CASE_NAMES[rcase] : "NONE"; }

void avl_init(Avl *t)
{
    t->root = NULL;
    t->size = 0;
}

static void free_subtree(AvlNode *n)
{
    if (!n) return;
    free_subtree(n->left);
    free_subtree(n->right);
    free(n);
}

void avl_clear(Avl *t)
{
    free_subtree(t->root);
    avl_init(t);
}

int avl_height(const AvlNode *n) { return n ? n->height : 0; }

int avl_balance(const AvlNode *n) { return n ? avl_height(n->left) - avl_height(n->right) : 0; }

static void update_height(AvlNode *n)
{
    int l = avl_height(n->left), r = avl_height(n->right);
    n->height = 1 + (l > r ? l : r);
}

/* Right rotation around y: its left child x moves up, y becomes x's right
 * child, and x's old right subtree (keys between x and y) moves to y->left.
 *        y              x
 *       / \            / \
 *      x   C   ==>    A   y
 *     / \                / \
 *    A   B              B   C        */
static AvlNode *rotate_right(AvlNode *y, int *moved)
{
    AvlNode *x = y->left;
    AvlNode *b = x->right;
    *moved = b ? b->key : -1;
    x->right = y;
    y->left = b;
    update_height(y);   /* y is now below x: update it first */
    update_height(x);
    return x;
}

/* Left rotation around x: the mirror image. */
static AvlNode *rotate_left(AvlNode *x, int *moved)
{
    AvlNode *y = x->right;
    AvlNode *b = y->left;
    *moved = b ? b->key : -1;
    y->left = x;
    x->right = b;
    update_height(x);
    update_height(y);
    return y;
}

/* Structural height, computed from the links (used for snapshots, where some
 * stored heights above the rebalanced node may not be updated yet). */
static int live_height(const AvlNode *n)
{
    if (!n) return 0;
    int l = live_height(n->left), r = live_height(n->right);
    return 1 + (l > r ? l : r);
}

static void snap_node(const AvlNode *n, AvlSnapshot *s)
{
    if (!n || s->count >= AVL_MAX_NODES) return;
    AvlSnapNode *o = &s->nodes[s->count++];
    o->key = n->key;
    o->left = n->left ? n->left->key : -1;
    o->right = n->right ? n->right->key : -1;
    o->height = live_height(n);
    o->bf = live_height(n->left) - live_height(n->right);
    snap_node(n->left, s);
    snap_node(n->right, s);
}

void avl_snapshot(const Avl *t, AvlSnapshot *out)
{
    out->count = 0;
    out->root = t->root ? t->root->key : -1;
    snap_node(t->root, out);
}

static AvlEvent *event(const Avl *t, AvlTrace *tr, int type)
{
    if (!tr || tr->event_count >= AVL_MAX_EVENTS) return NULL;
    AvlEvent *e = &tr->events[tr->event_count++];
    e->type = type;
    e->a = e->b = e->c = -1;
    e->bf = 0;
    e->rcase = AVL_CASE_NONE;
    e->dir = 0;
    (void)t;
    return e;
}

static void record_rotation(const Avl *t, AvlTrace *tr, char dir, int pivot, AvlNode *top, int moved)
{
    AvlEvent *e = event(t, tr, AVL_EV_ROTATE);
    if (!e) return;
    e->dir = dir;
    e->a = pivot;
    e->b = top->key;
    e->c = moved;
    avl_snapshot(t, &e->snap);
}

AvlResult avl_insert(Avl *t, int key, AvlTrace *tr)
{
    AvlNode **links[AVL_MAX_DEPTH];   /* the child pointers followed from the root */
    int depth = 0;
    AvlNode **link = &t->root;
    if (tr) { tr->path_len = 0; tr->event_count = 0; }

    while (*link) {
        AvlNode *n = *link;
        int cmp = key < n->key ? -1 : key > n->key ? 1 : 0;
        if (tr && tr->path_len < AVL_MAX_DEPTH) { tr->keys[tr->path_len] = n->key; tr->cmps[tr->path_len] = cmp; tr->path_len++; }
        if (cmp == 0) return AVL_DUPLICATE;
        if (depth >= AVL_MAX_DEPTH) return AVL_FULL;
        links[depth++] = link;
        link = cmp < 0 ? &n->left : &n->right;
    }
    if (t->size >= AVL_MAX_NODES) return AVL_FULL;
    AvlNode *n = (AvlNode *)malloc(sizeof(AvlNode));
    if (!n) return AVL_NO_MEMORY;
    n->key = key;
    n->height = 1;
    n->left = n->right = NULL;
    *link = n;
    t->size++;

    AvlEvent *placed = event(t, tr, AVL_EV_PLACED);
    if (placed) {
        placed->a = key;
        placed->b = depth ? (*links[depth - 1])->key : -1;
        placed->c = depth ? (key > (*links[depth - 1])->key) : -1;
        avl_snapshot(t, &placed->snap);
    }

    /* Walk back up: update heights, rebalance the first node that breaks the rule. */
    for (int i = depth - 1; i >= 0; i--) {
        AvlNode *z = *links[i];
        update_height(z);
        int bf = avl_balance(z);
        if (bf >= -1 && bf <= 1) continue;

        AvlNode *y = bf > 1 ? z->left : z->right;          /* child on the heavy side */
        int rcase = bf > 1 ? (key < y->key ? AVL_CASE_LL : AVL_CASE_LR)
                           : (key > y->key ? AVL_CASE_RR : AVL_CASE_RL);
        AvlNode *x = (rcase == AVL_CASE_LL || rcase == AVL_CASE_RL) ? y->left : y->right;
        AvlEvent *u = event(t, tr, AVL_EV_UNBALANCED);
        if (u) {
            u->a = z->key; u->b = y->key; u->c = x ? x->key : -1; u->bf = bf; u->rcase = rcase;
            avl_snapshot(t, &u->snap);
        }
        int moved;
        if (rcase == AVL_CASE_LR) {        /* first make it an LL case */
            z->left = rotate_left(y, &moved);
            record_rotation(t, tr, 'L', y->key, z->left, moved);
        } else if (rcase == AVL_CASE_RL) { /* first make it an RR case */
            z->right = rotate_right(y, &moved);
            record_rotation(t, tr, 'R', y->key, z->right, moved);
        }
        if (rcase == AVL_CASE_LL || rcase == AVL_CASE_LR) {
            *links[i] = rotate_right(z, &moved);
            record_rotation(t, tr, 'R', z->key, *links[i], moved);
        } else {
            *links[i] = rotate_left(z, &moved);
            record_rotation(t, tr, 'L', z->key, *links[i], moved);
        }
        /* keep walking: ancestors' heights still need updating (they end up unchanged) */
    }
    return AVL_OK;
}

static void inorder(const AvlNode *n, int *out, int max, int *count)
{
    if (!n) return;
    inorder(n->left, out, max, count);
    if (*count < max) out[(*count)++] = n->key;
    inorder(n->right, out, max, count);
}

int avl_inorder(const Avl *t, int *out, int max)
{
    int count = 0;
    inorder(t->root, out, max, &count);
    return count;
}

/* Checks order (every key strictly inside (lo, hi)), stored heights and |BF| <= 1. */
static int valid(const AvlNode *n, long long lo, long long hi, int *height)
{
    if (!n) { *height = 0; return 1; }
    if (n->key <= lo || n->key >= hi) return 0;
    int hl, hr;
    if (!valid(n->left, lo, n->key, &hl) || !valid(n->right, n->key, hi, &hr)) return 0;
    *height = 1 + (hl > hr ? hl : hr);
    return n->height == *height && hl - hr >= -1 && hl - hr <= 1;
}

int avl_is_valid(const Avl *t)
{
    int h;
    return valid(t->root, (long long)INT_MIN - 1, (long long)INT_MAX + 1, &h);
}

/*
 * avl.h - self-balancing AVL tree of integer keys (Garden of Balance).
 *
 * Same ordering rule as bst.c (smaller keys left, larger right), plus the
 * AVL rule: at every node   BF = height(left) - height(right)   is -1, 0 or +1.
 * Height: an empty subtree has height 0, a leaf has height 1 (as bst_height).
 *
 * avl_insert() places the key like a BST insert, then walks back up the path
 * updating heights. The first (lowest) node whose BF becomes +2 or -2 is
 * rebalanced by its case:
 *     LL  BF +2, key went into the left child's LEFT subtree   -> rotate right
 *     RR  BF -2, key went into the right child's RIGHT subtree -> rotate left
 *     LR  BF +2, key went into the left child's RIGHT subtree  -> rotate left on the child, then right
 *     RL  BF -2, key went into the right child's LEFT subtree  -> rotate right on the child, then left
 * Every step (placement, imbalance, each rotation) is recorded with a snapshot
 * of the whole tree, so the game can animate exactly what C did.
 *
 * Duplicates are not stored (reported as not inserted). Deletion is not provided.
 */
#ifndef AVL_H
#define AVL_H

#define AVL_MAX_NODES 63
#define AVL_MAX_DEPTH 64
#define AVL_MAX_EVENTS 4    /* placement + imbalance + at most two rotations */

typedef struct AvlNode {
    int key;
    int height;             /* 1 for a leaf */
    struct AvlNode *left, *right;
} AvlNode;

typedef struct {
    AvlNode *root;
    int size;
} Avl;

typedef struct {
    int key, left, right;   /* left / right = child keys, or -1 for none */
    int height, bf;
} AvlSnapNode;

typedef struct {
    int root;               /* -1 = empty */
    int count;
    AvlSnapNode nodes[AVL_MAX_NODES];   /* pre-order */
} AvlSnapshot;

typedef enum { AVL_EV_PLACED, AVL_EV_UNBALANCED, AVL_EV_ROTATE } AvlEventType;
typedef enum { AVL_CASE_NONE, AVL_CASE_LL, AVL_CASE_RR, AVL_CASE_LR, AVL_CASE_RL } AvlCase;

typedef struct {
    int type;
    /* PLACED:     a = key, b = parent key (-1 root), c = 1 if right child
     * UNBALANCED: a = unbalanced node, b = child on the heavy side, c = grandchild, bf, rcase
     * ROTATE:     a = pivot (node rotated down), b = new top of that subtree,
     *             c = key of the subtree that changed parent (-1 none), dir 'L' / 'R' */
    int a, b, c, bf, rcase;
    char dir;
    AvlSnapshot snap;       /* the whole tree right after this event */
} AvlEvent;

typedef struct {
    int keys[AVL_MAX_DEPTH], cmps[AVL_MAX_DEPTH];   /* comparisons on the way down (-1 left, +1 right, 0 equal) */
    int path_len;
    int event_count;
    AvlEvent events[AVL_MAX_EVENTS];
} AvlTrace;

typedef enum { AVL_OK, AVL_DUPLICATE, AVL_FULL, AVL_NO_MEMORY } AvlResult;

void      avl_init(Avl *t);
void      avl_clear(Avl *t);                                  /* frees every node */
AvlResult avl_insert(Avl *t, int key, AvlTrace *trace);       /* trace may be NULL */
int       avl_height(const AvlNode *n);                       /* empty = 0 */
int       avl_balance(const AvlNode *n);                      /* height(left) - height(right) */
int       avl_inorder(const Avl *t, int *out, int max);
int       avl_is_valid(const Avl *t);                         /* BST order + every |BF| <= 1 + heights right */
void      avl_snapshot(const Avl *t, AvlSnapshot *out);
const char *avl_case_name(int rcase);

#endif

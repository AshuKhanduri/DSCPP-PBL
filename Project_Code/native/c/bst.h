/*
 * bst.h - Binary Search Tree of integer keys (the Royal Registry).
 *
 * Ordering rule: every key in a node's LEFT subtree is smaller than the
 * node's key, every key in its RIGHT subtree is larger. Duplicates are not
 * stored (inserting an existing key reports it and changes nothing).
 *
 * Insert and search return the comparisons they made, so the game can show
 * each "compare, then go left / right" step the C code actually took.
 * Nodes are heap-allocated; bst_clear() frees every one of them.
 */
#ifndef BST_H
#define BST_H

#define BST_MAX_NODES 63   /* keeps the tree drawable and the path arrays small */

typedef struct BstNode {
    int key;
    struct BstNode *left, *right;
} BstNode;

typedef struct {
    BstNode *root;
    int size;
} Bst;

/* One comparison: the key of the node visited and how the searched key compared to it. */
typedef enum { BST_LESS = -1, BST_EQUAL = 0, BST_GREATER = 1 } BstCmp;

typedef struct {
    int keys[BST_MAX_NODES + 1];
    int cmps[BST_MAX_NODES + 1];
    int len;
} BstPath;

typedef enum { BST_OK, BST_DUPLICATE, BST_FULL, BST_NO_MEMORY } BstResult;

void      bst_init(Bst *t);
void      bst_clear(Bst *t);                                  /* frees all nodes */
BstResult bst_insert(Bst *t, int key, BstPath *path);
int       bst_search(const Bst *t, int key, BstPath *path);   /* 1 found, 0 not  */
int       bst_inorder(const Bst *t, int *out, int max);       /* returns count   */
int       bst_height(const Bst *t);                           /* empty tree = 0  */
const char *bst_cmp_name(int cmp);

#endif

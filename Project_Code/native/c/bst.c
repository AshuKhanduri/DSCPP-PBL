#include "bst.h"
#include <stdlib.h>

void bst_init(Bst *t)
{
    t->root = NULL;
    t->size = 0;
}

static void free_subtree(BstNode *n)
{
    if (!n) return;
    free_subtree(n->left);
    free_subtree(n->right);
    free(n);
}

void bst_clear(Bst *t)
{
    free_subtree(t->root);
    bst_init(t);
}

static void record(BstPath *path, int key, int cmp)
{
    if (!path || path->len > BST_MAX_NODES) return;
    path->keys[path->len] = key;
    path->cmps[path->len] = cmp;
    path->len++;
}

/* Walk down from the root: smaller keys go left, larger keys go right, until
 * the key is found or the child we need is empty. Returns the link (pointer to
 * the child pointer) where the walk stopped, so insert can write into it. */
static BstNode **descend(BstNode **link, int key, BstPath *path)
{
    if (path) path->len = 0;
    while (*link) {
        BstNode *n = *link;
        if (key < n->key) { record(path, n->key, BST_LESS); link = &n->left; }
        else if (key > n->key) { record(path, n->key, BST_GREATER); link = &n->right; }
        else { record(path, n->key, BST_EQUAL); break; }
    }
    return link;
}

BstResult bst_insert(Bst *t, int key, BstPath *path)
{
    BstNode **link = descend(&t->root, key, path);
    if (*link) return BST_DUPLICATE;
    if (t->size >= BST_MAX_NODES) return BST_FULL;
    BstNode *n = (BstNode *)malloc(sizeof(BstNode));
    if (!n) return BST_NO_MEMORY;
    n->key = key;
    n->left = n->right = NULL;
    *link = n;            /* the empty child slot now holds the new node */
    t->size++;
    return BST_OK;
}

int bst_search(const Bst *t, int key, BstPath *path)
{
    BstNode *root = t->root;
    return *descend(&root, key, path) != NULL;
}

static void inorder(const BstNode *n, int *out, int max, int *count)
{
    if (!n) return;
    inorder(n->left, out, max, count);        /* everything smaller first */
    if (*count < max) out[(*count)++] = n->key;
    inorder(n->right, out, max, count);       /* then everything larger   */
}

int bst_inorder(const Bst *t, int *out, int max)
{
    int count = 0;
    inorder(t->root, out, max, &count);
    return count;
}

static int height(const BstNode *n)
{
    if (!n) return 0;
    int l = height(n->left), r = height(n->right);
    return 1 + (l > r ? l : r);
}

int bst_height(const Bst *t)
{
    return height(t->root);
}

const char *bst_cmp_name(int cmp)
{
    return cmp < 0 ? "LESS" : cmp > 0 ? "GREATER" : "EQUAL";
}

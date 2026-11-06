// Royal Registry lessons: Walkthrough steps built from the responses of the
// C binary search tree (native/c/bst.c). Each insert / search response lists
// the comparisons C made ({ key, cmp: LESS | GREATER | EQUAL }) and the tree
// after the operation; a step never invents a comparison or a tree shape.
//
// Step state (drawn by rendering/TreeView.js):
//   tree      C snapshot { root, size, nodes: [{ key, left, right }] }
//   pile      records still waiting to be inserted
//   focus     node being compared       cmp   { value, key, rel } shown next to it
//   token     the record travelling down: { value, at: key } or { value, slot: { parent, side } }
//   path      keys compared so far      newKey / found / missing   result highlights
//   schematic 'node' | 'rule' (intro drawings, no data)

const EMPTY = { root: null, size: 0, height: 0, nodes: [] };
const DIR = { LESS: 'LEFT', GREATER: 'RIGHT' };

export function childOf(tree, key, side) {
    const n = tree.nodes.find(x => x.key === key);
    return n ? (side === 'LEFT' ? n.left : n.right) : null;
}

const word = cmp => (cmp === 'LESS' ? 'smaller' : 'larger');
const sign = cmp => (cmp === 'LESS' ? '<' : cmp === 'GREATER' ? '>' : '=');

// "Which way?" prediction for value at node key.
export function directionQuestion(value, key, cmp, state) {
    const right = DIR[cmp];
    const wrongWhy = `${value} is ${word(cmp)} than ${key}, so it must go into ${key}'s ${right} subtree. Going ${right === 'LEFT' ? 'right' : 'left'} would put a ${word(cmp)} record on the ${cmp === 'LESS' ? 'larger' : 'smaller'} side of ${key} and break the BST rule.`;
    return {
        prompt: `Record ${value} meets ${key}. Which way does it go?`,
        choices: [
            { label: '← Left', correct: right === 'LEFT', why: right === 'LEFT' ? `Yes: ${value} < ${key}, so left.` : wrongWhy },
            { label: 'Right →', correct: right === 'RIGHT', why: right === 'RIGHT' ? `Yes: ${value} > ${key}, so right.` : wrongWhy },
        ],
        state,
    };
}

export function buildIntroSteps(records) {
    const base = { tree: EMPTY, pile: [...records] };
    return [
        {
            kind: 'intro', title: 'A pile of records',
            text: `The clerks keep the records in the order they arrived: ${records.join(', ')}.\n\nTo find one record they read from the top until they hit it. For record ${records.at(-1)} that means reading all ${records.length}. With thousands of records, that is slow.`,
            op: null, state: { ...base },
        },
        {
            kind: 'intro', title: 'A node and its two children',
            text: 'A Binary Search Tree stores each record in a NODE.\n\nEvery node has room for two children: a LEFT child and a RIGHT child. Either slot may be empty. The first node, at the top, is called the ROOT.',
            op: 'typedef struct BstNode { int key; BstNode *left, *right; }', state: { ...base, schematic: 'node' },
        },
        {
            kind: 'intro', title: 'The ordering rule',
            text: 'At EVERY node:\n• records SMALLER than the node go in its LEFT subtree\n• records LARGER than the node go in its RIGHT subtree\n\nThis one rule decides where each record is stored - and so, where to look for it.',
            op: null, state: { ...base, schematic: 'rule' },
            question: {
                prompt: 'Suppose the root holds 50. Where must record 30 be stored?',
                choices: [
                    { label: 'In the right subtree of 50', correct: false, why: '30 is smaller than 50. Smaller records always go LEFT.' },
                    { label: 'Anywhere - it does not matter', correct: false, why: 'The rule fixes the side: smaller than 50 means the LEFT subtree. That is what makes searching fast.' },
                    { label: 'In the left subtree of 50', correct: true, why: 'Right: 30 < 50, so left.' },
                ],
                state: { ...base, schematic: 'rule' },
            },
        },
        {
            kind: 'intro', title: 'Let us build it',
            text: `We insert the records one at a time, in arrival order. The C engine does every insertion (native/c/bst.c); you will see each comparison it makes and why it turns left or right.`,
            op: null, state: { ...base },
        },
    ].map(s => ({ skippable: false, ...s }));
}

// inserts: [{ key, res }] in order, res = C response to BST_INSERT
export function buildInsertSteps(inserts) {
    const steps = [];
    const seen = {};
    const add = (kind, full, step) => {
        seen[kind] = (seen[kind] ?? 0) + 1;
        steps.push({ kind, skippable: seen[kind] > full, ...step });
    };
    const askAt = new Set(['20@50', '40@30', '60@70']);
    let before = EMPTY;
    inserts.forEach(({ key: v, res }, idx) => {
        const pile = inserts.slice(idx + 1).map(i => i.key);
        const waiting = [v, ...pile];
        if (!res.path.length) {
            add('root', Infinity, {
                title: `Insert ${v}: the first record`,
                text: `The tree is empty, so ${v} becomes the ROOT. Every later record will start its journey here.`,
                op: `bst_insert(${v}): root == NULL → root = new node`,
                brief: `${v} became the root`,
                state: { tree: res.tree, pile, newKey: v, path: [] },
            });
            before = res.tree;
            return;
        }
        const root = before.root;
        add('take', 2, {
            title: `Insert ${v}`, boundary: true,
            text: `Record ${v} arrives. Every insertion starts at the root (${root}) and follows the ordering rule down the tree until it reaches an EMPTY slot.`,
            op: `bst_insert(${v}): start at root ${root}`,
            brief: null,
            state: { tree: before, pile: waiting.slice(1), focus: root, token: { value: v, at: root }, path: [] },
        });
        const path = [];
        res.path.forEach(({ key: k, cmp }, i) => {
            path.push(k);
            const side = DIR[cmp];
            const child = childOf(before, k, side);
            const token = child != null ? { value: v, at: child } : { value: v, slot: { parent: k, side } };
            const state = { tree: before, pile: waiting.slice(1), focus: k, cmp: { value: v, key: k, rel: sign(cmp) }, token, path: [...path] };
            const step = {
                title: `${v} ${sign(cmp)} ${k} → go ${side.toLowerCase()}`,
                text: `Compare ${v} with ${k}: ${v} is ${word(cmp)}, so ${v} belongs in ${k}'s ${side} subtree.\n\n${child != null
                    ? `${k} already has a ${side.toLowerCase()} child (${child}), so we move down to it and compare again.`
                    : `${k}'s ${side.toLowerCase()} slot is EMPTY - that is where ${v} will go.`}`,
                op: `${v} ${sign(cmp)} ${k} → link = &node->${side === 'LEFT' ? 'left' : 'right'}`,
                brief: `${v} ${sign(cmp)} ${k} → ${side.toLowerCase()}`,
                state,
            };
            if (askAt.has(`${v}@${k}`)) step.question = directionQuestion(v, k, cmp, { ...state, cmp: null, token: { value: v, at: k } });
            add('compare', 3, step);
            if (i === res.path.length - 1) {
                add('place', 2, {
                    title: `Place ${v}`,
                    text: `${v} becomes the ${side} child of ${k}. It took ${res.comparisons} comparison${res.comparisons > 1 ? 's' : ''}.\n\nCheck the rule still holds: every record left of a node is smaller, every record right of it is larger.`,
                    op: `*link = new BstNode(${v});  size = ${res.tree.size}`,
                    brief: `${v} placed as ${side.toLowerCase()} child of ${k}`,
                    state: { tree: res.tree, pile: waiting.slice(1), newKey: v, path: [...path] },
                });
            }
        });
        before = res.tree;
    });
    return steps;
}

// searches: [{ key, res }] , res = C response to BST_SEARCH
export function buildSearchSteps(searches) {
    const steps = [];
    for (const { key: v, res } of searches) {
        const tree = res.tree;
        steps.push({
            kind: 'search', skippable: false, boundary: true,
            title: `Find record ${v}`,
            text: `Start at the root (${tree.root}). At each node:\n• equal → found\n• smaller → go left\n• larger → go right\nThe search never needs to come back up.`,
            op: `bst_search(${v}): node = root`,
            state: { tree, focus: tree.root, token: { value: v, at: tree.root }, path: [] },
        });
        const path = [];
        res.path.forEach(({ key: k, cmp }, i) => {
            path.push(k);
            if (cmp === 'EQUAL') {
                steps.push({
                    kind: 'found', skippable: false,
                    title: `Found ${v}!`,
                    text: `${v} equals ${k}: record found after ${res.comparisons} comparison${res.comparisons > 1 ? 's' : ''}.\n\nThe pile could have needed up to ${tree.size} reads. Each comparison here threw away a whole subtree we never had to look at.`,
                    op: `${v} == ${k} → return found`,
                    state: { tree, focus: k, cmp: { value: v, key: k, rel: '=' }, found: k, path: [...path] },
                });
                return;
            }
            const side = DIR[cmp];
            const child = childOf(tree, k, side);
            const state = {
                tree, focus: k, cmp: { value: v, key: k, rel: sign(cmp) }, path: [...path],
                token: child != null ? { value: v, at: child } : { value: v, slot: { parent: k, side } },
            };
            const step = {
                kind: 'search-compare', skippable: false,
                title: `${v} ${sign(cmp)} ${k} → go ${side.toLowerCase()}`,
                text: `${v} is ${word(cmp)} than ${k}. By the ordering rule, if ${v} is in the registry it must be in ${k}'s ${side} subtree - everything on the other side can be ignored.${child != null ? ` Move to ${child}.` : ''}`,
                op: `${v} ${sign(cmp)} ${k} → node = node->${side === 'LEFT' ? 'left' : 'right'}`,
                state,
            };
            if (`${v}@${k}` === '60@70' || `${v}@${k}` === '65@60') step.question = directionQuestion(v, k, cmp, { ...state, cmp: null, token: { value: v, at: k } });
            steps.push(step);
            if (i === res.path.length - 1 && !res.found) {
                const reasons = res.path.map(p => `${v} ${sign(p.cmp)} ${p.key}: not in ${p.key}'s ${DIR[p.cmp] === 'LEFT' ? 'right' : 'left'} subtree`);
                steps.push({
                    kind: 'missing', skippable: false,
                    title: `${v} is not in the registry`,
                    text: `${k}'s ${side.toLowerCase()} slot is EMPTY. If ${v} were stored anywhere, the ordering rule says it would have to be exactly here. So ${v} is NOT in the registry - and we checked only ${res.comparisons} records to be sure.`,
                    op: `node == NULL → return not found`,
                    state: { tree, path: [...path], missing: { parent: k, side }, token: { value: v, slot: { parent: k, side } } },
                    question: {
                        prompt: `The search reached an empty slot under ${k}. Is ${v} somewhere in the registry?`,
                        choices: [
                            { label: 'Maybe - check the other branches', correct: false, why: `No need. Each comparison ruled out a whole side:\n${reasons.join('\n')}.\nThe empty slot was the only place left.` },
                            { label: 'No - it would have to be here', correct: true, why: 'Exactly: an empty slot at the end of the search means the record does not exist.' },
                        ],
                        state: { tree, path: [...path], focus: k, token: { value: v, slot: { parent: k, side } } },
                    },
                });
            }
        });
    }
    return steps;
}

export function summarizeBst(run) {
    return {
        title: `Skipped ahead: ${run.length} steps`,
        text: `The same rule, applied again:\n${run.filter(s => s.brief).map(s => `• ${s.brief}`).join('\n')}`,
        op: `${run.filter(s => s.kind === 'compare').length} comparisons, ${run.filter(s => s.kind === 'place').length} insertions`,
    };
}

// Garden of Balance lessons: AVL trees.
//
// Each stage is a SCRIPT of operations (the inputs). A source sends them to
// the C engine one at a time - stage 1 to the BST (native/c/bst.c), the rest
// to the AVL tree (native/c/avl.c) - and expands every AVL insertion into the
// steps C recorded: the node PLACED, the node found UNBALANCED, each ROTATE,
// each with a snapshot of the whole tree. Text and questions are written from
// those responses; nothing here balances a tree.
//
// script item: { op: BST | SEARCH | AVL | CLEAR | INSPECT, key?, title?, ask?, fold? }
//   ask (AVL) = { PLACED?, UNBALANCED?, ROTATE?, SETTLED? } question names per step

export const CASES = [
    { name: 'LL', keys: [30, 20, 10], title: 'Case A - Left-Left' },
    { name: 'RR', keys: [10, 20, 30], title: 'Case B - Right-Right' },
    { name: 'LR', keys: [30, 10, 20], title: 'Case C - Left-Right' },
    { name: 'RL', keys: [10, 30, 20], title: 'Case D - Right-Left' },
];

export const FINAL_KEYS = [50, 30, 70, 20, 10, 80, 90, 60, 65, 95, 92];

export const STAGES = [
    {
        id: 'crooked', title: 'The Crooked Tree', short: 'Crooked',
        script: [
            ...[10, 20, 30, 40, 50].map((key, i) => ({ op: 'BST', key, fold: i >= 2 && i < 4 })),
            { op: 'SEARCH', key: 50, ask: 'searchCount' },
        ],
    },
    {
        id: 'rule', title: 'The Rule of Balance', short: 'Rule',
        script: [
            { op: 'AVL', key: 30 }, { op: 'AVL', key: 20 }, { op: 'AVL', key: 40 }, { op: 'AVL', key: 10 },
            { op: 'INSPECT', node: 30, ask: 'inspectBf' },
            { op: 'INSPECT', node: 20, ask: 'inspectBf' },
            { op: 'INSPECT', ask: 'valid' },
        ],
    },
    {
        id: 'rotations', title: 'Four Rotations', short: 'Rotations',
        script: CASES.flatMap(c => [
            { op: 'CLEAR', title: c.title, caseName: c.name },
            { op: 'AVL', key: c.keys[0] }, { op: 'AVL', key: c.keys[1] },
            { op: 'AVL', key: c.keys[2], ask: { UNBALANCED: 'whichNode', ROTATE: 'whichCase' } },
        ]),
    },
    {
        id: 'training', title: "The Keeper's Training", short: 'Training',
        script: [
            { op: 'AVL', key: 40 }, { op: 'AVL', key: 20 },
            { op: 'AVL', key: 60, ask: { PLACED: 'willUnbalance' } },
            { op: 'AVL', key: 10, ask: { PLACED: 'bf' }, node: 40 },
            { op: 'AVL', key: 30, ask: { PLACED: 'willUnbalance' } },
            { op: 'AVL', key: 5, ask: { PLACED: 'willUnbalance', UNBALANCED: 'whichNode', ROTATE: 'whichCase', SETTLED: 'newRoot' } },
        ],
    },
    {
        id: 'final', title: 'The Final Restoration', short: 'Final', graded: true,
        script: FINAL_KEYS.map(key => ({ op: 'AVL', key, ask: { PLACED: 'willUnbalance', UNBALANCED: 'whichNode', ROTATE: 'whichCase' } })),
        endAsk: 'finalTop',
    },
];

// ------------------------------------------------------------------ source

export function makeAvlSource(api, names, script) {
    const d = api.dsa;
    let index = 0;
    let buffer = [];
    let lastTree = null;
    const push = raws => { buffer.push(...raws); };
    return {
        get next() { return buffer.length ? null : script[index] ?? null; },
        async start() {
            index = 0;
            buffer = [];
            const bst = await d.bstClear(names.bst);
            const avl = await d.avlClear(names.avl);
            lastTree = avl.tree;
            return { kind: 'start', bstTree: bst.tree, tree: avl.tree, res: avl };
        },
        async step() {
            if (buffer.length) return buffer.shift();
            const item = script[index];
            if (!item) return { kind: 'end', tree: lastTree };
            index++;
            const endsGroup = !script[index]?.fold;
            if (item.op === 'BST') {
                const res = await d.bstInsert(names.bst, item.key);
                lastTree = res.tree;
                return { kind: 'bst', item, res, tree: res.tree, endsGroup };
            }
            if (item.op === 'SEARCH') {
                const res = await d.bstSearch(names.bst, item.key);
                return { kind: 'search', item, res, tree: res.tree, endsGroup };
            }
            if (item.op === 'CLEAR') {
                const res = await d.avlClear(names.avl);
                lastTree = res.tree;
                return { kind: 'clear', item, res, tree: res.tree, endsGroup };
            }
            if (item.op === 'INSPECT') {
                const res = await d.avlShow(names.avl);
                return { kind: 'inspect', item, res, tree: res.tree, endsGroup };
            }
            // AVL insert: one step per event C recorded, then "settled" if it rotated
            const before = lastTree;
            const res = await d.avlInsert(names.avl, item.key);
            lastTree = res.tree;
            if (!res.inserted) return { kind: 'duplicate', item, res, tree: res.tree, before, endsGroup };
            const raws = res.steps.map((event, i) => ({ kind: 'avl', item, res, event, eventIndex: i, tree: event.tree, before }));
            if (res.unbalanced) raws.push({ kind: 'settled', item, res, tree: res.tree, before });
            raws.at(-1).endsGroup = endsGroup;
            push(raws.slice(1));
            return raws[0];
        },
    };
}

// ------------------------------------------------------------------ helpers

export const fmt = bf => (bf > 0 ? `+${bf}` : `${bf}`);
const side = cmp => (cmp === 'LESS' ? 'left' : 'right');
const nodeOf = (tree, key) => tree?.nodes.find(n => n.key === key) ?? null;
export function heightOf(tree, key) {
    return key == null ? 0 : nodeOf(tree, key)?.height ?? 0;
}
const yesNo = (correct, whyYes, whyNo) => [
    { label: 'Yes', correct, why: correct ? whyYes : whyNo },
    { label: 'No', correct: !correct, why: correct ? whyYes : whyNo },
];
const CASE_TEXT = {
    LL: 'LL - rotate right at the node',
    RR: 'RR - rotate left at the node',
    LR: 'LR - rotate left at the child, then right',
    RL: 'RL - rotate right at the child, then left',
};
const CASE_FIX = {
    LL: z => `one RIGHT rotation at ${z}`,
    RR: z => `one LEFT rotation at ${z}`,
    LR: (z, y) => `a LEFT rotation at ${y} (turning the bend into a straight LL line), then a RIGHT rotation at ${z}`,
    RL: (z, y) => `a RIGHT rotation at ${y} (turning the bend into a straight RR line), then a LEFT rotation at ${z}`,
};

// heights and BFs of the nodes on the insertion path, from a C snapshot
function pathReport(tree, res) {
    return res.path.map(p => nodeOf(tree, p.key)).filter(Boolean)
        .reverse().map(n => `${n.key}: height ${n.height}, BF ${fmt(n.bf)}`).join('\n');
}

// ---------------------------------------------------------------- questions

const QUESTIONS = {
    searchCount: raw => ({
        prompt: `How many comparisons will it take to find ${raw.item.key} in this tree?`,
        choices: [...new Set([3, raw.res.comparisons, 1, 2])].slice(0, 3).sort((a, b) => a - b).map(n => ({
            label: `${n}`,
            correct: n === raw.res.comparisons,
            why: n === raw.res.comparisons ? `Right: one comparison per level, and this tree has ${raw.res.comparisons} levels.`
                : `In this tree every node has just one child, so the search visits every level: ${raw.res.comparisons} comparisons.`,
        })),
    }),
    inspectBf: raw => {
        const n = nodeOf(raw.tree, raw.item.node);
        const hl = heightOf(raw.tree, n.left), hr = heightOf(raw.tree, n.right);
        return {
            prompt: `Node ${n.key}: left subtree height ${hl}, right subtree height ${hr}.\nWhat is its balance factor?`,
            choices: [...new Set([n.bf, -n.bf || 1, 0, 2])].slice(0, 4).sort((a, b) => b - a).map(v => ({
                label: fmt(v),
                correct: v === n.bf,
                why: v === n.bf ? `Right: BF = ${hl} - ${hr} = ${fmt(n.bf)}.` : `BF = height(left) - height(right) = ${hl} - ${hr} = ${fmt(n.bf)}.`,
            })),
        };
    },
    valid: raw => {
        const worst = Math.max(...raw.tree.nodes.map(n => Math.abs(n.bf)));
        return {
            prompt: 'Look at every balance factor. Is this a valid AVL tree?',
            choices: yesNo(raw.res.valid, `Yes: every BF is -1, 0 or +1 (the largest is ${worst}).`, `No: a node has |BF| = ${worst}.`),
        };
    },
    willUnbalance: raw => {
        const u = raw.res.unbalanced;
        return {
            prompt: `Next: insert ${raw.item.key}.\nWill any balance factor leave -1..+1?`,
            choices: yesNo(Boolean(u),
                u ? `Yes: after placing ${raw.item.key}, node ${u.key} has BF ${fmt(u.bf)}.` : '',
                `No: every node on the path stays within -1..+1:\n${pathReport(raw.tree, raw.res)}`),
        };
    },
    bf: raw => {
        const n = nodeOf(raw.tree, raw.item.node);
        const hl = heightOf(raw.tree, n.left), hr = heightOf(raw.tree, n.right);
        return {
            prompt: `Next: insert ${raw.item.key}.\nAfterwards, what will node ${n.key}'s balance factor be?`,
            choices: [2, 1, 0, -1].map(v => ({
                label: fmt(v), correct: v === n.bf,
                why: v === n.bf ? `Right: left height ${hl} - right height ${hr} = ${fmt(n.bf)}.` : `After the insert: left height ${hl}, right height ${hr}, so BF = ${fmt(n.bf)}.`,
            })),
        };
    },
    whichNode: raw => {
        const u = raw.res.unbalanced;
        const placed = raw.res.steps[0].tree;
        const candidates = [...new Set([...raw.res.path.map(p => p.key)])].slice(-4);
        if (!candidates.includes(u.key)) candidates[0] = u.key;
        return {
            prompt: `${raw.item.key} has been placed. Which node is the LOWEST one that is now unbalanced?`,
            choices: candidates.map(k => ({
                label: `${k}  (look at its BF)`,
                correct: k === u.key,
                why: k === u.key ? `Right: ${k} has BF ${fmt(u.bf)}. Walking up from the new node, it is the first with |BF| = 2.`
                    : `${k} has BF ${fmt(nodeOf(placed, k)?.bf ?? 0)}${Math.abs(nodeOf(placed, k)?.bf ?? 0) > 1 ? ', but a LOWER node breaks the rule first' : ' - still allowed'}. Walk up from ${raw.item.key} and stop at the first |BF| = 2.`,
            })),
        };
    },
    whichCase: raw => {
        const u = raw.res.unbalanced;
        const p = raw.res.path;
        const zi = p.findIndex(x => x.key === u.key);
        const first = side(p[zi].cmp), second = side(p[zi + 1]?.cmp ?? (u.case[1] === 'L' ? 'LESS' : 'GREATER'));
        const why = `${raw.item.key} went into ${u.key}'s ${first.toUpperCase()} child (${u.child}), then into its ${second.toUpperCase()} side: ${u.case}. Fix: ${CASE_FIX[u.case](u.key, u.child)}.`;
        return {
            prompt: `Node ${u.key} has BF ${fmt(u.bf)}. Which case is it, and how is it repaired?`,
            choices: Object.entries(CASE_TEXT).map(([name, label]) => ({ label, correct: name === u.case, why: name === u.case ? `Right: ${why}` : why })),
        };
    },
    newRoot: raw => {
        const root = raw.res.tree.root;
        const opts = [...new Set([root, raw.before.root, raw.res.unbalanced.key, raw.res.unbalanced.child])].filter(k => k != null).slice(0, 4);
        return {
            prompt: 'After the rotation, which key is the ROOT of the whole tree?',
            choices: opts.map(k => ({
                label: `${k}`, correct: k === root,
                why: k === root ? `Right: ${root} is on top now.` : `The rotation lifted ${raw.res.unbalanced.child} into ${raw.res.unbalanced.key}'s place, so the root is ${root}.`,
            })),
        };
    },
};

export function finalTopQuestion(tree) {
    const by = new Map(tree.nodes.map(n => [n.key, n]));
    const r = by.get(tree.root);
    const correct = `${r.key} with ${r.left ?? '-'} and ${r.right ?? '-'}`;
    const keys = tree.nodes.map(n => n.key);
    const alt = [`${r.left} with ${keys[2] ?? '-'} and ${r.key}`, `${r.right} with ${r.key} and ${keys.at(-1)}`, `${r.key} with ${keys.at(-2)} and ${r.right ?? '-'}`]
        .filter(x => x !== correct);
    return {
        prompt: 'The garden is restored. What does the top of the final tree look like?\n(root with its left and right child)',
        choices: [correct, ...alt.slice(0, 2)].sort().map(label => ({
            label, correct: label === correct,
            why: label === correct ? 'Right - and C confirms every balance factor is within -1..+1.' : `C's final tree: root ${r.key}, left child ${r.left}, right child ${r.right}.`,
        })),
    };
}

// ------------------------------------------------------------- describers

function describeAvl(raw) {
    const { event, res, item } = raw;
    const k = item.key;
    const u = res.unbalanced;
    if (event.event === 'PLACED') {
        const route = res.path.map(p => `${k} ${p.cmp === 'LESS' ? '<' : '>'} ${p.key} → ${side(p.cmp)}`).join(', ');
        const where = event.side === 'ROOT' ? `The tree was empty, so ${k} becomes the ROOT (height 1, BF 0).` : `${route}. ${k} becomes the ${event.side.toLowerCase()} child of ${event.parent}.`;
        const heights = event.side === 'ROOT' ? '' : `\n\nWalking back up, the heights on the path:\n${pathReport(event.tree, res)}`;
        return {
            title: `Insert ${k}`,
            text: `${where}${heights}\n\n${u ? 'One balance factor is now outside -1..+1 - look at the badges.' : 'Every BF is still -1, 0 or +1: still an AVL tree.'}`,
            op: `avl_insert(${k}): BST placement, update heights`,
            brief: `insert ${k}${u ? ` → ${u.key} unbalanced (${u.case})` : ''}`,
            hl: { newKey: k, unbalanced: u?.key },
        };
    }
    if (event.event === 'UNBALANCED') {
        const n = nodeOf(event.tree, event.key);
        const hl = heightOf(event.tree, n.left), hr = heightOf(event.tree, n.right);
        const p = res.path;
        const zi = p.findIndex(x => x.key === event.key);
        return {
            title: `${event.key} is unbalanced: BF ${fmt(event.bf)}`,
            text: `Its left subtree is ${hl} tall, its right ${hr}: BF = ${hl} - ${hr} = ${fmt(event.bf)}.\n\n${event.key} is the LOWEST node on the way up from ${k} that breaks the rule, so C repairs it first - fixing it also fixes everything above.\n\nThe path from ${event.key} down to ${k} decides the repair. Highlighted: ${event.key}, its child ${event.child}${event.grandchild != null ? ` and ${event.grandchild}` : ''}. Is the path straight or does it bend?`,
            op: `|BF(${event.key})| = 2 → case ${event.case}`,
            brief: `${event.key} BF ${fmt(event.bf)}: case ${event.case}`,
            hl: { unbalanced: event.key, child: event.child, grandchild: event.grandchild },
        };
    }
    // ROTATE
    const first = raw.eventIndex === 2 && res.steps.length === 4;
    const dirLower = event.dir === 'RIGHT' ? 'right' : 'left';
    const other = event.dir === 'RIGHT' ? 'left' : 'right';
    // the first rotation also names the case (asked as a prediction just before)
    const u2 = res.unbalanced, p = res.path, zi = p.findIndex(x => x.key === u2.key);
    const caseText = raw.eventIndex === 2
        ? `Case ${u2.case}: ${k} went into ${u2.key}'s ${side(p[zi].cmp).toUpperCase()} child, then into its ${side(p[zi + 1].cmp).toUpperCase()} side. Repair: ${CASE_FIX[u2.case](u2.key, u2.child)}.\n\n`
        : '';
    return {
        title: `Rotate ${dirLower} at ${event.pivot}`,
        text: `${caseText}${event.newTop} moves UP into ${event.pivot}'s place; ${event.pivot} moves down to become ${event.newTop}'s ${dirLower} child.${event.moved != null ? `\n${event.moved} (the keys between them) changes parent: it becomes ${event.pivot}'s ${other} child.` : ''}\n\nThe keys keep their left-to-right order - only who is whose parent changes.${first ? `\n\nThis first rotation straightens the bend into a ${res.unbalanced.case === 'LR' ? 'LL' : 'RR'} line; one more rotation finishes the job.` : ''}`,
        op: `rotate_${dirLower}(${event.pivot}) → ${event.newTop} on top`,
        brief: `rotate ${dirLower} at ${event.pivot}`,
        hl: { pivot: event.pivot, newTop: event.newTop, moved: event.moved },
    };
}

const INTROS = {
    crooked: 'Elarion\'s oldest tree was planted with records that were already in order: 10, 20, 30, 40, 50.\n\nWe insert them into an ordinary Binary Search Tree - smaller to the left, larger to the right - and watch its shape.',
    rule: 'An AVL tree is a BST that keeps itself balanced. Two numbers per node:\n\nHEIGHT - an empty child counts 0, a leaf 1, any other node 1 + its taller subtree.\n\nBALANCE FACTOR - BF = height(left) - height(right).\n+ means the left side is taller, - the right side, 0 equal. AVL allows only -1, 0, +1.\n\nClick any node to inspect it.',
    rotations: 'When an insertion pushes a BF to +2 or -2, the tree repairs itself with ROTATIONS. There are four cases, named after the path from the unbalanced node down to the new key.',
    training: 'Now you insert. Press Next to insert each value and watch the tree; at some steps you predict first.',
    final: `Restore the Ancient Tree on your own. Values arrive in this order:\n${FINAL_KEYS.join(', ')}\n\nPredict each step before C performs it.`,
};

export function makeAvlDescriber(stage) {
    let caseName = null;
    return raw => {
        // C's validity check is of the tree AFTER the insertion; mid-rotation snapshots don't get it
        const state = { tree: raw.tree, hl: {}, kind: raw.kind, valid: raw.kind === 'avl' ? undefined : raw.res?.valid, inorder: raw.res?.inorder };
        let step;
        if (raw.kind === 'start') {
            step = { kind: 'start', title: stage.title, text: INTROS[stage.id], op: stage.id === 'crooked' ? 'BST_CLEAR · AVL_CLEAR' : 'AVL_CLEAR' };
            state.tree = stage.id === 'crooked' ? raw.bstTree : raw.tree;
        } else if (raw.kind === 'bst') {
            const r = raw.res;
            step = {
                title: `BST insert ${r.key}`,
                text: r.path.length
                    ? `${r.path.map(p => `${r.key} > ${p.key} → right`).join(', ')}. ${r.key} becomes the right child of ${r.parent}.\n\nEvery new key is larger than all before it, so it always goes RIGHT. The tree has ${r.tree.size} nodes and is ${r.tree.height} levels tall - a straight line.`
                    : `The tree is empty, so ${r.key} becomes the root.`,
                op: `bst_insert(${r.key}) - ${r.comparisons} comparisons`,
                brief: `insert ${r.key} (${r.comparisons} comparisons)`,
            };
            state.hl = { newKey: r.key, path: r.path.map(p => p.key) };
        } else if (raw.kind === 'search') {
            const r = raw.res;
            step = {
                title: `Search for ${r.key}: ${r.comparisons} comparisons`,
                text: `${r.path.map(p => p.key).join(' → ')}: every node is checked. In a crooked tree a search costs as many comparisons as there are nodes - O(n), no better than a list.\n\nA balanced tree of 5 nodes is only 3 levels tall. With a million keys: a crooked tree may need 1,000,000 comparisons, a balanced one about 20 - O(log n).\n\nAn AVL tree keeps itself balanced after EVERY insertion.`,
                op: `bst_search(${r.key}) → ${r.comparisons} comparisons`,
            };
            state.hl = { path: r.path.map(p => p.key), found: r.key };
        } else if (raw.kind === 'clear') {
            caseName = raw.item.caseName;
            step = { title: raw.item.title, text: `A fresh tree. We insert ${CASES.find(c => c.name === caseName).keys.join(', ')} and watch the balance factors.`, op: 'AVL_CLEAR', endsGroup: true };
        } else if (raw.kind === 'inspect') {
            const n = raw.item.node != null ? nodeOf(raw.tree, raw.item.node) : null;
            step = n
                ? { title: `Inspect node ${n.key}`, text: `Height ${n.height}: the longest path down from ${n.key} has ${n.height} node${n.height > 1 ? 's' : ''}.\nLeft subtree height ${heightOf(raw.tree, n.left)}, right subtree height ${heightOf(raw.tree, n.right)} → BF ${fmt(n.bf)}.\n\n${n.bf > 0 ? 'Positive: the LEFT side is one level taller - allowed.' : n.bf < 0 ? 'Negative: the RIGHT side is one level taller - allowed.' : 'Zero: both sides equally tall - perfectly balanced.'}`, op: `node ${n.key}: height ${n.height}, BF ${fmt(n.bf)}` }
                : { title: 'Every node within the rule', text: `BFs: ${raw.tree.nodes.map(x => `${x.key} ${fmt(x.bf)}`).join(', ')}.\n\nC checked the whole tree: ${raw.res.valid ? 'a valid AVL tree' : 'NOT a valid AVL tree'}. Next you will see what happens when an insertion breaks the rule.`, op: 'avl_is_valid()' };
            state.hl = { selected: n?.key };
        } else if (raw.kind === 'duplicate') {
            step = { title: `${raw.item.key} is already there`, text: 'Duplicates are not stored: the tree is unchanged.', op: 'duplicate → ignored' };
        } else if (raw.kind === 'avl') {
            step = describeAvl(raw);
            state.hl = step.hl;
        } else if (raw.kind === 'settled') {
            const t = raw.res.tree;
            step = {
                title: 'Balanced again',
                text: `Balance factors now: ${t.nodes.map(n => `${n.key} ${fmt(n.bf)}`).join(', ')}.\n\nEvery node is within -1..+1. The repaired subtree is exactly as tall as before the insertion, so nothing above it needed fixing. In-order is still ${raw.res.inorder.join(', ')}.\n\nC's check: ${raw.res.valid ? 'valid AVL tree ✔' : 'NOT valid'}.`,
                op: `avl_is_valid() → ${raw.res.valid}`,
                brief: `balanced: root ${t.root}`,
            };
        } else {
            step = {
                kind: 'end', done: true, title: `${stage.title} - complete`,
                text: stage.id === 'crooked' ? 'Sorted input made a crooked tree, and searching it was as slow as a list. Balance is what keeps a search tree fast.' : 'Well done.',
                op: null,
            };
            if (stage.endAsk === 'finalTop') step.question = finalTopQuestion(raw.tree);
        }
        step.kind ??= raw.kind;
        step.state = state;
        step.endsGroup = step.endsGroup ?? raw.endsGroup;
        const ask = raw.item?.ask;
        const name = typeof ask === 'string' ? ask : ask?.[raw.kind === 'settled' ? 'SETTLED' : raw.event?.event];
        const askHere = typeof ask === 'string' || (raw.kind === 'avl' && (raw.event.event !== 'ROTATE' || raw.eventIndex === 2)) || raw.kind === 'settled';
        if (name && askHere && QUESTIONS[name]) {
            // "before" questions show the tree as it was; the step itself is revealed after the answer
            step.question = QUESTIONS[name](raw);
            if (raw.kind === 'avl' && raw.event.event === 'PLACED') step.question.state = { tree: raw.before, hl: {}, kind: 'avl' };
        }
        if (step.question) step.question.graded = Boolean(stage.graded);
        return step;
    };
}

export function summarizeAvl(run) {
    return {
        title: `Skipped ahead: ${run.length} steps`,
        text: `Done by C, in order:\n${run.filter(s => s.brief).map(s => `• ${s.brief}`).join('\n')}`,
        op: `${run.length} steps`,
    };
}

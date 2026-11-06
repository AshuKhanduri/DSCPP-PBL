// Tower of Trials lessons: Stack, Linear Queue, Circular Queue.
//
// A lesson is a SCRIPT of operations (the inputs, e.g. PUSH 10). A source
// sends them to the C engine one at a time (native/c/stack.c, queue.c) and
// each step's explanation is written from what C answered: the element
// removed, the new TOP / FRONT / REAR, overflow or underflow. Nothing here
// keeps its own stack or queue.
//
// script item: { op, value?, ask?, fold? }
//   op    PUSH POP PEEK ENQ DEQ FRONT IS_EMPTY IS_FULL ADD (push + enqueue) REMOVE (pop + dequeue)
//   ask   prediction asked before the step is shown (see QUESTIONS)
//   fold  this step may be folded by "Skip repeats"

// ------------------------------------------------------------------ scripts

export const SCRIPTS = {
    stack: [
        { op: 'IS_EMPTY' },
        { op: 'PUSH', value: 10 }, { op: 'PUSH', value: 20 }, { op: 'PUSH', value: 30, ask: 'top' },
        { op: 'PEEK', ask: 'peekKeeps' },
        { op: 'POP', ask: 'pop' },
        { op: 'PUSH', value: 40, fold: true }, { op: 'PUSH', value: 50, fold: true }, { op: 'PUSH', value: 60, fold: true },
        { op: 'IS_FULL' },
        { op: 'PUSH', value: 70, ask: 'overflow' },
        { op: 'POP', fold: true }, { op: 'POP', fold: true }, { op: 'POP', fold: true }, { op: 'POP', fold: true }, { op: 'POP', fold: true },
        { op: 'IS_EMPTY' },
        { op: 'POP', ask: 'underflow' },
    ],
    linear: [
        { op: 'IS_EMPTY' },
        { op: 'ENQ', value: 10 }, { op: 'ENQ', value: 20 }, { op: 'ENQ', value: 30, ask: 'frontAfter' },
        { op: 'FRONT', ask: 'peekKeeps' },
        { op: 'DEQ', ask: 'dequeue' },
        { op: 'ENQ', value: 40, fold: true }, { op: 'ENQ', value: 50, fold: true },
        { op: 'DEQ' },
        { op: 'ENQ', value: 60, ask: 'linearOverflow' },
        { op: 'DEQ', fold: true }, { op: 'DEQ', fold: true }, { op: 'DEQ', fold: true },
        { op: 'IS_EMPTY' },
        { op: 'DEQ', ask: 'underflow' },
    ],
    circular: [
        { op: 'ENQ', value: 10 }, { op: 'ENQ', value: 20, fold: true }, { op: 'ENQ', value: 30, fold: true }, { op: 'ENQ', value: 40, fold: true }, { op: 'ENQ', value: 50, fold: true },
        { op: 'IS_FULL', ask: 'full' },
        { op: 'DEQ' }, { op: 'DEQ' },
        { op: 'ENQ', value: 60, ask: 'rearIndex' },
        { op: 'ENQ', value: 70 },
        { op: 'ENQ', value: 80, ask: 'overflow' },
        { op: 'DEQ', fold: true }, { op: 'DEQ', fold: true },
        { op: 'DEQ', ask: 'frontIndex' },
        { op: 'FRONT' },
        { op: 'DEQ', fold: true }, { op: 'DEQ', fold: true },
        { op: 'IS_EMPTY' },
        { op: 'DEQ', ask: 'underflow' },
        { op: 'ENQ', value: 90, ask: 'rearIndex' },
    ],
    compare: [
        { op: 'ADD', value: 10 }, { op: 'ADD', value: 20 }, { op: 'ADD', value: 30, fold: true }, { op: 'ADD', value: 40, fold: true },
        { op: 'REMOVE', ask: 'bothRemove' },
        { op: 'REMOVE', ask: 'bothRemove' },
    ],
};

// The Guardian's trial: every listed operation asks before it is shown.
export const TRIALS = [
    {
        id: 'stack', structure: 'stack', capacity: 5, title: 'The Stack Seal',
        script: [
            { op: 'PUSH', value: 5 }, { op: 'PUSH', value: 10 }, { op: 'PUSH', value: 15 },
            { op: 'POP', ask: 'pop' }, { op: 'PUSH', value: 20, ask: 'top' }, { op: 'PEEK', ask: 'peekValue' },
        ],
    },
    {
        id: 'queue', structure: 'linear', capacity: 5, title: 'The Queue Seal',
        script: [
            { op: 'ENQ', value: 5 }, { op: 'ENQ', value: 10 }, { op: 'ENQ', value: 15 },
            { op: 'DEQ', ask: 'dequeue' }, { op: 'ENQ', value: 20 }, { op: 'FRONT', ask: 'frontValue' },
        ],
    },
    {
        id: 'circular', structure: 'circular', capacity: 4, title: 'The Circle Seal',
        script: [
            { op: 'ENQ', value: 1 }, { op: 'ENQ', value: 2 }, { op: 'ENQ', value: 3 },
            { op: 'ENQ', value: 4, ask: 'rearIndex' }, { op: 'IS_FULL', ask: 'full' },
            { op: 'DEQ', ask: 'frontIndex' }, { op: 'ENQ', value: 5, ask: 'reuse' },
            { op: 'ENQ', value: 6, ask: 'overflow' },
            { op: 'DEQ' }, { op: 'DEQ', ask: 'frontIndex' }, { op: 'ENQ', value: 7, ask: 'rearIndex' },
        ],
    },
];

// ------------------------------------------------------------------ source

// Runs a script against C. structure: 'stack' | 'linear' | 'circular' | 'compare'.
// Overflow / underflow come back as {ok:false, condition, ...state} - kept, not thrown.
export function makeTowerSource(api, structure, names, capacity, script) {
    const d = api.dsa;
    const tolerate = p => p.catch(err => { if (err.body?.condition) return err.body; throw err; });
    const ops = {
        stack: {
            create: () => d.stackCreate(names.stack, capacity),
            PUSH: v => d.stackPush(names.stack, String(v), v), POP: () => d.stackPop(names.stack), PEEK: () => d.stackPeek(names.stack),
            STATE: () => d.stackList(names.stack),
        },
        linear: {
            create: () => d.lqueueCreate(names.queue, capacity),
            ENQ: v => d.lqueueEnqueue(names.queue, String(v), v), DEQ: () => d.lqueueDequeue(names.queue), FRONT: () => d.lqueuePeek(names.queue),
            STATE: () => d.lqueueList(names.queue),
        },
        circular: {
            create: () => d.queueCreate(names.queue, capacity),
            ENQ: v => d.enqueue(names.queue, String(v), v), DEQ: () => d.dequeue(names.queue), FRONT: () => d.queuePeek(names.queue),
            STATE: () => d.queueList(names.queue),
        },
    };
    let index = 0;
    let last = null;
    const run = async (kind, item) => {
        const o = ops[kind];
        if (item.op === 'IS_EMPTY' || item.op === 'IS_FULL') return o.STATE();       // C reports empty / full
        if (item.op === 'ADD') return o[kind === 'stack' ? 'PUSH' : 'ENQ'](item.value);
        if (item.op === 'REMOVE') return o[kind === 'stack' ? 'POP' : 'DEQ']();
        return o[item.op](item.value);
    };
    const kinds = structure === 'compare' ? ['stack', 'linear'] : [structure];
    return {
        get index() { return index; },
        get next() { return script[index] ?? null; },
        async start() {
            index = 0;
            const bodies = {};
            for (const k of kinds) bodies[k] = await ops[k].create();
            last = bodies;
            return { kind: 'start', structure, bodies, capacity };
        },
        async step() {
            const item = script[index];
            if (!item) return { kind: 'end', structure, bodies: last, capacity, index };
            const bodies = {};
            for (const k of kinds) bodies[k] = await tolerate(run(k, item));
            // a run of foldable steps ends where the next item is not foldable
            const raw = { kind: 'op', structure, item, index, bodies, prev: last, capacity, endsGroup: !script[index + 1]?.fold };
            last = bodies;
            index++;
            return raw;
        },
    };
}

// ------------------------------------------------------------------ text

const values = body => body.items.map(i => i.value);
const list = xs => (xs.length ? xs.join(', ') : 'nothing');
const failed = b => b.ok === false;

function choices(options, correct, why, wrongWhy) {
    return options.map(o => ({ label: String(o.label ?? o), correct: (o.key ?? o) === correct, why: (o.key ?? o) === correct ? why : (typeof wrongWhy === 'function' ? wrongWhy(o.key ?? o) : wrongWhy) }));
}

// Prediction questions. Each returns { prompt, choices } using C's answer.
const QUESTIONS = {
    top: ({ body, item }) => ({
        prompt: `After PUSH(${item.value}), which element is at the TOP?`,
        choices: choices(values(body).slice().reverse(), body.items[0].value,
            'Right: the element pushed last is always on top.', 'The TOP is always the element pushed LAST - the newest one.'),
    }),
    peekKeeps: ({ body, prev, kind }) => {
        const peeked = (body.peeked ?? {}).value;
        const keep = body.size === prev.size;
        const rest = kind === 'stack' ? values(prev).slice(1).reverse() : values(prev).slice(1);
        const all = kind === 'stack' ? values(prev).slice().reverse() : values(prev);
        return {
            prompt: `${kind === 'stack' ? 'PEEK' : 'FRONT'} returns ${peeked}. What does the ${kind === 'stack' ? 'stack' : 'queue'} hold afterwards?`,
            choices: choices([{ key: true, label: `${list(all)} - unchanged` }, { key: false, label: `${list(rest)} - ${peeked} removed` }], keep,
                `Right: ${kind === 'stack' ? 'PEEK' : 'FRONT'} only LOOKS at the element. Nothing is removed.`,
                `${kind === 'stack' ? 'PEEK' : 'FRONT'} only reads the element; removing is what ${kind === 'stack' ? 'POP' : 'DEQUEUE'} does.`),
        };
    },
    pop: ({ body, prev }) => ({
        prompt: `Stack (bottom → top): ${list(values(prev).slice().reverse())}.\nWhich element will POP remove?`,
        choices: choices(values(prev).slice(0, 3), body.popped.value,
            `Right: ${body.popped.value} is on top - the last one in is the first one out (LIFO).`,
            v => `${v} is not on top. POP only ever takes the TOP element, the most recently pushed one.`),
    }),
    peekValue: ({ body, prev }) => ({
        prompt: `Stack (bottom → top): ${list(values(prev).slice().reverse())}.\nWhat will PEEK return?`,
        choices: choices(values(prev).slice(0, 3), body.peeked.value, `Right: PEEK returns the TOP, ${body.peeked.value}.`, 'PEEK returns the TOP element - the one pushed most recently.'),
    }),
    overflow: ({ body, prev, kind, item }) => ({
        prompt: `The ${kind === 'stack' ? 'stack' : 'queue'} holds ${prev.size} of ${prev.capacity}. What happens on ${kind === 'stack' ? 'PUSH' : 'ENQUEUE'}(${item.value})?`,
        choices: choices([
            { key: 'overflow', label: 'Overflow: it is refused, nothing changes' },
            { key: 'replace', label: `${item.value} replaces an element` },
            { key: 'grow', label: 'The array simply grows' },
            { key: 'stored', label: 'It is stored - there is still room' },
        ], failed(body) ? 'overflow' : 'stored',
        'Right: there is no free place, so C refuses the operation and the structure stays as it was.',
        'A fixed-size array cannot grow, and C never overwrites data. With no free place the operation is refused: OVERFLOW.'),
    }),
    underflow: ({ body, kind }) => ({
        prompt: `The ${kind === 'stack' ? 'stack' : 'queue'} is empty. What happens on ${kind === 'stack' ? 'POP' : 'DEQUEUE'}()?`,
        choices: choices([
            { key: 'underflow', label: 'Underflow: there is nothing to remove' },
            { key: 'zero', label: 'It returns 0' },
            { key: 'last', label: 'It returns the last removed element again' },
        ], failed(body) ? 'underflow' : 'removed',
        'Right: removing from an empty structure is an UNDERFLOW - C refuses and reports it.',
        'An empty structure has no element to give back - not 0, not an old value. C reports UNDERFLOW instead.'),
    }),
    frontAfter: ({ body, item }) => ({
        prompt: `After ENQUEUE(${item.value}), which element is at the FRONT?`,
        choices: choices(values(body), body.items[0].value, `Right: ${body.items[0].value} entered first, so it is still at the FRONT.`,
            'New elements join at the REAR. The FRONT is the one that has waited longest - the first one in.'),
    }),
    dequeue: ({ body, prev }) => ({
        prompt: `Queue (front → rear): ${list(values(prev))}.\nWhat will DEQUEUE remove?`,
        choices: choices(values(prev).slice(0, 3), body.dequeued.value, `Right: ${body.dequeued.value} is at the FRONT - first in, first out.`,
            v => `${v} is not at the FRONT. DEQUEUE always takes the element that entered FIRST.`),
    }),
    frontValue: ({ body, prev }) => ({
        prompt: `Queue (front → rear): ${list(values(prev))}.\nWhat will FRONT() return?`,
        choices: choices(values(prev).slice(0, 3), body.peeked.value, `Right: ${body.peeked.value} is at the FRONT.`, 'FRONT() returns the element that has waited longest.'),
    }),
    linearOverflow: ({ body, prev, item }) => ({
        prompt: `REAR is at index ${prev.rearIndex}, the last one. Index${prev.frontIndex > 1 ? 'es' : ''} ${[...Array(prev.frontIndex).keys()].join(', ')} ${prev.frontIndex > 1 ? 'are' : 'is'} empty again. Can ENQUEUE(${item.value}) use them?`,
        choices: choices([{ key: 'no', label: 'No - overflow, REAR cannot go further' }, { key: 'yes', label: 'Yes - 60 goes to index 0' }], failed(body) ? 'no' : 'yes',
            'Right: in this simple queue REAR only moves right. Past the last index there is nowhere to go, so the free slots at the start are wasted.',
            'In a LINEAR queue REAR only moves right (rear + 1). It never jumps back to index 0, so those freed slots cannot be used.'),
    }),
    full: ({ body }) => ({
        prompt: `size = ${body.size}, capacity = ${body.capacity}. Is the queue full?`,
        choices: choices([{ key: true, label: 'Yes' }, { key: false, label: 'No' }], body.full,
            body.full ? 'Right: size equals capacity - every slot holds an element.' : 'Right: size is below capacity, so there is room.',
            `isFull() compares size with capacity: ${body.size} ${body.full ? '==' : '<'} ${body.capacity}.`),
    }),
    rearIndex: ({ body, prev }) => {
        const r = prev.rearIndex, cap = prev.capacity;
        const correct = failed(body) ? 'overflow' : body.index;
        // the true next index, the no-wrap guess, 'stays put', and overflow - at most 4, no repeats
        const opts = [...new Set([(r + 1) % cap, r + 1, Math.max(r, 0), 'overflow'])].slice(0, 4);
        return {
            prompt: `REAR is at index ${r}, size ${prev.size}/${cap}. Where will this ENQUEUE store its value?`,
            choices: choices(opts.map(o => ({ key: o, label: o === 'overflow' ? 'Nowhere - overflow' : `Index ${o}` })), correct,
                failed(body) ? 'Right: the queue is full, so nothing is stored.' : `Right: REAR = (${r} + 1) % ${cap} = ${body.index}.`,
                failed(body) ? `size ${prev.size} == capacity ${cap}: the queue is full.` : `REAR moves with (REAR + 1) % ${cap} = (${r} + 1) % ${cap} = ${body.index}. ${r + 1 === cap ? `There is no index ${cap}: % wraps it back to 0.` : ''}`),
        };
    },
    frontIndex: ({ body, prev }) => {
        const f = prev.frontIndex, cap = prev.capacity;
        const opts = [...new Set([(f + 1) % cap, f + 1, f])];
        return {
            prompt: `FRONT is at index ${f}. Where is FRONT after this DEQUEUE?`,
            choices: choices(opts.map(o => ({ key: o, label: `Index ${o}` })), body.frontIndex,
                `Right: FRONT = (${f} + 1) % ${cap} = ${body.frontIndex}.`,
                `FRONT moves with (FRONT + 1) % ${cap} = (${f} + 1) % ${cap} = ${body.frontIndex}.${f + 1 === cap ? ` There is no index ${cap}: it wraps to 0.` : ''}`),
        };
    },
    reuse: ({ body, prev }) => ({
        prompt: `Index ${(prev.rearIndex + 1) % prev.capacity} was emptied by the last DEQUEUE. Can this ENQUEUE reuse it?`,
        choices: choices([{ key: true, label: 'Yes - REAR wraps around to it' }, { key: false, label: 'No - it is wasted, like in a linear queue' }], !failed(body) && body.index === (prev.rearIndex + 1) % prev.capacity,
            `Right: REAR = (${prev.rearIndex} + 1) % ${prev.capacity} = ${(prev.rearIndex + 1) % prev.capacity}, a free slot.`,
            'That is exactly what a circular queue fixes: the % lets REAR wrap back to slots that DEQUEUE freed.'),
    }),
    bothRemove: ({ stack, linear, prevStack, prevLinear }) => {
        const p = stack.popped.value, q = linear.dequeued.value;
        const sv = values(prevStack), lv = values(prevLinear);
        const newestS = sv[0], oldestS = sv.at(-1), oldestQ = lv[0], newestQ = lv.at(-1);
        const opts = [[newestS, oldestQ], [oldestS, newestQ], [newestS, newestQ], [oldestS, oldestQ]]
            .filter((o, i, all) => all.findIndex(x => x[0] === o[0] && x[1] === o[1]) === i);
        return {
            prompt: `Both received the same values in the same order.\nWhat do POP and DEQUEUE return now?`,
            choices: opts.map(([a, b]) => ({
                label: `POP ${a}, DEQUEUE ${b}`,
                correct: a === p && b === q,
                why: a === p && b === q ? `Right: the stack gives back its NEWEST (${p}), the queue its OLDEST (${q}).`
                    : `The stack returns the element added LAST (${p}); the queue returns the element added FIRST (${q}).`,
            })),
        };
    },
};

// ------------------------------------------------------------- describers

const NAMES = { stack: 'stack', linear: 'linear queue', circular: 'circular queue' };

function describeOne(kind, item, body, prev) {
    const v = item.value;
    const ok = !failed(body);
    const cap = body.capacity;
    const isStack = kind === 'stack';
    const circ = kind === 'circular';
    // % is the remainder after dividing: spelled out where it matters, at the wrap
    const mod = (x, why) => (why && x + 1 === cap
        ? `(${x} + 1) % ${cap} = ${cap} % ${cap} = 0.
${cap} ÷ ${cap} = 1 remainder 0, so the index after ${x} is 0 - there is no index ${cap}, the count wraps around to the start`
        : `(${x} + 1) % ${cap} = ${(x + 1) % cap}`);
    switch (item.op) {
    case 'ADD':
    case 'PUSH':
    case 'ENQ':
        if (isStack) {
            if (!ok) return { title: `PUSH(${v}) - OVERFLOW`, text: `All ${cap} places are taken (size ${cap}/${cap}). There is no room above the TOP, so C refuses the push: STACK OVERFLOW.\n\nNothing changes: ${v} is not stored and no element is lost.`, op: `stack_is_full() → refuse PUSH(${v})`, brief: `PUSH ${v}: overflow` };
            const below = prev.items[0]?.value;
            return { title: `PUSH(${v})`, text: `${v} goes on TOP - the only open end of a stack.${below != null ? ` It sits on ${below}, which is no longer the top.` : ' The stack was empty, so it is also the bottom element.'}\n\nTOP → ${v}. Size ${body.size}/${cap}.`, op: `stack_push(${v})`, brief: `PUSH ${v} → top ${v}` };
        }
        if (!ok) {
            if (!circ && prev.size < cap) {
                return { title: `ENQUEUE(${v}) - OVERFLOW`, text: `REAR is at index ${prev.rearIndex}, the last slot. This simple queue only moves REAR to the right, so C refuses: OVERFLOW.\n\nYet index${prev.frontIndex > 1 ? 'es' : ''} ${[...Array(prev.frontIndex).keys()].join(', ')} ${prev.frontIndex > 1 ? 'are' : 'is'} empty! Those slots are wasted - unless every element is shifted left, which costs time.`, op: `rear == capacity - 1 → refuse ENQUEUE(${v})`, brief: `ENQUEUE ${v}: overflow (slots wasted)` };
            }
            return { title: `ENQUEUE(${v}) - OVERFLOW`, text: `size ${prev.size} == capacity ${cap}: every slot holds an element, so C refuses: OVERFLOW.${circ ? '\n\nIn a circular queue "full" really means full - no slot is wasted.' : ''}`, op: `${circ ? 'size == capacity' : 'rear == capacity - 1'} → refuse ENQUEUE(${v})`, brief: `ENQUEUE ${v}: overflow` };
        }
        if (circ) {
            return {
                title: `ENQUEUE(${v}) → index ${body.index}`,
                text: `REAR moves one step: REAR = ${mod(prev.rearIndex, true)}.\n${v} is stored at index ${body.index}. ${body.size === 1 ? 'It is the only element, so FRONT points at it too.' : `FRONT is still ${body.items[0].value} (index ${body.frontIndex}).`} Size ${body.size}/${cap}.`,
                op: `rear = (rear + 1) % ${cap} = ${body.rearIndex}; a[${body.index}] = ${v}`,
                brief: `ENQUEUE ${v} → index ${body.index}`,
            };
        }
        return {
            title: `ENQUEUE(${v})`,
            text: `${v} joins at the REAR. REAR moves right: ${prev.rearIndex} → ${body.rearIndex}, and ${v} is stored at index ${body.index}.\n\n${body.size === 1 ? `It is the only element, so it is also at the FRONT.` : `${body.items[0].value} is still at the FRONT - it has waited longest.`}`,
            op: `rear = rear + 1 = ${body.rearIndex}; a[${body.index}] = ${v}`,
            brief: `ENQUEUE ${v} → index ${body.index}`,
        };
    case 'REMOVE':
    case 'POP':
    case 'DEQ':
        if (isStack) {
            if (!ok) return { title: 'POP() - UNDERFLOW', text: 'The stack is empty: there is no TOP element to remove. C refuses: STACK UNDERFLOW.\n\nCheck isEmpty() before popping.', op: 'stack_is_empty() → refuse POP', brief: 'POP: underflow' };
            return { title: `POP() → ${body.popped.value}`, text: `POP removes the TOP element, ${body.popped.value}. It was the LAST one pushed, so it is the FIRST one out: Last In, First Out (LIFO).\n\nTOP → ${body.items[0]?.value ?? 'nothing - the stack is empty'}. Size ${body.size}/${cap}.`, op: `stack_pop() → ${body.popped.value}`, brief: `POP → ${body.popped.value}` };
        }
        if (!ok) return { title: 'DEQUEUE() - UNDERFLOW', text: `The queue is empty${circ ? ' (size 0)' : ` (FRONT ${body.frontIndex} is past REAR ${body.rearIndex})`}: nothing to remove. C refuses: UNDERFLOW.`, op: `${circ ? 'size == 0' : 'front > rear'} → refuse DEQUEUE`, brief: 'DEQUEUE: underflow' };
        if (circ) {
            return {
                title: `DEQUEUE() → ${body.dequeued.value}`,
                text: `${body.dequeued.value} leaves from the FRONT (index ${body.index}): first in, first out.\nFRONT moves one step: FRONT = ${mod(body.index, true)}.\n\nIndex ${body.index} is free again - a later ENQUEUE can reuse it.`,
                op: `front = (front + 1) % ${cap} = ${body.frontIndex}`,
                brief: `DEQUEUE → ${body.dequeued.value} (FRONT → ${body.frontIndex})`,
            };
        }
        return {
            title: `DEQUEUE() → ${body.dequeued.value}`,
            text: `${body.dequeued.value} leaves from the FRONT. It entered FIRST, so it leaves FIRST: First In, First Out (FIFO).\n\nFRONT moves right: ${body.index} → ${body.frontIndex}. Index ${body.index} is empty now - but this simple queue never uses it again.`,
            op: `front = front + 1 = ${body.frontIndex}`,
            brief: `DEQUEUE → ${body.dequeued.value}`,
        };
    case 'PEEK':
    case 'FRONT':
        if (!ok) return { title: `${isStack ? 'PEEK' : 'FRONT'}() - UNDERFLOW`, text: `The ${NAMES[kind]} is empty: there is no element to look at. C reports UNDERFLOW.`, op: 'empty → refuse', brief: 'peek: underflow' };
        return {
            title: `${isStack ? 'PEEK' : 'FRONT'}() → ${body.peeked.value}`,
            text: `${isStack ? 'PEEK' : 'FRONT'} returns the ${isStack ? 'TOP' : 'FRONT'} element, ${body.peeked.value}, WITHOUT removing it.${!isStack ? ` It is at index ${body.index}.` : ''}\n\nThe ${NAMES[kind]} is unchanged: size ${body.size}.`,
            op: `${isStack ? 'stack_peek()' : `a[front] = a[${body.index}]`} → ${body.peeked.value}`,
            brief: `${isStack ? 'PEEK' : 'FRONT'} → ${body.peeked.value}`,
        };
    case 'IS_EMPTY':
        return {
            title: `isEmpty() → ${body.empty}`,
            text: isStack ? `Is there a TOP element? Size is ${body.size}, so isEmpty() is ${body.empty}.`
                : circ ? `isEmpty() checks size == 0: size is ${body.size}, so the answer is ${body.empty}.`
                    : `isEmpty() checks whether FRONT has passed REAR: FRONT ${body.frontIndex}, REAR ${body.rearIndex} → ${body.empty}.`,
            op: `isEmpty() → ${body.empty}`, brief: `isEmpty → ${body.empty}`,
        };
    case 'IS_FULL':
        return {
            title: `isFull() → ${body.full}`,
            text: circ ? `isFull() checks size == capacity: ${body.size} ${body.full ? '==' : '<'} ${cap}, so the answer is ${body.full}.\n\nC keeps a separate size counter. Without it, FRONT and REAR would point the same way when the queue is empty AND when it is full.`
                : `Size ${body.size} of ${cap}: isFull() is ${body.full}.`,
            op: `isFull() → ${body.full}`, brief: `isFull → ${body.full}`,
        };
    default:
        return { title: item.op, text: '', op: null };
    }
}

const STARTS = {
    stack: cap => ({
        title: `An empty stack (capacity ${cap})`,
        text: `A STACK is a pile: you add and remove only at the TOP, like plates.\n\nOur stack has room for ${cap} elements. TOP points at the highest one - right now there is none.`,
        op: `STACK_CREATE capacity ${cap}`,
    }),
    linear: cap => ({
        title: `An empty queue (capacity ${cap})`,
        text: `A QUEUE is a line: new elements join at the REAR, elements leave from the FRONT. First In, First Out (FIFO).\n\nThis simple queue is an array of ${cap} slots. FRONT = 0, REAR = -1 (nothing there yet).`,
        op: `LQUEUE_CREATE capacity ${cap}`,
    }),
    circular: cap => ({
        title: `A circular queue (capacity ${cap})`,
        text: `Same array, one change: the indices WRAP. After index ${cap - 1} they continue at index 0, like seats around a table.\n\nThe trick is % (modulo): the REMAINDER after dividing. 3 % ${cap} = 3 (${cap} does not fit into 3), but ${cap} % ${cap} = 0. So (index + 1) % ${cap} counts 0, 1, ... ${cap - 1}, 0, 1, ...

C keeps FRONT = 0, REAR = -1 and a size counter (0).`,
        op: `QUEUE_CREATE capacity ${cap}`,
    }),
    compare: () => ({
        title: 'A stack and a queue, side by side',
        text: 'Both will receive the SAME values in the SAME order: 10, 20, 30, 40. Then we remove two from each. Watch which ones come out.',
        op: 'STACK_CREATE 5 · LQUEUE_CREATE 5',
    }),
};

const ENDS = {
    stack: () => ({ title: 'The stack, mastered', text: 'PUSH and POP only touch the TOP, so the last element in is always the first out (LIFO).\nPEEK reads the TOP without removing it.\nA full stack refuses PUSH (overflow); an empty one refuses POP and PEEK (underflow).' }),
    linear: () => ({ title: 'The weakness of the simple queue', text: 'FIFO works, but REAR and FRONT only move right. Each DEQUEUE leaves a slot behind that this queue can never fill again, so it reported OVERFLOW with free slots in the array.\n\nThe Guardian\'s answer: let the indices wrap around - a CIRCULAR queue.' }),
    circular: () => ({ title: 'Linear vs circular', text: 'Both are FIFO. The difference is how the indices move:\n• linear: index + 1 - freed slots are wasted\n• circular: (index + 1) % capacity - freed slots are reused\n\nC tells empty (size 0) from full (size == capacity) with its size counter.' }),
    compare: () => ({
        title: 'Same input, opposite order',
        text: 'Stack: newest first (40, then 30). Queue: oldest first (10, then 20).\n\nStacks in real life: Undo, the function call stack, the browser Back button.\nQueues in real life: printer jobs, waiting lines, task scheduling.',
    }),
};

// One describer per lesson run. trial = every listed `ask` is a graded question.
export function makeTowerDescriber(structure, { trial = false } = {}) {
    return raw => {
        const cap = raw.capacity;
        const state = { structure, bodies: raw.bodies, item: raw.item ?? null, prev: raw.prev ?? null };
        if (raw.kind === 'start') return { kind: 'start', ...STARTS[structure](cap), state };
        if (raw.kind === 'end') return { kind: 'end', done: true, ...(trial ? { title: 'Seal broken', text: 'Every answer checked against the C engine.' } : ENDS[structure]()), op: null, state };
        const { item } = raw;
        let step;
        if (structure === 'compare') {
            const s = describeOne('stack', item, raw.bodies.stack, raw.prev.stack);
            const q = describeOne('linear', item, raw.bodies.linear, raw.prev.linear);
            const add = item.op === 'ADD';
            step = {
                title: add ? `Add ${item.value} to both` : `Remove one from each: ${raw.bodies.stack.popped?.value} and ${raw.bodies.linear.dequeued?.value}`,
                text: add
                    ? `Stack: ${item.value} goes on TOP.\nQueue: ${item.value} joins at the REAR.\n\nStack (bottom → top): ${list(values(raw.bodies.stack).slice().reverse())}\nQueue (front → rear): ${list(values(raw.bodies.linear))}`
                    : `POP gives ${raw.bodies.stack.popped.value} - the NEWEST element still in the stack.\nDEQUEUE gives ${raw.bodies.linear.dequeued.value} - the OLDEST element still in the queue.\n\nSame order in, different order out: the stack reverses it, the queue keeps it.`,
                op: `${s.op}  |  ${q.op}`,
                brief: `${s.brief} | ${q.brief}`,
            };
            if (item.ask) step.question = QUESTIONS[item.ask]({ stack: raw.bodies.stack, linear: raw.bodies.linear, prevStack: raw.prev.stack, prevLinear: raw.prev.linear });
        } else {
            const body = raw.bodies[structure], prev = raw.prev[structure];
            step = describeOne(structure, item, body, prev);
            if (item.ask) step.question = QUESTIONS[item.ask]({ body, prev, kind: structure, item });
        }
        step.kind = 'op';
        step.state = state;
        step.endsGroup = raw.endsGroup;
        if (step.question) step.question.graded = trial;
        return step;
    };
}

export function summarizeTower(run) {
    return {
        title: `Skipped ahead: ${run.length} operations`,
        text: `The same operation, repeated - as C performed it:\n${run.map(s => `• ${s.brief}`).join('\n')}`,
        op: `${run.length} operations`,
    };
}

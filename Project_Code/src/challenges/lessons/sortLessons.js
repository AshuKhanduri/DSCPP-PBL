// Order of the Forge lessons: explanation text for ONE sorting operation,
// built from the state the C engine returns after SORT_STEP (native/c/sort.c).
//
// Nothing here sorts. raw = { op, a, b, result, values, ids, pass, sortedLo,
// sortedHi, min, key, keyId, gap, comparisons, swaps, shifts, done }.
// Positions are shown 1-based to the player. `items` names each item by its id
// (ids travel with their values in C, so a name always follows its weight).

const P = i => i + 1;
const kg = v => `${v} kg`;
const label = (items, raw, i) => `${kg(raw.values[i])} ${items[raw.ids[i]]}`;
// Both choices explain the TRUE answer: whyYes when the answer is yes, whyNo otherwise.
const yesNo = (correct, whyYes, whyNo) => [
    { label: 'Yes', correct, why: correct ? whyYes : whyNo },
    { label: 'No', correct: !correct, why: correct ? whyYes : whyNo },
];

function base(raw, extra = {}) {
    return { state: raw, done: raw.done, ...extra };
}

function doneStep(raw, title, text) {
    return base(raw, {
        kind: 'done', title, text,
        op: `done: ${raw.comparisons} comparisons, ${raw.swaps} swaps, ${raw.shifts} shifts`,
    });
}

// ----------------------------------------------------------------- bubble

export function makeBubbleDescriber(items) {
    let compares = 0, passCompares = 0, passSwaps = 0, lastPassSwapped = 1;
    return raw => {
        const L = i => label(items, raw, i);
        const v = i => raw.values[i];
        switch (raw.op) {
        case null:
            return base(raw, {
                kind: 'start', title: 'The mixed-up rack',
                text: `Weights from left to right: ${raw.values.join(', ')} kg.\n\nSORTING means putting them in order - here lightest to heaviest - so the light gear can be packed first and any weight found at a glance.\n\nBubble Sort walks along the rack comparing NEIGHBOURS. If the left one is heavier, the two swap places.`,
                op: `SORT_START BUBBLE (${raw.n} items)`,
            });
        case 'COMPARE': {
            compares++;
            passCompares++;
            const must = raw.result === 1;
            const equal = v(raw.a) === v(raw.b);
            const step = base(raw, {
                kind: 'compare',
                title: `Compare positions ${P(raw.a)} and ${P(raw.b)}`,
                text: `${L(raw.a)} vs ${L(raw.b)}.\n\n${must
                    ? `${v(raw.a)} is heavier than ${v(raw.b)}: the heavier one is on the LEFT, so they are in the wrong order and must SWAP.`
                    : equal ? 'Same weight: they are already in order, so no swap. (Equal items keep their order.)'
                        : `${v(raw.a)} is not heavier than ${v(raw.b)}: already in order. No swap - move one place right.`}`,
                op: `a[${raw.a}] > a[${raw.b}] ? ${v(raw.a)} > ${v(raw.b)} → ${must ? 'swap' : 'no swap'}`,
                brief: `${v(raw.a)} vs ${v(raw.b)}: ${must ? 'swap' : 'keep'}`,
            });
            if (compares === 1) step.text += '\n\nOnly two neighbours are ever compared, so each step is a tiny, easy decision.';
            const swapQ = compares === 1 || compares === 3 || (raw.pass === 2 && passCompares === 2);
            const pairQ = compares === 2 || (raw.pass === 2 && passCompares === 1);
            if (pairQ && raw.n > 2) {
                const pairs = [raw.a, raw.a === 0 ? 1 : raw.a - 1, Math.min(raw.a + 1, raw.n - 2)].filter((x, i, xs) => xs.indexOf(x) === i);
                step.question = {
                    prompt: 'Which two positions will Bubble Sort compare next?',
                    choices: pairs.sort((x, y) => x - y).map(x => ({
                        label: `Positions ${P(x)} and ${P(x + 1)}`,
                        correct: x === raw.a,
                        why: x === raw.a
                            ? (passCompares === 1 ? 'Right: every new pass starts again at the left end.' : 'Right: the scan moves one place to the right each time.')
                            : passCompares === 1 ? 'A new pass always starts again from the LEFT end, positions 1 and 2.'
                                : x < raw.a ? 'That pair was already handled. The scan only moves right.' : 'The scan moves ONE place right at a time - no pair is skipped.',
                    })),
                };
            } else if (swapQ) {
                step.question = {
                    showStep: true,   // the board may show WHICH items are compared, not the outcome
                    prompt: `Positions ${P(raw.a)} and ${P(raw.b)}: ${L(raw.a)} on the left, ${L(raw.b)} on the right.\nShould they be swapped?`,
                    choices: yesNo(must, `Yes: ${v(raw.a)} > ${v(raw.b)}, the heavier one must move right.`,
                        `No: ${v(raw.a)} is not heavier than ${v(raw.b)}, so they are already in order. Bubble Sort only swaps when the LEFT one is heavier.`),
                };
            }
            return step;
        }
        case 'SWAP':
            passSwaps++;
            return base(raw, {
                kind: 'swap', title: `Swap: ${v(raw.b)} moves right`,
                text: `The heavier ${items[raw.ids[raw.b]]} (${kg(v(raw.b))}) moves right, the lighter ${items[raw.ids[raw.a]]} (${kg(v(raw.a))}) moves left.\n\nThe heavier item keeps travelling right as long as it meets lighter neighbours - like a bubble rising.`,
                op: `swap(a[${raw.a}], a[${raw.b}])`,
                brief: `swapped → ${raw.values.join(' ')}`,
            });
        case 'PASS_END': {
            const swaps = passSwaps;
            lastPassSwapped = raw.result;
            passCompares = 0;
            passSwaps = 0;
            const step = base(raw, {
                kind: 'passEnd', endsGroup: true,
                title: `Pass ${raw.pass} complete`,
                text: raw.result
                    ? `${swaps} swap${swaps === 1 ? '' : 's'} in this pass. Every comparison passes the heavier of two neighbours to the right, so the heaviest unsorted item always ends the pass at the end: ${L(raw.a)} is at position ${P(raw.a)}, in its FINAL place.\n\nThe items to its left may still be out of order, so another pass is needed - one comparison shorter.`
                    : `No swaps in this whole pass: every neighbour pair is already in order, so the WHOLE rack is sorted. Bubble Sort can stop early.`,
                op: raw.result ? `pass ${raw.pass} done: a[${raw.a}] is final` : `pass ${raw.pass}: 0 swaps → sorted`,
                brief: `pass ${raw.pass} ends: ${kg(v(raw.a))} fixed at position ${P(raw.a)}`,
            });
            if (raw.pass === 1 && raw.result) {
                const choices = [...new Set([raw.a, raw.a - 1, 0])].filter(i => i >= 0).map(i => ({
                    label: L(i),
                    correct: i === raw.a,
                    why: i === raw.a ? 'Right: the heaviest item always ends the first pass at the far right.' : `${L(i)} is not the heaviest. Whatever is heaviest gets carried right by every comparison it takes part in.`,
                }));
                step.question = { prompt: 'Pass 1 is ending. Which item is now certainly in its final place?', choices };
            }
            return step;
        }
        default:
            return doneStep(raw, 'The rack is sorted!',
                `${raw.values.join(', ')} kg - lightest to heaviest.\n\n${raw.n < 2 ? 'With fewer than two items there is nothing to compare.' : lastPassSwapped
                    ? 'Only one unsorted item was left, so it had to be the lightest.'
                    : 'The last pass made no swaps - that is how Bubble Sort knows it is done.'}\n\n${raw.pass} pass(es), ${raw.comparisons} comparisons, ${raw.swaps} swaps.`);
        }
    };
}

// -------------------------------------------------------------- selection

export function makeSelectionDescriber(items) {
    let passCompares = 0, compares = 0;
    return (raw, prev) => {
        const L = i => label(items, raw, i);
        const v = i => raw.values[i];
        switch (raw.op) {
        case null:
            return base(raw, {
                kind: 'start', title: 'Two parts: sorted and unsorted',
                text: `Weights: ${raw.values.join(', ')} kg.\n\nSelection Sort keeps a SORTED part on the left (empty at first) and an UNSORTED part on the right.\n\nEach pass it SELECTS the lightest unsorted item and puts it at the front of the unsorted part. Unlike Bubble Sort, items do not creep along one place at a time - the right item jumps straight to its spot.`,
                op: `SORT_START SELECTION (${raw.n} items)`,
            });
        case 'PASS_START':
            passCompares = 0;
            return base(raw, {
                kind: 'passStart', title: `Pass ${raw.pass}: find the lightest`,
                text: `Unsorted part: positions ${P(raw.a)}-${raw.n}.\n\nWe start by assuming the first unsorted item, ${L(raw.a)}, is the lightest. It is our CURRENT MINIMUM until we find something lighter.`,
                op: `min = ${raw.a}`,
                brief: `pass ${raw.pass}: start with ${kg(v(raw.a))} as minimum`,
            });
        case 'COMPARE': {
            compares++;
            passCompares++;
            const lighter = raw.result === 1;
            const step = base(raw, {
                kind: 'compare',
                title: lighter ? `New minimum: ${kg(v(raw.a))}` : `${kg(v(raw.a))} - not lighter`,
                text: lighter
                    ? `${L(raw.a)} is lighter than the current minimum ${L(raw.b)}. It becomes the new current minimum.`
                    : `${L(raw.a)} is not lighter than the current minimum ${L(raw.b)}. The minimum stays.${v(raw.a) === v(raw.b) ? ' (Equal is not lighter: the first one found is kept.)' : ''}`,
                op: `a[${raw.a}] < a[min] ? ${v(raw.a)} < ${v(raw.b)} → min = ${raw.min}`,
                brief: `${v(raw.a)} vs min ${v(raw.b)}: ${lighter ? 'new minimum' : 'keep'}`,
            });
            if (compares === 1 || compares === 3 || (raw.pass === 2 && passCompares === 1)) {
                step.question = {
                    showStep: true,
                    prompt: `Current minimum: ${label(items, prev, raw.b)}. Next we look at ${label(items, prev, raw.a)}.\nWhich is the minimum after this check?`,
                    choices: [raw.b, raw.a].map(i => ({
                        label: label(items, prev, i),
                        correct: i === raw.min,
                        why: i === raw.min
                            ? (lighter ? `Right: ${v(raw.a)} < ${v(raw.b)}.` : `Right: ${v(raw.a)} is not lighter than ${v(raw.b)}.`)
                            : lighter ? `${v(raw.a)} is lighter than ${v(raw.b)}, so the minimum changes.` : `The minimum only changes for a LIGHTER item, and ${v(raw.a)} is not lighter than ${v(raw.b)}.`,
                    })),
                };
            }
            return step;
        }
        case 'SWAP':
        case 'PLACE': {
            const swap = raw.op === 'SWAP';
            const step = base(raw, {
                kind: 'place', endsGroup: true,
                title: swap ? `Swap the lightest to position ${P(raw.a)}` : `${kg(v(raw.a))} is already in place`,
                text: `${swap
                    ? `The scan is finished: the lightest unsorted item was ${L(raw.a)}. It swaps with the item at the front of the unsorted part.`
                    : `The scan is finished and the lightest unsorted item, ${L(raw.a)}, is already at the front. No swap needed.`}\n\nThe sorted part grows by one: ${raw.a === 0 ? 'position 1 is' : `positions 1-${P(raw.a)} are`} final, because each holds the lightest of what was left.`,
                op: swap ? `swap(a[${raw.a}], a[${raw.b}])` : `min == ${raw.a}: no swap`,
                brief: swap ? `${kg(v(raw.a))} swapped to position ${P(raw.a)}` : `${kg(v(raw.a))} stays at position ${P(raw.a)}`,
            });
            if (raw.pass <= 2) {
                const front = raw.a;
                const pool = [raw.b, ...prev.values.map((_, i) => i).filter(i => i >= front && i !== raw.b)].slice(0, 3);
                step.question = {
                    prompt: `The scan of the unsorted part is finished. Which item goes to position ${P(front)}?`,
                    choices: pool.sort((x, y) => x - y).map(i => ({
                        label: label(items, prev, i),
                        correct: i === raw.b,
                        why: i === raw.b ? 'Right: the minimum of the unsorted part goes to its front.'
                            : `${kg(prev.values[i])} is not the lightest unsorted item - ${kg(prev.values[raw.b])} is.`,
                    })),
                };
            }
            return step;
        }
        default:
            return doneStep(raw, 'The rack is sorted!',
                `${raw.values.join(', ')} kg.\n\n${raw.n < 2 ? 'Nothing to select with fewer than two items.' : 'When one unsorted item is left, it must be the heaviest - so it is already in place.'}\n\n${raw.comparisons} comparisons but only ${raw.swaps} swaps. Selection Sort always scans the whole unsorted part (even if the rack was already sorted), but makes at most ONE swap per pass.`);
        }
    };
}

// -------------------------------------------------------------- insertion

export function makeInsertionDescriber(items) {
    let compares = 0, keys = 0, keyCompares = 0;
    return (raw, prev) => {
        const v = i => raw.values[i];
        switch (raw.op) {
        case null:
            return base(raw, {
                kind: 'start', title: 'Like cards in your hand',
                text: `Weights: ${raw.values.join(', ')} kg.\n\nThink of sorting playing cards: the cards in your hand stay sorted, and each new card is slid into its place.\n\nInsertion Sort does the same. The first item alone counts as a sorted part. Then each next item is taken out and inserted where it belongs.`,
                op: `SORT_START INSERTION (${raw.n} items)`,
            });
        case 'TAKE_KEY':
            keys++;
            keyCompares = 0;
            return base(raw, {
                kind: 'takeKey', title: `Take out ${kg(raw.key)} - the KEY`,
                text: `Sorted part: ${raw.a === 1 ? 'position 1' : `positions 1-${raw.a}`}. We lift ${kg(raw.key)} ${items[raw.keyId]} out of position ${P(raw.a)}. It is the KEY we will insert.\n\nIts spot is now an empty GAP. We will look left from the gap.`,
                op: `key = a[${raw.a}] = ${raw.key}`,
                brief: `took key ${kg(raw.key)}`,
            });
        case 'COMPARE': {
            compares++;
            keyCompares++;
            const larger = raw.result === 1;
            const step = base(raw, {
                kind: 'compare', title: `Is ${kg(v(raw.a))} heavier than the key?`,
                text: larger
                    ? `${kg(v(raw.a))} is heavier than the key (${kg(raw.key)}), so it belongs to the RIGHT of the key. It must shift one place right to make room.`
                    : `${kg(v(raw.a))} is not heavier than the key (${kg(raw.key)}). The sorted items further left are no heavier, so the key belongs right here, in the gap.${v(raw.a) === raw.key ? ' (Equal items keep their order.)' : ''}`,
                op: `a[${raw.a}] > key ? ${v(raw.a)} > ${raw.key} → ${larger ? 'shift' : 'stop'}`,
                brief: `${v(raw.a)} vs key ${raw.key}: ${larger ? 'shift' : 'stop'}`,
            });
            if (compares === 1 || compares === 3 || compares === 5) {
                step.question = {
                    showStep: true,
                    prompt: `The key is ${kg(raw.key)}. To the left of the gap is ${kg(v(raw.a))}.\nDoes ${kg(v(raw.a))} need to shift right?`,
                    choices: yesNo(larger, `Yes: ${v(raw.a)} > ${raw.key}, so it moves right to make room.`,
                        `No: ${v(raw.a)} is not heavier than the key. Only HEAVIER items shift; the key stops here.`),
                };
            }
            return step;
        }
        case 'SHIFT':
            return base(raw, {
                kind: 'shift', title: `Shift ${kg(v(raw.b))} right`,
                text: `${kg(v(raw.b))} slides one place right, into the gap. The gap moves one place LEFT, to position ${P(raw.a)}.\n\nThis is a SHIFT, not a swap: the key is held in our hand, so only one item moves.`,
                op: `a[${raw.b}] = a[${raw.a}]  (gap → ${raw.a})`,
                brief: `shifted ${kg(v(raw.b))} right`,
            });
        case 'INSERT': {
            const atFront = raw.result === 1;
            const step = base(raw, {
                kind: 'insert', endsGroup: true, title: `Insert ${kg(v(raw.a))} at position ${P(raw.a)}`,
                text: `${atFront ? 'Nothing is left to compare - the key goes at the very front.' : 'The key drops into the gap.'} The sorted part now covers positions 1-${raw.sortedHi}: ${raw.values.slice(0, raw.sortedHi).join(', ')} kg.`,
                op: `a[${raw.a}] = key (${v(raw.a)})`,
                brief: `inserted ${kg(v(raw.a))} at position ${P(raw.a)}`,
            });
            if (keys === 2 || keys === 4) {
                const cands = [...new Set([raw.a, raw.a + 1, raw.a - 1])].filter(k => k >= 0 && k <= raw.b).sort((x, y) => x - y);
                step.question = {
                    prompt: `Where should the key ${kg(v(raw.a))} be inserted?`,
                    choices: cands.map(k => ({
                        label: `Position ${P(k)}`,
                        correct: k === raw.a,
                        why: k === raw.a ? 'Right: that is where the gap stopped.'
                            : k > raw.a ? `Position ${P(k)} now holds an item heavier than the key - it was shifted right, so the key goes to its left.`
                                : `The item at position ${P(k)} is not heavier than the key, so the key goes after it, not before.`,
                    })),
                };
            }
            return step;
        }
        default:
            return doneStep(raw, 'The rack is sorted!',
                `${raw.values.join(', ')} kg.\n\n${raw.shifts} shifts, ${raw.comparisons} comparisons. Insertion Sort is quick on racks that are almost sorted: an item already in place needs just one comparison and no shifts.`);
        }
    };
}

export const DESCRIBERS = { BUBBLE: makeBubbleDescriber, SELECTION: makeSelectionDescriber, INSERTION: makeInsertionDescriber };

export function summarizeSort(run) {
    return {
        title: `Skipped ahead: ${run.length} operations`,
        text: `Repeated moves, as C performed them:\n${run.filter(s => s.brief).map(s => `• ${s.brief}`).join('\n')}`,
        op: `${run.length} × SORT_STEP`,
    };
}

// The final trial: the decision the player must make BEFORE C's next
// operation is shown, or null when the operation is not a decision.
export function trialQuestion(algorithm, raw, prev, items) {
    const L = (r, i) => label(items, r, i);
    if (algorithm === 'BUBBLE' && raw.op === 'COMPARE') {
        const must = raw.result === 1;
        return {
            prompt: `Compare positions ${P(raw.a)} and ${P(raw.b)}: ${L(raw, raw.a)} | ${L(raw, raw.b)}.\nSwap them?`,
            choices: yesNo(must, `${raw.values[raw.a]} > ${raw.values[raw.b]}: the heavier one is on the left, so swap.`,
                `${raw.values[raw.a]} is not heavier than ${raw.values[raw.b]}: they are already in order. Swap only when the LEFT one is heavier.`),
        };
    }
    if (algorithm === 'SELECTION' && raw.op === 'COMPARE') {
        const lighter = raw.result === 1;
        return {
            prompt: `Current minimum: ${L(prev, raw.b)}. Now checking ${L(prev, raw.a)}.\nIs it a new minimum?`,
            choices: yesNo(lighter, `${raw.values[raw.a]} < ${raw.values[raw.b]}: it is lighter, so it becomes the minimum.`,
                `${raw.values[raw.a]} is not lighter than ${raw.values[raw.b]}. The minimum only changes for a strictly lighter item.`),
        };
    }
    if (algorithm === 'SELECTION' && (raw.op === 'SWAP' || raw.op === 'PLACE')) {
        const unsorted = prev.values.map((_, i) => i).filter(i => i >= raw.a && i !== raw.b);
        return {
            prompt: `Scan finished. Which item goes to position ${P(raw.a)}?`,
            choices: [raw.b, ...unsorted].slice(0, 4).sort((x, y) => x - y).map(i => ({
                label: L(prev, i), correct: i === raw.b,
                why: i === raw.b ? 'The lightest unsorted item goes to the front of the unsorted part.' : `${kg(prev.values[i])} is not the lightest unsorted item - ${kg(prev.values[raw.b])} is.`,
            })),
        };
    }
    if (algorithm === 'INSERTION' && raw.op === 'COMPARE') {
        const larger = raw.result === 1;
        return {
            prompt: `Key: ${kg(raw.key)}. Left of the gap: ${kg(raw.values[raw.a])}.\nShift ${kg(raw.values[raw.a])} right?`,
            choices: yesNo(larger, `${raw.values[raw.a]} > ${raw.key}: heavier items shift right to make room.`,
                `${raw.values[raw.a]} is not heavier than the key, so the key stops here. Only heavier items shift.`),
        };
    }
    return null;
}

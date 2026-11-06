// Lost Path lessons: turns the operation trace recorded by the C engine
// (native/c/bfs.c, dfs.c via search_trace.c) into Walkthrough steps.
//
// Nothing here runs BFS or DFS. Every step comes from one or more trace
// events, and the queue / stack shown in a step is the snapshot C took after
// that operation. The text only explains what C did and why.
//
// ctx: { L(id) -> letter, N(id) -> clearing name, start, shrine }

const BFS_KINDS_SHOWN = 2;   // the first N steps of a kind are always shown in full

const list = ids => ids.join(', ');
const arrow = ids => ids.join(' → ');

// ------------------------------------------------------------------- BFS

export function buildBfsSteps(trace, result, ctx) {
    const { L, N } = ctx;
    const steps = [];
    const seen = { dequeue: 0, explore: 0, level: 0 };
    let queue = [], visited = [], processed = [], order = [], tree = [], current = null, prevLevel = 0;
    const levels = {};
    const state = extra => ({
        algo: 'BFS', current, queue: [...queue], visited: [...visited], processed: [...processed],
        order: [...order], tree: tree.map(t => [...t]), levels: { ...levels }, examined: [], path: [], ...extra,
    });

    for (let i = 0; i < trace.length; i++) {
        const e = trace[i];
        if (e.op === 'START') {
            queue = [...e.queue];
            visited.push(e.node);
            levels[e.node] = 0;
            steps.push({
                kind: 'init', skippable: false,
                title: `Start at ${L(e.node)} (${N(e.node)})`,
                text: `We begin at our starting clearing ${L(e.node)}. Before exploring anything we mark ${L(e.node)} as VISITED and put it in the QUEUE.\n\nA queue is a waiting line: newly found clearings join at the REAR, and BFS always takes the next clearing from the FRONT (first in, first out).`,
                op: `visited[${L(e.node)}] = 1; queue_enqueue(${L(e.node)})`,
                state: state(),
            });
        } else if (e.op === 'DEQUEUE') {
            const u = e.node;
            const before = [...queue];
            queue = [...e.queue];
            current = u;
            const lv = levels[u];
            const levelUp = order.length > 0 && lv > prevLevel;
            const n = ++seen.dequeue;
            if (levelUp) seen.level++;
            let title = `Dequeue ${L(u)}`, text;
            if (order.length === 0) {
                text = `We remove ${L(u)} from the FRONT of the queue: it is the next clearing waiting to be explored. ${L(u)} becomes the CURRENT clearing.\n\nThe queue is empty for a moment; exploring ${L(u)} will refill it.`;
            } else if (levelUp) {
                const prevLv = order.filter(id => levels[id] === prevLevel).map(L);
                title = `Dequeue ${L(u)} — level ${lv} begins`;
                text = `Every clearing on level ${prevLevel} (${list(prevLv)}) has been explored. The clearing now at the front, ${L(u)} (${N(u)}), is ${lv} trail${lv > 1 ? 's' : ''} from ${L(ctx.start)}.\n\nBFS never starts level ${lv} until level ${prevLevel} is finished: the queue keeps clearings in the order they were found, and nearer clearings are always found first.`;
            } else {
                text = `${L(u)} (${N(u)}) is at the FRONT of the queue, so it is removed next. It joined the queue when we explored ${L(e.other)}${before.length > 1 ? `, before ${list(before.slice(1).map(L))}` : ''}.\n\nBFS processes clearings in exactly the order they entered the queue.`;
            }
            order.push(u);   // C records the visit order at dequeue time
            const step = {
                kind: 'dequeue', boundary: levelUp,
                skippable: n > BFS_KINDS_SHOWN && !(levelUp && seen.level <= 2) && u !== ctx.goal,
                title, text, brief: null,
                op: `queue_dequeue(&frontier) → ${L(u)}`,
                state: state(),
            };
            // prediction: which clearing leaves the queue next?
            if ((n === 2 || n === 4) && before.length >= 2) {
                const front = before[0];
                step.question = {
                    prompt: `Queue (front ▸ rear): ${before.map(L).join('  ')}\nWhich clearing will BFS remove from the queue next?`,
                    choices: before.slice(0, 3).reverse().map(id => id === front
                        ? { label: `${L(id)} — ${N(id)}`, correct: true, why: `Right: ${L(id)} has waited longest, so it is at the front.` }
                        : { label: `${L(id)} — ${N(id)}`, correct: false, why: `${L(id)} is in the queue, but behind ${L(front)}. ${L(front)} entered earlier, and a queue always serves its FRONT first.` }),
                };
            }
            steps.push(step);
            prevLevel = lv;
        } else if (e.op === 'CHECK') {
            // gather this node's whole neighbour scan into ONE explore step
            const u = e.node;
            const lines = [], examined = [], added = [];
            let j = i;
            for (; j < trace.length && trace[j].op !== 'DONE'; j++) {
                const c = trace[j];
                if (c.op === 'CHECK') {
                    examined.push({ from: u, to: c.other, fresh: c.flag === 0 });
                    lines.push(c.flag
                        ? `• ${L(c.other)} ${N(c.other)} — already visited, ignore`
                        : `• ${L(c.other)} ${N(c.other)} — NEW: mark visited, add to rear`);
                } else if (c.op === 'DISCOVER') {
                    added.push(c.node);
                    visited.push(c.node);
                    levels[c.node] = levels[u] + 1;
                    tree.push([u, c.node]);
                    queue = [...c.queue];
                }
            }
            i = j;   // DONE
            processed.push(u);
            const n = ++seen.explore;
            let text = `${L(u)}'s trails, in the order C stores them in its adjacency list:\n${lines.join('\n')}\n\n`;
            text += added.length
                ? `Queue now (front ▸ rear): ${queue.map(L).join(' ')}.`
                : `Nothing new: every neighbour was already discovered, so the queue just got shorter.`;
            if (n === 1) {
                text += `\n\nWe mark a clearing visited the moment it is DISCOVERED, not when it leaves the queue — so no clearing can enter the queue twice. ${list(added.map(L))} are 1 trail from ${L(u)}: they form LEVEL 1.`;
            }
            steps.push({
                kind: 'explore', skippable: n > BFS_KINDS_SHOWN,
                title: `Explore ${L(u)}'s neighbours`,
                text,
                op: added.length ? `for each edge of ${L(u)}: if !visited → visited=1, parent=${L(u)}, queue_enqueue  (×${added.length})` : `for each edge of ${L(u)}: all visited, nothing enqueued`,
                brief: `${L(u)}: ${added.length ? `added ${list(added.map(L))}` : 'nothing new'}`,
                state: state({ examined }),
            });
        } else if (e.op === 'GOAL') {
            const path = result.path;
            processed.push(e.node);
            steps.push({
                kind: 'goal', skippable: false,
                title: `${N(e.node)} reached!`,
                text: `${L(e.node)} (${N(e.node)}) is at the front of the queue — it is our destination, so BFS stops.\n\nFollowing each clearing back to the one that discovered it gives the route ${arrow(path.map(L))}: ${path.length - 1} trails.\n\nBFS handled the forest level by level and found the shrine on level ${levels[e.node]}. A shorter route would have put it on an earlier level, so this route has the FEWEST trails.`,
                op: `u == goal → path_result_build(parent[]) → ${path.length - 1} hops`,
                state: state({ path }),
                question: {
                    prompt: `BFS found ${N(e.node)} on level ${levels[e.node]}. Could another route reach it in fewer than ${levels[e.node]} trails?`,
                    choices: [
                        { label: 'Yes — BFS may have missed it', correct: false, why: `No: BFS finishes every clearing of one level before the next. A ${levels[e.node] - 1}-trail route would have put the shrine on level ${levels[e.node] - 1}, and BFS would have found it there.` },
                        { label: 'No — it would be on an earlier level', correct: true, why: 'Exactly: level = number of trails from the start, and BFS reaches levels in order.' },
                    ],
                },
            });
        } else if (e.op === 'EXHAUSTED') {
            steps.push({
                kind: 'done', skippable: false,
                title: 'Queue empty — every clearing explored',
                text: `The queue is empty: every clearing reachable from ${L(ctx.start)} has been explored, level by level.\n\nBFS order: ${order.map(L).join(' ')}`,
                op: 'queue_dequeue() fails → loop ends',
                state: state({ current: null }),
            });
        }
    }
    return steps;
}

export function summarizeBfs(run, { L }) {
    const nodes = run.filter(s => s.kind === 'dequeue').map(s => L(s.state.current));
    const briefs = run.filter(s => s.brief).map(s => `• ${s.brief}`);
    const last = run.at(-1).state;
    return {
        title: `Skipped ahead: explored ${list(nodes)}`,
        text: `We have now explored ${list(nodes)}. Each one was removed from the FRONT of the queue, and its unvisited neighbours were marked visited and added to the REAR:\n${briefs.join('\n')}\n\nQueue now (front ▸ rear): ${last.queue.map(L).join(' ') || '(empty)'}`,
        op: `${nodes.length} × queue_dequeue, ${run.reduce((n, s) => n + (s.brief?.match(/added (.*)/)?.[1].split(', ').length ?? 0), 0)} × queue_enqueue`,
    };
}

// ------------------------------------------------------------------- DFS

export function buildDfsSteps(trace, ctx) {
    const { L, N } = ctx;
    const steps = [];
    const seen = {};
    let stack = [], visited = [], order = [], tree = [], dead = [], current = null, lastVisited = null;
    const parent = {};
    const branchTo = id => {
        const b = [];
        for (let v = id; v != null; v = parent[v]) b.unshift(v);
        return b;
    };
    const state = extra => ({
        algo: 'DFS', current, stack: stack.map(s => ({ ...s })), visited: [...visited], order: [...order],
        tree: tree.map(t => [...t]), dead: [...dead], branch: current ? branchTo(current) : [], examined: [], path: [], ...extra,
    });
    const add = (kind, shownInFull, step) => {
        seen[kind] = (seen[kind] ?? 0) + 1;
        steps.push({ kind, skippable: seen[kind] > shownInFull, ...step });
    };
    const entry = s => `${L(s.node)}←${s.from ? L(s.from) : '·'}`;

    for (let i = 0; i < trace.length; i++) {
        const e = trace[i];
        if (e.op === 'START') {
            stack = [...e.stack];
            add('init', Infinity, {
                title: `Start: push ${L(e.node)} (${N(e.node)})`,
                text: `DFS also keeps a list of places still to explore, but it uses a STACK — like a pile of plates: the entry put on TOP last is the first one taken off (last in, first out).\n\nWe push ${L(e.node)} onto the stack. Each entry remembers who pushed it, written "D←B" (D, pushed while exploring B).`,
                op: `stack_push(${L(e.node)})`,
                state: state(),
            });
        } else if (e.op === 'POP') {
            const u = e.node, by = e.other;
            const before = [...stack];
            stack = [...e.stack];
            const next = trace[i + 1];
            if (next?.op === 'SKIP') {
                i++;
                current = null;
                const n = (seen.stale ?? 0) + 1;
                const step = {
                    title: `Pop ${L(u)} — already visited`,
                    text: `The top entry is ${L(u)}←${L(by)}: ${L(u)} was pushed while we explored ${L(by)}. Since then ${L(u)} has been visited through another trail.\n\nVisiting it again would repeat work (and, in a graph with loops, could go round forever), so the entry is thrown away. Discarding stale entries is how DFS backs up toward older branches — here, past ${L(by)}.`,
                    op: `stack_pop() → ${L(u)}←${L(by)};  visited[${L(u)}] → skip`,
                    brief: `discarded ${L(u)}←${L(by)} (already visited)`,
                    state: state(),
                };
                if (n === 1) {
                    step.question = {
                        prompt: `The top entry is ${L(u)}←${L(by)}, but ${L(u)} is already visited. What happens?`,
                        choices: [
                            { label: `Visit ${L(u)} again`, correct: false, why: `No: ${L(u)} is already in the traversal. Visiting twice repeats work and could loop forever on a cycle — the visited check exists to stop that.` },
                            { label: 'Discard it and pop the next entry', correct: true, why: 'Right: a stale entry is simply thrown away.' },
                        ],
                        state: { ...state(), stack: before },
                    };
                }
                add('stale', 1, step);
                continue;
            }
            // POP followed by VISIT
            i++;
            visited.push(u);
            order.push(u);
            parent[u] = by;
            if (by) tree.push([by, u]);
            current = u;
            const num = order.length;
            const isFirst = num === 1;
            const backtrack = !isFirst && by !== lastVisited;
            let kind, title, text;
            if (isFirst) {
                kind = 'visit';
                title = `Pop ${L(u)} and visit it`;
                text = `${L(u)} is the only entry, so we pop it. ${L(u)} has not been visited yet: mark it VISITED. It is #1 in the traversal order.`;
            } else if (backtrack) {
                kind = 'backtrack';
                title = `Backtrack to ${L(by)} — pop ${L(u)}`;
                text = `The top entry is ${L(u)}←${L(by)}. It was pushed earlier, while we explored ${L(by)}.\n\nSo DFS has gone BACK to ${L(by)} and now follows ${L(by)}'s next untried trail, to ${L(u)} (${N(u)}). ${L(u)} is unvisited: mark it visited (#${num}).`;
            } else {
                kind = 'visit';
                title = `Pop ${L(u)} — go deeper`;
                text = `${L(u)}←${L(by)} is on TOP of the stack (it was pushed last), so it comes off first. ${L(by)} is the clearing we just explored, so DFS follows this trail one step DEEPER instead of trying ${L(by)}'s other neighbours first.\n\nMark ${L(u)} (${N(u)}) visited (#${num}).`;
                if (num === 2) text += ` ${list(stack.map(s => L(s.node)))} still wait${stack.length === 1 ? 's' : ''} on the stack — we come back to ${stack.length === 1 ? 'it' : 'them'} later.`;
            }
            if (u === ctx.shrine) {
                kind = 'shrine';
                const b = branchTo(u);
                text += `\n\nThis is the ${N(u).toUpperCase()}! DFS reached it along ${arrow(b.map(L))} — ${b.length - 1} trails. DFS does not look for the shortest route; it follows whichever branch it is on. Our job is to map EVERY clearing, so DFS keeps going.`;
            }
            const step = {
                title, text, boundary: backtrack,
                op: `stack_pop() → ${L(u)}←${by ? L(by) : '·'};  visited[${L(u)}] = 1`,
                brief: backtrack ? `back to ${L(by)}: popped ${L(u)} → visit #${num}` : `popped ${L(u)}←${by ? L(by) : '·'} → visit #${num}`,
                state: state(),
            };
            if (num === 2 && before.length >= 2) {
                step.question = {
                    prompt: `Stack (top first): ${before.map(entry).join('  ')}\nWhich entry will DFS pop next?`,
                    choices: [...before.slice(0, 3)].reverse().map((s, k, arr) => k === arr.length - 1
                        ? { label: entry(s), correct: true, why: `Right: ${L(s.node)} was pushed last, so it is on top.` }
                        : { label: entry(s), correct: false, why: `${L(s.node)} was pushed EARLIER, so it lies underneath ${L(before[0].node)}. A stack only gives back its top entry: last in, first out.` }),
                };
            }
            add(kind, kind === 'visit' ? 3 : kind === 'shrine' ? Infinity : 1, step);
            lastVisited = u;
        } else if (e.op === 'CHECK') {
            const u = e.node;
            const examined = [], fresh = [], old = [];
            let j = i, pushed = [];
            for (; j < trace.length && trace[j].op !== 'DONE'; j++) {
                const c = trace[j];
                if (c.op === 'CHECK') {
                    examined.push({ from: u, to: c.other, fresh: c.flag === 0 });
                    (c.flag ? old : fresh).push(c.other);
                } else if (c.op === 'PUSH') {
                    pushed.push(c.node);
                    stack = [...c.stack];
                }
            }
            i = j;
            const lines = examined.map(x => `• ${L(x.to)} ${N(x.to)} — ${x.fresh ? 'not visited: push' : 'visited, skip'}`);
            if (!fresh.length) {
                dead.push(u);
                const step = {
                    title: `Dead end at ${L(u)}`,
                    text: `${L(u)}'s trails lead to ${list(old.map(L))} — all already visited. Nothing is pushed.\n\nDFS cannot go any deeper from ${L(u)}, so it must BACKTRACK: the next pop takes an entry pushed by an EARLIER clearing (top now: ${stack[0] ? entry(stack[0]) : 'none'}).`,
                    op: `for each edge of ${L(u)}: visited → no push`,
                    brief: `${L(u)}: dead end`,
                    state: state({ examined }),
                };
                if ((seen.deadend ?? 0) === 0) {
                    step.question = {
                        prompt: `${L(u)}'s neighbours (${list(old.map(L))}) are all visited. What does DFS do now?`,
                        choices: [
                            { label: 'Start again from the beginning', correct: false, why: 'No need: the stack already remembers where every untried branch begins. Restarting would repeat all the work.' },
                            { label: 'Stop: the traversal is over', correct: false, why: `Not yet: the stack is not empty (${stack.length} entr${stack.length === 1 ? 'y' : 'ies'} left). DFS stops only when the stack is empty.` },
                            { label: 'Pop the next entry (backtrack)', correct: true, why: 'Right: popping returns to the most recent clearing that still had untried trails.' },
                        ],
                    };
                }
                add('deadend', 1, step);
                continue;
            }
            const already = pushed.filter(v => stack.filter(s => s.node === v).length > 1);
            let text = `${L(u)}'s trails, in the order C stores them:\n${lines.join('\n')}\n\n`;
            text += pushed.length > 1
                ? `We push them in REVERSE order (${list(pushed.map(L))}) so that ${L(pushed.at(-1))} — first in ${L(u)}'s list — ends up on TOP and is explored next.`
                : `Push ${L(pushed[0])}. It is now on top, so it is explored next.`;
            const firstDuplicate = already.length && !seen.duplicate;
            if (firstDuplicate) {
                seen.duplicate = 1;
                text += `\n\nNotice ${list(already.map(L))} is now on the stack twice. This DFS does not search the stack before pushing; it checks "visited" when an entry is POPPED and throws stale copies away then.`;
            }
            add('push', 2, {
                title: `Look at ${L(u)}'s trails`,
                text,
                op: `stack_push(${pushed.map(v => `${L(v)}←${L(u)}`).join('), stack_push(')})`,
                brief: `${L(u)}: pushed ${list(pushed.map(L))}`,
                state: state({ examined }),
            });
            if (firstDuplicate) steps.at(-1).skippable = false;   // explains the stale entries met later
        } else if (e.op === 'EXHAUSTED') {
            current = null;
            add('done', Infinity, {
                title: 'Stack empty — traversal complete',
                text: `The stack is empty, so every clearing reachable from ${L(ctx.start)} has been visited.\n\nDFS order: ${order.map(L).join(' ')}\n\nIt dived down one branch until a dead end (${list(dead.map(L))}), then backtracked to the most recent clearing with an untried trail.`,
                op: 'stack_pop() fails → loop ends',
                state: state(),
            });
        }
    }
    return steps;
}

export function summarizeDfs(run, { L }) {
    const visits = run.filter(s => s.kind === 'visit' || s.kind === 'backtrack').map(s => L(s.state.current));
    return {
        title: `Skipped ahead: ${run.length} operations`,
        text: `DFS repeated moves you have already seen. In order:\n${run.map(s => `• ${s.brief}`).join('\n')}\n\n${visits.length ? `Newly visited: ${list(visits)}.` : 'No new clearing was visited.'}`,
        op: `${run.length} steps of stack_pop / stack_push`,
    };
}

// ------------------------------------------------------------ comparison

export function buildCompareSteps({ bfs, dfs, bfsLevels, dfsTree, dfsShrinePath }, ctx) {
    const { L, N } = ctx;
    const shrine = ctx.shrine;
    const base = { algo: 'COMPARE', bfsOrder: bfs.visitOrder, dfsOrder: dfs.visitOrder, levels: bfsLevels, dfsTree };
    const pos = (order, id) => order.indexOf(id) + 1;
    return [
        {
            kind: 'compare', title: 'Same forest, two orders',
            text: `Both searches started at ${L(ctx.start)} and read each clearing's trails in the same order. Only the waiting list differed.\n\nBFS (gold numbers): ${bfs.visitOrder.map(L).join(' ')}\nDFS (purple numbers): ${dfs.visitOrder.map(L).join(' ')}\n\nLook at ${L(dfs.visitOrder[2])}: DFS took it #3, BFS only #${pos(bfs.visitOrder, dfs.visitOrder[2])}.`,
            op: 'bfs_search_traced() vs dfs_search_traced() on the same graph',
            state: { ...base, show: 'orders' },
        },
        {
            kind: 'compare', title: 'Why BFS goes level by level',
            text: `The QUEUE hands clearings back in the order they were discovered. ${L(ctx.start)}'s neighbours were discovered first, so all of them were processed before any clearing two trails away.\n\nThe small numbers now show each clearing's LEVEL — its distance in trails from ${L(ctx.start)}. BFS's order never goes down a level.`,
            op: 'queue_enqueue() adds at the rear, queue_dequeue() takes the front',
            state: { ...base, show: 'levels' },
        },
        {
            kind: 'compare', title: 'Why DFS dives deep',
            text: `The STACK hands back the entry pushed LAST — a neighbour of the clearing we just visited. So DFS keeps extending the same branch (purple lines) until a dead end, and only then backtracks.\n\n${pos(dfs.visitOrder, bfs.visitOrder[2]) > 7 ? `That is why DFS reached ${L(dfs.visitOrder[6])} (#7) before ${L(bfs.visitOrder[2])} (#${pos(dfs.visitOrder, bfs.visitOrder[2])}), even though ${L(bfs.visitOrder[2])} is a neighbour of the start.` : ''}`,
            op: 'stack_push() and stack_pop() both use the top',
            state: { ...base, show: 'dfsTree' },
        },
        {
            kind: 'compare', title: 'Shortest route: BFS wins',
            text: `Routes to the ${N(shrine)}:\nBFS (gold): ${arrow(bfs.path.map(L))} — ${bfs.path.length - 1} trails\nDFS (purple): ${arrow(dfsShrinePath.map(L))} — ${dfsShrinePath.length - 1} trails\n\nIn an unweighted graph BFS's first arrival always uses the fewest trails. DFS arrives along whichever branch it happened to dive into, so it gives no such guarantee.`,
            op: 'PATH BFS / PATH DFS → hops',
            state: { ...base, show: 'paths', bfsPath: bfs.path, dfsPath: dfsShrinePath },
            question: {
                prompt: 'You must reach a place using the FEWEST trails. Which search do you use?',
                choices: [
                    { label: 'DFS — it dives straight in', correct: false, why: `Diving is not the same as shortest: here DFS's route was ${dfsShrinePath.length - 1} trails, BFS's ${bfs.path.length - 1}.` },
                    { label: 'BFS — it explores level by level', correct: true, why: 'Yes: the first time BFS reaches a place, it is by the fewest trails.' },
                ],
                state: { ...base, show: 'orders' },
            },
        },
        {
            kind: 'compare', title: 'So which one?',
            text: 'BFS — uses a QUEUE, explores level by level, finds the fewest-trails route in an unweighted graph.\n\nDFS — uses a STACK (or recursion), follows one branch deep and backtracks at dead ends. Natural for exploring everything, mazes and puzzles, and checking what is connected — but it does not promise the shortest route.\n\nBoth visit every reachable clearing exactly once.',
            op: null,
            state: { ...base, show: 'paths', bfsPath: bfs.path, dfsPath: dfsShrinePath },
        },
    ].map(s => ({ skippable: false, ...s }));
}

// OnlinePanels - leaderboard, save-score and feedback panels.
//
// These are small HTML overlays above the canvas (not Phaser objects) because
// they need real text inputs. While one is open the game's keyboard is
// switched off, so typing W/A/S/D or E into a field never moves the hero.
// Everything the server sends is inserted as TEXT (textContent), never HTML.
import { LIMITS, SCORING, cleanPlayerName, formatDuration, playerNameProblem } from '../data/scoring.js';
import { DEFAULT_PLAYER_NAME } from '../systems/Adventure.js';

const CSS = `
.qf-overlay{position:fixed;inset:0;background:rgba(5,10,20,.72);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;box-sizing:border-box;font-family:monospace}
.qf-card{background:#14213d;color:#e0e1dd;border:3px solid #e5c07b;border-radius:8px;width:min(560px,100%);max-height:100%;overflow:auto;padding:20px 22px;box-sizing:border-box;box-shadow:0 10px 40px rgba(0,0,0,.6)}
.qf-card h2{margin:0 0 4px;color:#e5c07b;font-size:22px}
.qf-sub{margin:0 0 14px;color:#8d99ae;font-size:12px;line-height:1.5}
.qf-card label{display:block;font-size:13px;margin:12px 0 4px;color:#c9d1d9}
.qf-card input,.qf-card textarea{width:100%;box-sizing:border-box;background:#0d1b2a;color:#fff;border:2px solid #4a5568;border-radius:4px;padding:8px;font:14px monospace}
.qf-card input:focus,.qf-card textarea:focus{outline:none;border-color:#4cc9f0}
.qf-card textarea{min-height:110px;resize:vertical}
.qf-row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
.qf-btn{background:#264653;color:#fff;border:2px solid #e5c07b;border-radius:4px;padding:8px 14px;font:bold 13px monospace;cursor:pointer}
.qf-btn:hover:not(:disabled){background:#2a9d8f}
.qf-btn:disabled{opacity:.45;cursor:default}
.qf-btn.qf-quiet{border-color:#4a5568}
.qf-msg{min-height:18px;font-size:13px;margin-top:10px;line-height:1.4}
.qf-msg.qf-bad{color:#ff6b6b}.qf-msg.qf-good{color:#52b788}
.qf-note{font-size:11px;color:#8d99ae;margin-top:10px;line-height:1.5}
.qf-note.qf-warn{color:#ffd166}
.qf-table{width:100%;border-collapse:collapse;font-size:13px}
.qf-table th{color:#8d99ae;font-weight:normal;text-align:left;padding:4px 6px;border-bottom:1px solid #4a5568}
.qf-table td{padding:6px;border-bottom:1px solid #22314d}
.qf-table td.n{text-align:right}.qf-table th.n{text-align:right}
.qf-table tr.qf-me td{color:#ffd60a;font-weight:bold}
.qf-stars{display:flex;gap:6px}
.qf-star{background:none;border:none;font-size:28px;line-height:1;cursor:pointer;color:#4a5568;padding:0 2px}
.qf-star.on{color:#ffd60a}
.qf-star:focus-visible{outline:2px solid #4cc9f0}
.qf-break{font-size:13px;line-height:1.7;background:#0d1b2a;border-radius:4px;padding:8px 12px}
.qf-break b{color:#ffd60a}
.qf-count{float:right;color:#8d99ae;font-size:11px}
`;

function injectCss() {
    if (document.getElementById('qf-online-css')) return;
    const style = document.createElement('style');
    style.id = 'qf-online-css';
    style.textContent = CSS;
    document.head.appendChild(style);
}

// el('div.qf-row', {attrs}, children...)
function el(spec, attrs = {}, ...children) {
    const [tag, ...classes] = spec.split('.');
    const node = document.createElement(tag);
    if (classes.length) node.className = classes.join(' ');
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'text') node.textContent = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
}

// Replace a card's content; null entries (e.g. no storage warning) are skipped.
function fill(card, ...nodes) {
    card.replaceChildren(...nodes.filter(n => n != null));
}

let openCount = 0;

// Opens a modal card. build(card, close) fills it. Resolves with close(value).
// dismissable: false -> Escape / clicking outside do not close it.
function modal(game, build, { dismissable = true } = {}) {
    injectCss();
    const keyboard = game?.input?.keyboard;
    openCount++;
    if (keyboard) keyboard.enabled = false;
    return new Promise(resolve => {
        const overlay = el('div.qf-overlay', { role: 'dialog', 'aria-modal': 'true' });
        const card = el('div.qf-card');
        overlay.append(card);
        let closed = false;
        const close = value => {
            if (closed) return;
            closed = true;
            overlay.remove();
            if (--openCount === 0 && keyboard) keyboard.enabled = true;
            resolve(value);
        };
        // keys typed here never reach Phaser (it listens on window)
        overlay.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Escape' && dismissable) close(null);
        });
        overlay.addEventListener('keyup', e => e.stopPropagation());
        overlay.addEventListener('mousedown', e => { if (dismissable && e.target === overlay) close(null); });
        build(card, close);
        document.body.append(overlay);
        (card.querySelector('[autofocus]') ?? card.querySelector('input,textarea,button'))?.focus();
    });
}

export function isPanelOpen() {
    return openCount > 0;
}

function storageNote(info) {
    if (!info || info.persistent) return null;
    return el('div.qf-note.qf-warn', { text: 'This server has no database configured (MONGODB_URI), so scores and feedback are kept in memory only and disappear when the server stops.' });
}

function errorText(err) {
    if (err?.code === 'NETWORK') return 'Cannot reach the QuestForge server.';
    return err?.message || 'Something went wrong.';
}

// ---- Name (title screen, before choosing a character) ----------------------

// Resolves with the cleaned name, or null if cancelled (canCancel: only when
// changing a name the player already has).
export function askName(game, { initial = '', canCancel = false } = {}) {
    return modal(game, (card, close) => {
        const input = el('input', { type: 'text', maxlength: String(LIMITS.nameMax), value: initial, placeholder: 'e.g. FerrariDuck',
            autocomplete: 'nickname', autofocus: true, 'aria-label': 'Your name' });
        const msg = el('div.qf-msg');
        const ok = el('button.qf-btn', { text: 'Continue' });
        card.append(
            el('h2', { text: 'Enter Your Name' }),
            el('p.qf-sub', { text: `The game calls you by this name, and it is the name shown on the leaderboard when you save your score (1-${LIMITS.nameMax} characters).` }),
            input, msg,
            el('div.qf-row', {}, canCancel ? el('button.qf-btn.qf-quiet', { text: 'Cancel', onclick: () => close(null) }) : null, ok),
        );
        const submit = () => {
            const problem = playerNameProblem(input.value);
            if (problem) { msg.className = 'qf-msg qf-bad'; msg.textContent = problem; input.focus(); return; }
            close(cleanPlayerName(input.value));
        };
        ok.addEventListener('click', submit);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    }, { dismissable: canCancel });
}

// ---- Leaderboard -----------------------------------------------------------

export function showLeaderboard(game, api, { highlight = null } = {}) {
    return modal(game, (card, close) => {
        const body = el('div', { text: 'Loading…' });
        card.append(
            el('h2', { text: 'Leaderboard' }),
            el('p.qf-sub', { text: `Each explorer's best finished journey. Score = ${SCORING.perQuest} per quest + up to ${SCORING.accuracyMax} for first-try answers + ${SCORING.perBonusCoin} per bonus coin. Ties: faster journey first.` }),
            body,
            el('div.qf-row', {}, el('button.qf-btn', { text: 'Close', onclick: () => close(null) })),
        );
        api.leaderboard(10).then(res => {
            body.replaceChildren();
            if (!res.entries.length) body.append(el('p', { text: 'No journeys saved yet - be the first!' }));
            else {
                const head = el('tr', {}, ['#', 'Explorer', 'Score', 'First try', 'Time'].map((h, i) =>
                    el(i === 0 || i >= 2 ? 'th.n' : 'th', { text: h })));
                const rows = res.entries.map(e => el(`tr${highlight && e.name.toLowerCase() === highlight.toLowerCase() ? '.qf-me' : ''}`, {},
                    el('td.n', { text: String(e.rank) }),
                    el('td', { text: e.name }),
                    el('td.n', { text: String(e.score) }),
                    el('td.n', { text: e.questionsAsked ? `${e.firstTryCorrect}/${e.questionsAsked}` : '-' }),
                    el('td.n', { text: formatDuration(e.timeMs) })));
                body.append(el('table.qf-table', {}, el('thead', {}, head), el('tbody', {}, rows)));
            }
            const note = storageNote(res);
            if (note) body.append(note);
        }).catch(err => {
            body.replaceChildren(el('p.qf-msg.qf-bad', { text: `Could not load the leaderboard: ${errorText(err)}` }));
        });
    });
}

// ---- Save score ------------------------------------------------------------

// run: services.leaderboardRun(stats). Resolves with the server reply, or null.
export function showSaveScore(game, api, { run, defaultName = '', onSaved = null }) {
    return modal(game, (card, close) => {
        const name = el('input', { type: 'text', maxlength: String(LIMITS.nameMax), value: defaultName === DEFAULT_PLAYER_NAME ? '' : defaultName,
            placeholder: 'Your explorer name', autocomplete: 'nickname', autofocus: true, 'aria-label': 'Explorer name' });
        const msg = el('div.qf-msg');
        const save = el('button.qf-btn', { text: 'Save score' });
        const s = run.score;
        card.append(
            el('h2', { text: 'Save your score' }),
            el('p.qf-sub', { text: 'Your name and this journey\'s numbers will be shown on the public leaderboard.' }),
            el('div.qf-break', {},
                el('div', {}, el('b', { text: String(s.total) }), ' points'),
                el('div', { text: `${run.questsCompleted}/${run.questsTotal} quests ×${SCORING.perQuest} = ${s.quests}` }),
                el('div', { text: `first-try answers ${run.firstTryCorrect}/${run.questionsAsked} = ${s.accuracy} / ${SCORING.accuracyMax}` }),
                el('div', { text: `${run.bonusCoins} bonus coins ×${SCORING.perBonusCoin} = ${s.bonus}` }),
                el('div', { text: `journey time ${formatDuration(run.timeMs)} (tie-breaker)` })),
            el('label', { text: `Explorer name (1-${LIMITS.nameMax} characters)` }), name,
            msg,
            el('div.qf-row', {}, el('button.qf-btn.qf-quiet', { text: 'Cancel', onclick: () => close(null) }), save),
        );
        const submit = async () => {
            const n = name.value.trim();
            if (!n) { msg.className = 'qf-msg qf-bad'; msg.textContent = 'Please enter a name.'; name.focus(); return; }
            save.disabled = true;
            msg.className = 'qf-msg'; msg.textContent = 'Saving…';
            try {
                const res = await api.submitScore({ ...run, name: n, score: undefined });
                onSaved?.(res, n);
                fill(card,
                    el('h2', { text: res.personalBest ? 'Score saved - personal best!' : 'Score saved' }),
                    el('p', { text: `${res.entry.name}: ${res.entry.score} points.` }),
                    el('p', { text: res.personalBest
                        ? `You are #${res.rank} of ${res.players} explorer${res.players === 1 ? '' : 's'}.`
                        : `Your best is still ${res.previousBest.score} points (#${res.rank} of ${res.players}).` }),
                    storageNote(res),
                    el('div.qf-row', {},
                        el('button.qf-btn.qf-quiet', { text: 'Close', onclick: () => close(res) }),
                        el('button.qf-btn', { text: 'View leaderboard', autofocus: true, onclick: () => { close(res); showLeaderboard(game, api, { highlight: n }); } })),
                );
                card.querySelector('[autofocus]')?.focus();
            } catch (err) {
                save.disabled = false;
                msg.className = 'qf-msg qf-bad';
                msg.textContent = errorText(err);
            }
        };
        save.addEventListener('click', submit);
        name.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    });
}

// ---- Feedback --------------------------------------------------------------

export function showFeedback(game, api, { name = '', context = 'title' } = {}) {
    return modal(game, (card, close) => {
        let rating = 0;
        const stars = [1, 2, 3, 4, 5].map(n => el('button.qf-star', { type: 'button', text: '★', 'aria-label': `${n} star${n > 1 ? 's' : ''}`, onclick: () => setRating(n) }));
        const setRating = n => {
            rating = n;
            stars.forEach((b, i) => { b.classList.toggle('on', i < n); b.setAttribute('aria-pressed', String(i < n)); });
        };
        const count = el('span.qf-count', { text: `0/${LIMITS.messageMax}` });
        const message = el('textarea', { maxlength: String(LIMITS.messageMax), placeholder: 'What did you enjoy? What was confusing? Any bugs?', 'aria-label': 'Feedback message' });
        message.addEventListener('input', () => { count.textContent = `${message.value.length}/${LIMITS.messageMax}`; });
        const nameInput = el('input', { type: 'text', maxlength: String(LIMITS.nameMax), value: name === DEFAULT_PLAYER_NAME ? '' : name, placeholder: 'optional', 'aria-label': 'Your name (optional)' });
        const msg = el('div.qf-msg');
        const send = el('button.qf-btn', { text: 'Send feedback' });
        card.append(
            el('h2', { text: 'Send us feedback' }),
            el('p.qf-sub', { text: 'Only the QuestForge team reads this. We store your rating, message, the name if you give one, and the date - nothing else.' }),
            el('label', { text: 'How was QuestForge?' }), el('div.qf-stars', { role: 'group', 'aria-label': 'Rating' }, stars),
            el('label', {}, 'Message ', count), message,
            el('label', { text: 'Name (optional)' }), nameInput,
            msg,
            el('div.qf-row', {}, el('button.qf-btn.qf-quiet', { text: 'Cancel', onclick: () => close(null) }), send),
        );
        stars[0].setAttribute('autofocus', '');
        send.addEventListener('click', async () => {
            const text = message.value.trim();
            const problem = !rating ? 'Please choose a rating (1-5 stars).'
                : text.length < LIMITS.messageMin ? `Please write at least ${LIMITS.messageMin} characters.` : null;
            if (problem) { msg.className = 'qf-msg qf-bad'; msg.textContent = problem; return; }
            send.disabled = true;
            msg.className = 'qf-msg'; msg.textContent = 'Sending…';
            try {
                const res = await api.sendFeedback({ rating, message: text, name: nameInput.value.trim() || undefined, context });
                fill(card,
                    el('h2', { text: 'Thank you!' }),
                    el('p', { text: 'Your feedback was sent to the QuestForge team.' }),
                    storageNote(res),
                    el('div.qf-row', {}, el('button.qf-btn', { text: 'Close', autofocus: true, onclick: () => close(res) })),
                );
                card.querySelector('[autofocus]')?.focus();
            } catch (err) {
                send.disabled = false;
                msg.className = 'qf-msg qf-bad';
                msg.textContent = errorText(err);
            }
        });
    });
}

// Input validation for everything that is forwarded to a native engine.
// The engines use a space-separated line protocol, so every token must be a
// single word with a restricted character set.

export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.code = 'VALIDATION_ERROR';
    }
}

const TOKEN = /^[A-Za-z0-9_:.,\-]{1,63}$/;
const NAME = /^[A-Za-z0-9_\-]{1,31}$/;
const DISPLAY = /^[A-Za-z0-9 '_\-.]{1,40}$/;

export function token(value, field) {
    const s = String(value ?? '');
    if (!TOKEN.test(s)) throw new ValidationError(`${field} must be 1-63 chars of A-Z a-z 0-9 _ : . , -`);
    return s;
}

export function containerName(value, field = 'name') {
    const s = String(value ?? '');
    if (!NAME.test(s)) throw new ValidationError(`${field} must be 1-31 chars of A-Z a-z 0-9 _ -`);
    return s;
}

export function displayName(value, field = 'name') {
    const s = String(value ?? '').trim();
    if (!DISPLAY.test(s)) throw new ValidationError(`${field} must be 1-40 letters, digits, spaces or ' _ - .`);
    return s;
}

export function int(value, field, { min = -1e9, max = 1e9 } = {}) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${field} must be an integer in [${min}, ${max}]`);
    return n;
}

export function number(value, field) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number`);
    return n;
}

export function oneOf(value, field, options) {
    const s = String(value ?? '').toUpperCase();
    if (!options.includes(s)) throw new ValidationError(`${field} must be one of ${options.join(', ')}`);
    return s;
}

// Shared response handling: native results -> HTTP status codes.

const STATUS_BY_ERROR = {
    VALIDATION_ERROR: 400,
    BAD_ARGS: 400,
    UNKNOWN_TYPE: 400,
    NOT_FOUND: 404,
    QUEST_NOT_FOUND: 404,
    DUPLICATE: 409,
    DUPLICATE_ID: 409,
    DUPLICATE_QUEST: 409,
    STACK_EMPTY: 409,
    QUEUE_EMPTY: 409,
    QUEUE_FULL: 409,
    INVALID_QUEST_STATE: 409,
    NOT_ENOUGH_ITEMS: 409,
    NATIVE_UNAVAILABLE: 503,
};

export function handle(fn) {
    return async (req, res) => {
        try {
            const result = await fn(req);
            if (result && result.ok === false) {
                res.status(STATUS_BY_ERROR[result.error] ?? 500).json(result);
            } else {
                res.json(result);
            }
        } catch (err) {
            const code = err.code ?? 'INTERNAL_ERROR';
            res.status(STATUS_BY_ERROR[code] ?? 500).json({ ok: false, error: code, message: err.message });
        }
    };
}

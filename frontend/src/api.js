/*
 * All requests to the backend pass through here.
 *
 * The ID is carried in an httpOnly session cookie; this code has no effect on the token.
 * There is NO access and no secret is embedded in the package. The browser automatically sends the cookie
 * (credentials: 'include')
 *
 * There is a risk of CSRF because the cookie is sent automatically; backend modifier
 * X-CSRF-Token is waiting for requests. Value, what is written in the input can be read
 * It is obtained from the `csrf_token` cookie
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const DEFAULT_TIMEOUT_MS = 15000;

function readCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
    constructor({ kind, message, status = null, code = null, ref = null, details = null }) {
        super(message);
        this.name = 'ApiError';
        this.kind = kind;
        this.status = status;
        this.code = code;
        this.ref = ref;
        this.details = details;
    }

    get retryable() {
        return ['offline', 'timeout', 'unavailable', 'ratelimit', 'server'].includes(this.kind);
    }
}

/**
 * Converts the HTTP status code into a format that the interface understands and can be displayed to the user.
 * as a message
 *
 * The backend's own message can only be verified (400) and exchanged (409)
 * it is used in situations; such as which area is problematic there
 * the information is only known on the server. In all other cases, the message is here
 * it is fixed, so the interface does not depend on the language/text changes of the backend.
 */
function classify(status, serverMessage) {
    switch (true) {
        case status === 400:
            return { kind: 'validation', message: serverMessage || 'Please check the form and try again.' };
        case status === 401:
            return { kind: 'auth', message: serverMessage || 'Your session has expired. Please sign in again.' };
        case status === 403:
            return { kind: 'forbidden', message: serverMessage || 'You do not have permission to do this.' };
        case status === 404:
            return { kind: 'notfound', message: serverMessage || 'The requested record was not found.' };
        case status === 409:
            return { kind: 'conflict', message: serverMessage || 'A record with these values already exists.' };
        case status === 413:
            return { kind: 'validation', message: 'The submitted data is too large.' };
        case status === 429:
            return { kind: 'ratelimit', message: 'Too many requests. Please wait a moment and try again.' };
        case status === 503:
            return {
                kind: 'unavailable',
                message: 'A required service (database or blockchain node) is temporarily unavailable.',
            };
        case status >= 500:
            return { kind: 'server', message: 'The server ran into a problem. Please try again.' };
        default:
            return { kind: 'server', message: `Unexpected response from the server (${status}).` };
    }
}

async function request(path, { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...options } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
        (options.method || 'GET').toUpperCase()
    );
    const csrf = isMutating ? readCsrfToken() : null;

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            signal: controller.signal,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
                ...options.headers,
            },
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new ApiError({
                kind: 'timeout',
                message: `The server did not respond within ${Math.round(timeoutMs / 1000)} seconds.`,
            });
        }
        throw new ApiError({
            kind: 'offline',
            message: 'Cannot reach the server. Check that the backend is running.',
        });
    } finally {
        clearTimeout(timer);
    }

    let body = null;
    try {
        body = await response.json();
    } catch {

    }

    if (!response.ok) {
        const serverError = body && body.error ? body.error : {};
        const { kind, message } = classify(response.status, serverError.message);
        throw new ApiError({
            kind,
            message,
            status: response.status,
            code: serverError.code || null,
            ref: serverError.ref || null,
            details: serverError.details || null,
        });
    }

    if (!body || body.success !== true) {
        throw new ApiError({
            kind: 'server',
            message: 'The server returned an unexpected response format.',
            status: response.status,
        });
    }

    return body.data;
}

export const login = (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });

export const logout = () => request('/auth/logout', { method: 'POST' });

export const me = (opts) => request('/auth/me', opts);

export const listRecords = (table, opts) => request(`/records/${table}`, opts);

export const createRecord = (table, payload, opts) =>
    request(`/records/${table}`, { ...opts, method: 'POST', body: JSON.stringify(payload) });

export const verifyRecord = (table, recordId, opts) =>
    request(`/verify/${table}/${recordId}`, opts);

export const VERIFY_PRESENTATION = {
    SECURE: { tone: 'secure', icon: '🛡️', title: 'Verified' },
    TAMPERED: { tone: 'danger', icon: '⚠️', title: 'Tampered' },
    FORGED_TX: { tone: 'danger', icon: '⚠️', title: 'Invalid anchor' },
    ANCHOR_ROW_DELETED: { tone: 'danger', icon: '⚠️', title: 'Audit row deleted' },
    ANCHOR_MISSING: { tone: 'warning', icon: '❓', title: 'Anchor missing' },
    PENDING: { tone: 'warning', icon: '⏳', title: 'Anchoring pending' },
};

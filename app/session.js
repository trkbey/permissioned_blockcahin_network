const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { AuthenticationError } = require('./errors');

const SESSION_COOKIE = 'session';
const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Session layer.
 *
 * The token is carried in an httpOnly cookie; JavaScript cannot read it, therefore a
 * The XSS vulnerability cannot leak the token outside
 *
 * The cost of this is CSRF: since the browser automatically sends the cookie, another
 * It can make requests on behalf of your site. It is blocked with two layers:
 *   1. SameSite=Strict — cookies are never sent in cross-site requests.
 *   2. I'm sending a double submit - a random `csrf' IN the token
 * there is a claim; the same value is also written to a readable cookie.
 * Requests that change this should be sent back with the X-CSRF-Token header.
 *      is mandatory. The attacker cannot fill in the header because they cannot read the cookie.
 *
 * Keeping the claim inside the JWT is more powerful than sending the classic pair: attack
 * even if it can write a cookie in some way, it cannot change the value in the signed token.
 */

function createSessionManager({ secret, ttlSeconds, cookieSecure }) {
    if (!secret || secret.length < 32) {
        throw new Error('JWT_SECRET en az 32 karakter olmali.');
    }

    const cookieBase = {
        httpOnly: true,
        sameSite: 'strict',
        secure: cookieSecure,
        path: '/',
    };

    function issue(res, user) {
        const csrf = crypto.randomBytes(24).toString('hex');
        const token = jwt.sign(
            { sub: user.id, username: user.username, role: user.role, csrf },
            secret,
            { expiresIn: ttlSeconds }
        );

        res.cookie(SESSION_COOKIE, token, { ...cookieBase, maxAge: ttlSeconds * 1000 });
        res.cookie(CSRF_COOKIE, csrf, {
            ...cookieBase,
            httpOnly: false,
            maxAge: ttlSeconds * 1000,
        });
        return csrf;
    }

    function clear(res) {
        res.clearCookie(SESSION_COOKIE, cookieBase);
        res.clearCookie(CSRF_COOKIE, { ...cookieBase, httpOnly: false });
    }

    function read(req) {
        const token = req.cookies ? req.cookies[SESSION_COOKIE] : null;
        if (!token) return null;
        try {
            return jwt.verify(token, secret);
        } catch {
            
            return null;
        }
    }

    function verifyCsrf(req, payload) {
        const provided = req.get(CSRF_HEADER);
        if (!provided || typeof payload.csrf !== 'string') {
            throw new AuthenticationError('Missing CSRF token. Please sign in again.');
        }
        const a = Buffer.from(provided);
        const b = Buffer.from(payload.csrf);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            throw new AuthenticationError('Invalid CSRF token. Please sign in again.');
        }
    }

    return { issue, clear, read, verifyCsrf, SESSION_COOKIE, CSRF_COOKIE };
}

module.exports = { createSessionManager, SESSION_COOKIE, CSRF_COOKIE, CSRF_HEADER };

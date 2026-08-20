const crypto = require('crypto');
const { AuthenticationError, AuthorizationError } = require('./errors');

const ROLES = {
    reader: ['reader'],
    writer: ['reader', 'writer'],
};

const VALID_ROLES = Object.keys(ROLES);

function parseApiKeys(raw) {
    const errors = [];
    const clients = [];
    const seenNames = new Set();
    const seenKeys = new Set();

    const entries = String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    if (entries.length === 0) {
        errors.push('API_KEYS is empty');
        return { clients, errors };
    }

    entries.forEach((entry, i) => {
        const parts = entry.split(':');
        if (parts.length !== 3) {
            errors.push(`API_KEYS[${i}]: Its not same "name:role:key"`);
            return;
        }

        const [name, role, key] = parts.map((p) => p.trim());

        if (!name) errors.push(`API_KEYS[${i}]: Name `);
        if (!VALID_ROLES.includes(role)) {
            errors.push(`API_KEYS[${i}]: gecersiz rol "${role}". Gecerli: ${VALID_ROLES.join(', ')}.`);
        }
        if (key.length < 32) {
            errors.push(`API_KEYS[${i}] (${name}): anahtar en az 32 karakter olmali.`);
        }
        if (seenNames.has(name)) errors.push(`API_KEYS: "${name}" ismi birden fazla kez tanimli.`);
        if (seenKeys.has(key)) errors.push(`API_KEYS: ayni anahtar birden fazla istemciye atanmis.`);

        seenNames.add(name);
        seenKeys.add(key);

        if (name && VALID_ROLES.includes(role) && key.length >= 32) {
            clients.push({
                name,
                role,
                keyHash: crypto.createHash('sha256').update(key).digest(),
            });
        }
    });

    if (clients.length > 0 && !clients.some((c) => c.role === 'writer')) {
        errors.push('API_KEYS: en az bir "writer" rolunde istemci tanimlanmali.');
    }

    return { clients, errors };
}

function findClient(clients, providedKey) {
    const providedHash = crypto.createHash('sha256').update(providedKey).digest();
    let matched = null;
    for (const client of clients) {
        if (crypto.timingSafeEqual(providedHash, client.keyHash)) {
            matched = client;
        }
    }
    return matched;
}

function createAuthenticator({ clients, sessions, findActiveUserById, db }) {
    const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

    return async function authenticate(req, _res, next) {
        try {
            const payload = sessions.read(req);

            if (payload) {
                const user = await findActiveUserById(db, payload.sub);
                if (!user) {
                    sessions.clear(_res);
                    return next(new AuthenticationError('Your session is no longer valid.'));
                }

                if (MUTATING.has(req.method)) {
                    sessions.verifyCsrf(req, payload);
                }

                req.apiClient = {
                    kind: 'user',
                    id: user.id,
                    name: user.username,
                    role: user.role,
                    principal: `user:${user.username}`,
                };
                return next();
            }

            const provided = req.get('X-API-Key');
            if (provided) {
                const client = findClient(clients, provided);
                if (!client) {
                    return next(new AuthenticationError('The provided API key is not valid.'));
                }
                req.apiClient = {
                    kind: 'api',
                    name: client.name,
                    role: client.role,
                    principal: `api:${client.name}`,
                };
                return next();
            }

            return next(new AuthenticationError('Sign in or provide an X-API-Key header.'));
        } catch (err) {
            return next(err);
        }
    };
}

function requireRole(required) {
    return function authorize(req, _res, next) {
        if (!req.apiClient) {
            return next(new AuthenticationError());
        }
        const granted = ROLES[req.apiClient.role] || [];
        if (!granted.includes(required)) {
            return next(
                new AuthorizationError(
                    `This action requires the "${required}" role.`,
                    { requiredRole: required, yourRole: req.apiClient.role }
                )
            );
        }
        return next();
    };
}

module.exports = { parseApiKeys, createAuthenticator, requireRole, ROLES, VALID_ROLES };

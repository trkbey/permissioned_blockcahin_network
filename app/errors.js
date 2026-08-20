/*
 * Type-based error layer
 *
 * Rule: The body sent to the client NEVER contains driver-specific details.
 * The `message` field of every AppError must be visible to the user;
 * The raw error (`cause`) is only logged to the server log
 */

class AppError extends Error {
    /**
     * @param {string} code     
     * @param {number} status   
     * @param {string} message  
     * @param {object} [opts]
     * @param {any}    [opts.details]   
     * @param {Error}  [opts.cause]     
     * @param {boolean}[opts.expected]  
     */
    constructor(code, status, message, opts = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.status = status;
        this.details = opts.details;
        this.cause = opts.cause;
        this.expected = opts.expected !== undefined ? opts.expected : status < 500;
    }
}

class ValidationError extends AppError {
    constructor(message, details) {
        super('VALIDATION_ERROR', 400, message, { details });
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication required.') {
        super('AUTHENTICATION_ERROR', 401, message);
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'You do not have permission to perform this action.', details) {
        super('AUTHORIZATION_ERROR', 403, message, { details });
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found.') {
        super('NOT_FOUND', 404, message);
    }
}

class ConflictError extends AppError {
    constructor(message, details) {
        super('CONFLICT', 409, message, { details });
    }
}

class DatabaseError extends AppError {
    constructor(message, opts = {}) {
        super(opts.code || 'DATABASE_ERROR', opts.status || 500, message, opts);
    }
}

class BlockchainError extends AppError {
    constructor(message, opts = {}) {
        super(opts.code || 'BLOCKCHAIN_ERROR', opts.status || 502, message, opts);
    }
}

const PG_UNAVAILABLE = new Set([
    '08000', '08003', '08006', '08001', '08004', 
    '57P01', '57P02', '57P03', 
    '53300', 
]);

const PG_MESSAGES = {
    '23505': 'A record with these values already exists.',
    '23503': 'A referenced record does not exist.',
    '23502': 'A required field is missing.',
    '23514': 'A field value violates a database constraint.',
    '22001': 'A field value is too long.',
    '22003': 'A numeric value is out of range.',
    '22007': 'A date or time value is not valid.',
    '22P02': 'A field value has the wrong type.',
};

function isDatabaseError(err) {
    return Boolean(
        err &&
            (err.severity !== undefined ||
                (typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) ||
                ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'].includes(
                    err.code
                ))
    );
}

function fromDatabaseError(err) {
    const code = err.code;

    if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'].includes(code) ||
        PG_UNAVAILABLE.has(code)) {
        return new DatabaseError('The database is temporarily unavailable. Please try again.', {
            code: 'DATABASE_UNAVAILABLE',
            status: 503,
            cause: err,
        });
    }

    if (code === '23505') return new ConflictError(PG_MESSAGES['23505']);

    if (PG_MESSAGES[code]) {
        const details = err.column ? [{ field: err.column, message: PG_MESSAGES[code] }] : undefined;
        return new ValidationError(PG_MESSAGES[code], details);
    }

    return new DatabaseError('The request could not be completed due to a database error.', {
        cause: err,
    });
}

const ETHERS_CODES = new Set([
    'NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT', 'CALL_EXCEPTION', 'BAD_DATA',
    'NONCE_EXPIRED', 'REPLACEMENT_UNDERPRICED', 'TRANSACTION_REPLACED',
    'INSUFFICIENT_FUNDS', 'UNPREDICTABLE_GAS_LIMIT', 'ACTION_REJECTED',
    'UNSUPPORTED_OPERATION', 'UNCONFIGURED_NAME', 'VALUE_MISMATCH',
]);

function isBlockchainError(err) {
    return Boolean(err && typeof err.code === 'string' && ETHERS_CODES.has(err.code));
}

function fromBlockchainError(err) {
    switch (err.code) {
        case 'NETWORK_ERROR':
        case 'SERVER_ERROR':
        case 'TIMEOUT':
            return new BlockchainError(
                'The blockchain node is unreachable. Please try again shortly.',
                { code: 'BLOCKCHAIN_UNAVAILABLE', status: 503, cause: err }
            );

        case 'BAD_DATA':
            if (err.value === '0x') {
                return new BlockchainError(
                    'The anchoring contract is not deployed at the configured address.',
                    { code: 'CONTRACT_NOT_DEPLOYED', status: 503, cause: err }
                );
            }
            return new BlockchainError('The blockchain returned an unreadable response.', {
                cause: err,
            });

        case 'CALL_EXCEPTION':
            return new BlockchainError('The blockchain rejected the transaction.', {
                code: 'BLOCKCHAIN_REVERTED',
                status: 502,
                cause: err,
                details: err.reason ? { reason: err.reason } : undefined,
            });

        case 'NONCE_EXPIRED':
        case 'REPLACEMENT_UNDERPRICED':
        case 'TRANSACTION_REPLACED':
            return new BlockchainError(
                'A concurrent blockchain transaction conflicted. Please try again.',
                { code: 'BLOCKCHAIN_CONFLICT', status: 503, cause: err }
            );

        case 'INSUFFICIENT_FUNDS':
            return new BlockchainError('The signing account cannot pay for this transaction.', {
                code: 'BLOCKCHAIN_INSUFFICIENT_FUNDS',
                status: 500,
                cause: err,
            });

        default:
            if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'].includes(err.code)) {
                return new BlockchainError(
                    'The blockchain node is unreachable. Please try again shortly.',
                    { code: 'BLOCKCHAIN_UNAVAILABLE', status: 503, cause: err }
                );
            }
            return new BlockchainError('The blockchain operation failed.', { cause: err });
    }
}

async function chainCall(fn) {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof AppError) throw err;
        throw fromBlockchainError(err);
    }
}

function normalizeError(err) {
    if (err instanceof AppError) return err;
    if (isBlockchainError(err)) return fromBlockchainError(err);
    if (isDatabaseError(err)) return fromDatabaseError(err);

    if (err && err.type === 'entity.parse.failed') {
        return new ValidationError('Request body is not valid JSON.');
    }
    if (err && err.type === 'entity.too.large') {
        return new AppError('PAYLOAD_TOO_LARGE', 413, 'Request body is too large.');
    }

    return new AppError('INTERNAL_ERROR', 500, 'An unexpected server error occurred.', {
        cause: err,
        expected: false,
    });
}

module.exports = {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    DatabaseError,
    BlockchainError,
    normalizeError,
    chainCall,
};

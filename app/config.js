require('dotenv').config();

const { parseApiKeys } = require('./auth');

/**
 * Table schema in a single source. Instead of if/else chains scattered throughout the backend,
 * they are read from here
 *
 * `columns` is CRITICAL Only columns defined here can be written via POST.
 * Thus, the client cannot specify columns such as bigserial primary key on its own
 *
 * Types initialization It must be exactly compatible with SQL; if it doesn't validation passes but
 * Postgres rejects it and the user sees a worse error
 */
const TABLES = {
    product: {
        pk: 'product_id',
        columns: {
            product_id: { type: 'int', required: true },
            product_code: { type: 'text', required: true, maxLength: 20 },
            product_name: { type: 'text', required: true, maxLength: 300 },
            category: { type: 'text', required: true, maxLength: 100 },
            model: { type: 'text', required: true, maxLength: 100 },
            unit: { type: 'text', required: true, maxLength: 20 },
        },
    },
    employee: {
        pk: 'employee_id',
        columns: {
            employee_id: { type: 'int', required: true },
            employee_code: { type: 'text', required: true, maxLength: 20 },
            employee_name: { type: 'text', required: true, maxLength: 50 },
            department: { type: 'text', required: true, maxLength: 200 },
            job_position: { type: 'text', required: false, maxLength: 100 },
            team: { type: 'text', required: false, maxLength: 100 },
        },
    },
    production: {
        pk: 'production_id',
        columns: {
            date_id: { type: 'int', required: true },
            machine_id: { type: 'int', required: true },
            shift_id: { type: 'int', required: true },
            employee_id: { type: 'int', required: true },
            factory_id: { type: 'int', required: true },
            product_id: { type: 'int', required: true },
            quantity: { type: 'int', required: true, min: 0 },
            // DEFAULT 0 tanimli — istemci gondermeyebilir.
            defective_quantity: { type: 'int', required: false, min: 0 },
            production_time_minutes: { type: 'int', required: true, min: 0 },
            downtime_minutes: { type: 'int', required: false, min: 0 },
            production_cost: { type: 'numeric', required: true, min: 0 },
        },
    },
};

const REQUIRED_ENV = [
    'DATABASE_URL',
    'RPC_URL',
    'PRIVATE_KEY',
    'CONTRACT_ADDRESS',
    'API_KEYS',
    'JWT_SECRET',
];

function loadConfig() {
    const problems = [];

    const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        problems.push(`Eksik zorunlu degiskenler: ${missing.join(', ')}`);
    }

    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
        problems.push('JWT_SECRET en az 32 karakter olmali.');
    }

    let clients = [];
    if (process.env.API_KEYS) {
        const parsed = parseApiKeys(process.env.API_KEYS);
        clients = parsed.clients;
        problems.push(...parsed.errors);
    }

    if (problems.length > 0) {
        console.error('[CONFIG] Yapilandirma gecersiz, servis baslatilmiyor:');
        problems.forEach((p) => console.error(`  - ${p}`));
        console.error('[CONFIG] Ayrinti icin app/.env.example dosyasina bakin.');
        process.exit(1);
    }

    console.log(
        `[CONFIG] ${clients.length} API istemcisi yuklendi: ` +
            clients.map((c) => `${c.name}(${c.role})`).join(', ')
    );

    return {
        port: Number(process.env.PORT) || 3000,
        databaseUrl: process.env.DATABASE_URL,
        rpcUrl: process.env.RPC_URL,
        privateKey: process.env.PRIVATE_KEY,
        contractAddress: process.env.CONTRACT_ADDRESS,
        clients,

        session: {
            secret: process.env.JWT_SECRET,
            ttlSeconds: Number(process.env.SESSION_TTL_SECONDS) || 8 * 60 * 60,
            cookieSecure: process.env.COOKIE_SECURE === 'true',
        },

        seedUsers: [
            {
                username: process.env.SEED_ADMIN_USERNAME,
                password: process.env.SEED_ADMIN_PASSWORD,
                role: 'writer',
            },
            {
                username: process.env.SEED_VIEWER_USERNAME,
                password: process.env.SEED_VIEWER_PASSWORD,
                role: 'reader',
            },
        ],

        corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:8080')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        allowAuditReset: process.env.ALLOW_AUDIT_RESET === 'true',
    };
}

module.exports = { TABLES, loadConfig };

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { ValidationError, ConflictError } = require('./errors');
const { VALID_ROLES } = require('./auth');

const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('placeholder-for-timing-equalisation', BCRYPT_ROUNDS);

function assertUsername(username) {
    if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,50}$/.test(username)) {
        throw new ValidationError(
            'Username must be 3-50 characters and may contain letters, digits, dot, underscore or hyphen.'
        );
    }
}

function assertPassword(password) {
    if (typeof password !== 'string' || password.length < 12) {
        throw new ValidationError('Password must be at least 12 characters long.');
    }
    if (password.length > 200) {
        // bcrypt 72 byte'tan sonrasini yok sayar; asiri uzun girdi de DoS vektorudur.
        throw new ValidationError('Password must be at most 200 characters long.');
    }
}

async function createUser(db, { username, password, role }) {
    assertUsername(username);
    assertPassword(password);
    if (!VALID_ROLES.includes(role)) {
        throw new ValidationError(`Role must be one of: ${VALID_ROLES.join(', ')}.`);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
        const result = await db.query(
            `INSERT INTO "users" ("id", "username", "password_hash", "role")
             VALUES ($1, $2, $3, $4)
             RETURNING "id", "username", "role"`,
            [crypto.randomUUID(), username, passwordHash, role]
        );
        return result.rows[0];
    } catch (err) {
        if (err.code === '23505') {
            throw new ConflictError(`A user named "${username}" already exists.`);
        }
        throw err;
    }
}

/**
 * Kullanici adi + parola dogrular.
 *
 * Kullanici bulunamasa bile bcrypt.compare sahte bir ozete karsi calistirilir;
 * boylece yanit suresi "kullanici var mi" bilgisini sizdirmaz.
 *
 * @returns {{id, username, role} | null}
 */
async function verifyCredentials(db, username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') return null;

    const result = await db.query(
        `SELECT "id", "username", "password_hash", "role", "is_active"
           FROM "users" WHERE LOWER("username") = LOWER($1)`,
        [username]
    );

    const user = result.rows[0];
    const hash = user ? user.password_hash : DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, hash);

    if (!user || !user.is_active || !passwordMatches) return null;

    await db.query('UPDATE "users" SET "last_login_at" = CURRENT_TIMESTAMP WHERE "id" = $1', [
        user.id,
    ]);

    return { id: user.id, username: user.username, role: user.role };
}

async function findActiveUserById(db, id) {
    const result = await db.query(
        `SELECT "id", "username", "role" FROM "users" WHERE "id" = $1 AND "is_active" = TRUE`,
        [id]
    );
    return result.rows[0] || null;
}

async function seedUsers(db, seeds) {
    const { rows } = await db.query('SELECT COUNT(*)::int AS count FROM "users"');
    if (rows[0].count > 0) return { seeded: false, count: rows[0].count };

    const usable = seeds.filter((s) => s.username && s.password);
    if (usable.length === 0) {
        console.warn('[USERS] Kullanici tablosu bos ve SEED_* degiskenleri tanimli degil.');
        console.warn('[USERS] Giris yapilamaz. app/.env.example dosyasina bakin veya:');
        console.warn('[USERS]   docker exec -it backend-api node scripts/create-user.js\n');
        return { seeded: false, count: 0 };
    }

    for (const seed of usable) {
        const user = await createUser(db, seed);
        console.log(`[USERS] Baslangic kullanicisi olusturuldu: ${user.username} (${user.role})`);
    }
    return { seeded: true, count: usable.length };
}

module.exports = {
    createUser,
    verifyCredentials,
    findActiveUserById,
    seedUsers,
    assertUsername,
    assertPassword,
};

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { ethers } = require('ethers');
const crypto = require('crypto');

const { TABLES, loadConfig } = require('./config');
const { createAuthenticator, requireRole } = require('./auth');
const { createSessionManager } = require('./session');
const { verifyCredentials, findActiveUserById, seedUsers } = require('./users');
const { validateRecord } = require('./validate');
const { AuthenticationError, NotFoundError, normalizeError, chainCall } = require('./errors');

const config = loadConfig();

const app = express();
app.disable('x-powered-by');

// Onunde TAM OLARAK BIR proxy var (frontend konteynerindeki nginx).
// Bu ayar olmadan express-rate-limit, X-Forwarded-For basligini gorup gercek
// istemci IP'sini belirleyemedigi icin istegi reddeder.
//
// Burada `true` (hepsine guven) KULLANILMAZ: o durumda istemci kendi
// X-Forwarded-For basligini uydurup hiz sinirlamasini tamamen atlatabilir.
// Sayi vermek, yalnizca en sondaki bir hop'un guvenilir sayilmasini saglar.
app.set('trust proxy', 1);
app.use(helmet());
app.use(
    cors({
        origin: config.corsOrigins,
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'X-API-Key', 'X-CSRF-Token'],
        // Arayuz normalde nginx uzerinden ayni origin'den konusur; bu ayar
        // yalnizca backend'e dogrudan erisildigi gelistirme senaryosu icin.
        credentials: true,
    })
);
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

const pool = new Pool({ connectionString: config.databaseUrl });
// Havuzdaki bosta bekleyen baglantinin kopmasi sureci dusurmemeli.
pool.on('error', (err) => console.error('[POOL] Bosta baglanti hatasi:', err.message));

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const wallet = new ethers.Wallet(config.privateKey, provider);
const contractABI = require('./abi.json');
const contract = new ethers.Contract(config.contractAddress, contractABI, wallet);

// ---------------------------------------------------------------------------
// Standart yanit zarflari
// ---------------------------------------------------------------------------
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/**
 * Async route'lardaki reddedilen promise'leri Express'in hata zincirine tasir.
 * Bu olmadan async bir handler icindeki throw, merkezi middleware'e ulasmaz.
 */
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// Kimlik dogrulama ve hiz sinirlama
// ---------------------------------------------------------------------------
const sessions = createSessionManager(config.session);

const authenticate = createAuthenticator({
    clients: config.clients,
    sessions,
    findActiveUserById,
    db: pool,
});

const limiterResponse = (message) => (req, res) =>
    res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message, ref: null },
    });

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limiterResponse('Too many requests. Please wait a minute and try again.'),
});

const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limiterResponse('Too many write requests. Please wait a minute and try again.'),
});

// Kaba kuvvete karsi giris ucu ayrica ve sert sinirlanir.
// Sayac basarili girislerde sifirlanir, boylece normal kullanici cezalanmaz.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: limiterResponse('Too many sign-in attempts. Please wait 15 minutes.'),
});

// Saglik ucu kimlik dogrulamasindan muaf (container healthcheck icin).
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// --- Kimlik dogrulama uclari (authenticate'ten ONCE, aksi halde giris
//     yapabilmek icin giris yapmis olmak gerekirdi) ---

app.post(
    '/api/auth/login',
    apiLimiter,
    loginLimiter,
    route(async (req, res) => {
        const { username, password } = req.body || {};

        const user = await verifyCredentials(pool, username, password);
        if (!user) {
            // Kullanici adinin var olup olmadigi BILEREK ayirt edilmiyor.
            console.warn(`[AUTH] Basarisiz giris denemesi: "${String(username).slice(0, 50)}"`);
            throw new AuthenticationError('Incorrect username or password.');
        }

        sessions.issue(res, user);
        console.log(`[AUTH] Giris: ${user.username} (${user.role})`);
        // /api/auth/me ile AYNI bicim. Farkli olursa arayuz, giristen hemen
        // sonra kullanici adini bulamaz ve ancak sayfa yenilenince duzelir.
        ok(res, { kind: 'user', name: user.username, role: user.role });
    })
);

app.post('/api/auth/logout', apiLimiter, (req, res) => {
    const payload = sessions.read(req);
    if (payload) console.log(`[AUTH] Cikis: ${payload.username}`);
    sessions.clear(res);
    ok(res, { signedOut: true });
});

app.use('/api', apiLimiter, authenticate);

// Arayuz, acilista bunu cagirip kimligini ve rolunu ogrenir; reader rolundeki
// bir kullaniciya yazma sekmesi hic gosterilmez.
// Ic kimlik (users.id) disari verilmez; arayuzun ihtiyaci yok.
const publicIdentity = (c) => ({ kind: c.kind, name: c.name, role: c.role });

app.get('/api/auth/me', (req, res) => ok(res, publicIdentity(req.apiClient)));

// Eski isim; arayuzun onceki surumleri bunu cagiriyordu.
app.get('/api/whoami', (req, res) => ok(res, publicIdentity(req.apiClient)));

// ---------------------------------------------------------------------------
// Muhurleme kuyrugu
//
// Tek cuzdandan es zamanli islem gonderirsek nonce catisir. Tum anchorHash
// cagrilari bu kuyruktan SIRAYLA gecer.
// ---------------------------------------------------------------------------
let anchorQueue = Promise.resolve();

function serializeAnchor(fn) {
    const result = anchorQueue.then(fn);
    anchorQueue = result.then(
        () => {},
        () => {}
    );
    return result;
}

const hashContent = (content) =>
    crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');

/**
 * Bir kaydi zincire muhurler ve hash_anchors tablosuna yazar.
 * Listener ve baslangic senkronizasyonu ayni yolu kullanir.
 */
async function anchorRecord({ tableId, tableName, recordId, content, createdBy, db = pool }) {
    const recordHash = hashContent(content);
    const uniqueBlockchainId = `${tableId}_${recordId}`;

    return serializeAnchor(async () => {
        const existing = await chainCall(() => contract.recordHashes(uniqueBlockchainId));
        if (existing && existing !== '') {
            // Buraya "muhurlenmemis" olarak gelen bir kaydin zincirde zaten muhru
            // varsa, hash_anchors satiri silinmis demektir. Sessizce atlamak bunu
            // kalicilastirir; en azindan operatore bagirilir.
            if (existing !== recordHash) {
                console.error(
                    `[ANCHOR] UYARI: ${tableName}#${recordId} zincirde muhurlu ama denetim ` +
                        `satiri yok VE icerik zincirdekiyle uyusmuyor. Tahrifat suphesi.`
                );
            } else {
                console.warn(
                    `[ANCHOR] ${tableName}#${recordId} zincirde muhurlu ama denetim satiri yok. ` +
                        `Icerik saglam; denetim izi silinmis olabilir.`
                );
            }
            return { skipped: true };
        }

        console.log(`[ANCHOR] ${tableName}#${recordId} muhurleniyor (kaynak: ${createdBy})...`);
        const receipt = await chainCall(async () => {
            const tx = await contract.anchorHash(uniqueBlockchainId, recordHash);
            return tx.wait();
        });

        await db.query(
            `INSERT INTO "hash_anchors"
               ("id", "table_id", "record_id", "record_hash", "tx_hash", "block_number", "created_by")
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                crypto.randomUUID(),
                tableId,
                String(recordId),
                recordHash,
                receipt.hash,
                receipt.blockNumber,
                createdBy,
            ]
        );

        console.log(`[ANCHOR] Basarili. Tx: ${receipt.hash} (blok ${receipt.blockNumber})`);
        return { skipped: false, txHash: receipt.hash };
    });
}

// ---------------------------------------------------------------------------
// Veritabani dinleyicisi
// ---------------------------------------------------------------------------
let listenerClient = null;
let reconnectDelay = 1000;
let reconnectTimer = null;
let shuttingDown = false;

function scheduleListenerReconnect() {
    if (shuttingDown || reconnectTimer) return;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    console.warn(`[LISTENER] ${delay}ms sonra yeniden baglanilacak.`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startDatabaseListener();
    }, delay);
}

async function handleNotification(msg) {
    if (msg.channel !== 'new_critical_record') return;

    let payload;
    try {
        payload = JSON.parse(msg.payload);
    } catch (err) {
        console.error('[LISTENER] Bozuk bildirim yuku, atlaniyor:', err.message);
        return;
    }

    try {
        await anchorRecord({
            tableId: payload.table_id,
            tableName: payload.table_name,
            recordId: payload.record_id,
            content: payload.content,
            // Kaydi ekleyen kimlik ("user:admin" / "api:dashboard") trigger
            // tarafindan yuke konur. Dogrudan SQL ile eklenen satirlarda bos gelir.
            createdBy: payload.client || 'direct-sql',
        });
    } catch (err) {
        const e = normalizeError(err);
        console.error(
            `[LISTENER] ${payload.table_name}#${payload.record_id} muhurlenemedi ` +
                `[${e.code}]: ${e.cause ? e.cause.message : e.message}`
        );
    }
}

async function startDatabaseListener() {
    if (shuttingDown) return;

    let client;
    try {
        client = await pool.connect();
    } catch (err) {
        console.error('[LISTENER] Baglanti kurulamadi:', err.message);
        return scheduleListenerReconnect();
    }

    const teardown = (reason) => {
        if (listenerClient !== client) return;
        listenerClient = null;
        console.error(`[LISTENER] Baglanti kesildi (${reason}).`);
        try {
            client.release(true); // hatali baglantiyi havuzdan tamamen dus
        } catch {
            /* zaten birakilmis olabilir */
        }
        scheduleListenerReconnect();
    };

    client.on('error', (err) => teardown(err.message));
    client.on('end', () => teardown('end'));
    client.on('notification', handleNotification);

    try {
        await client.query('LISTEN new_critical_record');
    } catch (err) {
        console.error('[LISTENER] LISTEN basarisiz:', err.message);
        return teardown('listen failed');
    }

    listenerClient = client;
    reconnectDelay = 1000;
    console.log('[LISTENER] new_critical_record kanali dinleniyor.');
}

// ---------------------------------------------------------------------------
// Baslangic senkronizasyonu
// ---------------------------------------------------------------------------
async function contractIsReachable() {
    try {
        await chainCall(() => contract.recordHashes('healthcheck_probe'));
        return 'ok';
    } catch (err) {
        const e = normalizeError(err);
        if (e.code === 'CONTRACT_NOT_DEPLOYED') {
            console.error('\n[SYNC] KRITIK: Belirtilen adreste akilli sozlesme yok.');
            console.error('[SYNC] CONTRACT_ADDRESS dogru mu? Ag sifirlandiysa once:');
            console.error('[SYNC]   cd contract && npm run deploy\n');
            // Yeniden denemek bunu duzeltmez; elle deploy gerekir.
            return 'fatal';
        }
        if (e.code === 'BLOCKCHAIN_UNAVAILABLE') {
            console.warn('[SYNC] Zincir henuz erisilebilir degil.');
            return 'retry';
        }
        throw err;
    }
}

/**
 * Veritabaninda kayit var ama zincirde yoksa, bu ya ag sifirlanmistir ya da
 * CONTRACT_ADDRESS yanlistir. Ikinci durumda denetim tablolarini silmek kanit
 * kaybi demektir; bu yuzden silme ARTIK OTOMATIK DEGIL.
 */
async function checkAuditConsistency(client) {
    const sample = await client.query('SELECT table_id, record_id FROM hash_anchors LIMIT 1');
    if (sample.rows.length === 0) return true;

    const { table_id, record_id } = sample.rows[0];
    const chainHash = await chainCall(() => contract.recordHashes(`${table_id}_${record_id}`));
    if (chainHash && chainHash !== '') return true;

    console.warn('\n[SYNC] ================= UYARI =================');
    console.warn('[SYNC] Veritabaninda muhur kaydi var ama zincirde bulunamadi.');
    console.warn('[SYNC] Olasi sebepler: (a) ag sifirlandi, (b) CONTRACT_ADDRESS yanlis.');

    if (!config.allowAuditReset) {
        console.warn('[SYNC] Denetim tablolarina DOKUNULMUYOR (ALLOW_AUDIT_RESET=false).');
        console.warn('[SYNC] Ag gercekten sifirlandiysa ve gecmisi silmek istiyorsaniz,');
        console.warn('[SYNC] app/.env icinde ALLOW_AUDIT_RESET=true yapip yeniden baslatin.');
        console.warn('[SYNC] =========================================\n');
        return false;
    }

    console.warn('[SYNC] ALLOW_AUDIT_RESET=true — denetim tablolari siliniyor.');
    await client.query('TRUNCATE TABLE hash_anchors CASCADE');
    await client.query('TRUNCATE TABLE verification_log CASCADE');
    console.warn('[SYNC] =========================================\n');
    return true;
}

async function syncUnanchoredRecords() {
    console.log('\n[SYNC] Muhurlenmemis kayitlar taraniyor...');

    const reachable = await contractIsReachable();
    if (reachable === 'retry') return false;   // cagiran yeniden dener
    if (reachable === 'fatal') return true;    // yeniden denemenin faydasi yok

    const client = await pool.connect();
    try {
        if (!(await checkAuditConsistency(client))) {
            console.warn('[SYNC] Tutarsizlik giderilmeden senkronizasyon atlandi.\n');
            return;
        }

        const tablesRes = await client.query('SELECT table_id, table_name FROM tables');

        for (const { table_id, table_name } of tablesRes.rows) {
            const spec = TABLES[table_name];
            if (!spec) continue;

            const unanchored = await client.query(
                `SELECT t.${spec.pk} AS id, row_to_json(t) AS content
                   FROM "${table_name}" t
                   LEFT JOIN "hash_anchors" ha
                     ON t.${spec.pk}::text = ha.record_id AND ha.table_id = $1
                  WHERE ha.id IS NULL`,
                [table_id]
            );

            if (unanchored.rows.length === 0) continue;
            console.log(`[SYNC] ${table_name}: ${unanchored.rows.length} muhurlenmemis kayit.`);

            for (const record of unanchored.rows) {
                try {
                    await anchorRecord({
                        tableId: table_id,
                        tableName: table_name,
                        recordId: record.id,
                        content: record.content,
                        createdBy: 'system-sync',
                        db: client,
                    });
                } catch (err) {
                    const e = normalizeError(err);
                    console.error(`[SYNC] ${table_name}#${record.id} basarisiz [${e.code}]`);
                }
            }
        }
        console.log('[SYNC] Senkronizasyon tamamlandi.\n');
    } catch (err) {
        console.error('[SYNC] Hata:', normalizeError(err).message);
    } finally {
        client.release();
    }
}

/**
 * Baslangic senkronizasyonunu, gecici bir ariza varsa yeniden dener.
 *
 * Konteynerler ayni anda ayaga kalktiginda Besu genelde backend'den yavas
 * hazir olur. Tek denemede vazgecilirse, mühürlenmemis kayitlar bir sonraki
 * yeniden baslatmaya kadar oyle kalir.
 */
async function syncWithRetry(attempt = 1) {
    const MAX_ATTEMPTS = 10;
    try {
        const done = await syncUnanchoredRecords();
        if (done !== false) return;
    } catch (err) {
        console.error('[SYNC] Hata:', normalizeError(err).message);
    }

    if (shuttingDown || attempt >= MAX_ATTEMPTS) {
        if (attempt >= MAX_ATTEMPTS) {
            console.error(`[SYNC] ${MAX_ATTEMPTS} denemede tamamlanamadi. Elle mudahale gerekebilir.`);
        }
        return;
    }

    const delay = Math.min(2000 * 2 ** (attempt - 1), 60000);
    console.warn(`[SYNC] ${delay}ms sonra yeniden denenecek (deneme ${attempt + 1}/${MAX_ATTEMPTS}).`);
    setTimeout(() => syncWithRetry(attempt + 1), delay).unref();
}

async function initializeServices() {
    // Kullanici tablosu bossa baslangic hesaplarini olustur.
    try {
        await seedUsers(pool, config.seedUsers);
    } catch (err) {
        console.error('[USERS] Baslangic kullanicilari olusturulamadi:', normalizeError(err).message);
    }

    // Dinleyici ONCE baslar; aksi halde senkronizasyon suren dakikalarda
    // eklenen kayitlarin bildirimi tamamen kaybolur.
    await startDatabaseListener();
    await syncWithRetry();
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
function tableSpec(tableName) {
    const spec = TABLES[tableName];
    if (!spec) {
        throw new NotFoundError(`Unknown table "${tableName}".`);
    }
    return spec;
}

app.get(
    '/api/records/:tableName',
    route(async (req, res) => {
        const spec = tableSpec(req.params.tableName);
        const result = await pool.query(
            `SELECT ${spec.pk} AS id, row_to_json(t) AS content
               FROM "${req.params.tableName}" t
              ORDER BY ${spec.pk} DESC
              LIMIT 100`
        );
        ok(res, result.rows);
    })
);

app.post(
    '/api/records/:tableName',
    writeLimiter,
    requireRole('writer'),
    route(async (req, res) => {
        const { tableName } = req.params;
        const spec = tableSpec(tableName);

        // Tip donusumu ve alan bazli hatalar burada toplanir.
        const { columns, values } = validateRecord(tableName, spec, req.body);

        const cols = columns.map((c) => `"${c}"`).join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        // Islem icinde bir oturum degiskeni set edilir; AFTER INSERT trigger'i
        // bunu okuyup bildirim yukune koyar, boylece hangi API istemcisinin
        // ekledigi hash_anchors.created_by alanina yazilabilir.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT set_config($1, $2, true)', [
                'app.client_name',
                // "user:admin" veya "api:dashboard" — denetim izine bu yazilir.
                req.apiClient.principal,
            ]);
            await client.query(`INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})`, values);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            client.release();
        }

        ok(
            res,
            {
                table: tableName,
                anchoring: 'PENDING',
                message: 'Record saved. Blockchain anchoring has been queued.',
            },
            201
        );
    })
);

/**
 * Dogrulama sonucu bir HATA degil, bir BULGUDUR.
 * Bu yuzden istek basariyla islendigi surece HTTP 200 doner ve sonuc
 * `data.status` alaninda tasinir:
 *
 *   SECURE         icerik zincirdeki muhurle birebir esit
 *   TAMPERED       icerik degistirilmis
 *   FORGED_TX      hash_anchors'taki tx_hash zincirde gecerli degil
 *   PENDING        kayit var ama henuz muhurlenmemis
 *   ANCHOR_MISSING muhur kaydi var ama zincirde karsiligi yok
 *
 * HTTP hata kodlari yalnizca gercek arizalar icin kullanilir
 * (kayit yok -> 404, veritabani/zincir erisilemez -> 503).
 */
app.get(
    '/api/verify/:tableName/:recordId',
    route(async (req, res) => {
        const { tableName, recordId } = req.params;
        const spec = tableSpec(tableName);

        const tableRes = await pool.query('SELECT table_id FROM tables WHERE table_name = $1', [
            tableName,
        ]);
        if (tableRes.rows.length === 0) {
            throw new NotFoundError(`Table "${tableName}" is not registered for anchoring.`);
        }
        const tableId = tableRes.rows[0].table_id;

        const recordRes = await pool.query(
            `SELECT row_to_json(t) AS content FROM "${tableName}" t WHERE t.${spec.pk}::text = $1`,
            [recordId]
        );
        if (recordRes.rows.length === 0) {
            throw new NotFoundError(`No ${tableName} record with id "${recordId}".`);
        }

        const liveDbHash = hashContent(recordRes.rows[0].content);

        const anchorRes = await pool.query(
            `SELECT tx_hash, block_number, created_by
               FROM "hash_anchors"
              WHERE table_id = $1 AND record_id = $2`,
            [tableId, recordId]
        );

        // Muhur satirinin YOKLUGU tek basina "henuz muhurlenmedi" demek DEGILDIR.
        //
        // Veritabanina yazabilen bir saldirgan, kaydi degistirip hash_anchors
        // satirini de silebilir. Zincire sorulmazsa bu, zararsiz gorunen
        // PENDING olarak raporlanir ve tahrifat kalici olarak gizlenir.
        // Bu yuzden PENDING donmeden ONCE zincir daima sorgulanir: zincirde bir
        // muhur varken satirin olmamasi, mumkun olan en guclu tahrifat isaretidir.
        if (anchorRes.rows.length === 0) {
            const orphanHash = await chainCall(() =>
                contract.recordHashes(`${tableId}_${recordId}`)
            );

            if (!orphanHash || orphanHash === '') {
                return ok(res, {
                    status: 'PENDING',
                    message:
                        'This record has not been anchored yet. Anchoring may still be in progress.',
                    dbHash: liveDbHash,
                    chainHash: null,
                    txHash: null,
                });
            }

            const contentIntact = liveDbHash === orphanHash;

            console.error(
                `[VERIFY] Denetim satiri silinmis: ${tableName}#${recordId} zincirde muhurlu ` +
                    `ama hash_anchors'ta kaydi yok (icerik ${contentIntact ? 'saglam' : 'DEGISMIS'}).`
            );

            await pool.query(
                `INSERT INTO "verification_log"
                   ("id", "table_id", "record_id", "computed_hash", "chain_hash", "is_valid")
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [crypto.randomUUID(), tableId, recordId, liveDbHash, orphanHash, false]
            );

            return ok(res, {
                // Icerik degismisse bu duz bir tahrifattir; degismemisse denetim
                // izi silinmistir. Ikisi de "beklemede" DEGILDIR.
                status: contentIntact ? 'ANCHOR_ROW_DELETED' : 'TAMPERED',
                message: contentIntact
                    ? 'This record is anchored on the blockchain, but its anchor row has been ' +
                      'deleted from the database. The content still matches the chain.'
                    : 'The record in the database no longer matches its blockchain anchor, and ' +
                      'its anchor row has been deleted from the database.',
                dbHash: liveDbHash,
                chainHash: orphanHash,
                txHash: null,
            });
        }

        const { tx_hash: dbTxHash, block_number, created_by } = anchorRes.rows[0];

        let tx = null;
        try {
            tx = await chainCall(() => provider.getTransaction(dbTxHash));
        } catch (err) {
            // Bicimsel olarak gecersiz bir hash, zincir arizasi degildir.
            const e = normalizeError(err);
            if (e.status === 503) throw err;
            tx = null;
        }

        // tx.to, kontrat olusturma islemlerinde null olabilir — once kontrol et.
        const txTargetsContract =
            tx && tx.to && tx.to.toLowerCase() === config.contractAddress.toLowerCase();

        if (!txTargetsContract) {
            return ok(res, {
                status: 'FORGED_TX',
                message:
                    'The transaction hash stored in the database is not a valid anchor on this chain.',
                dbHash: liveDbHash,
                chainHash: null,
                txHash: dbTxHash,
            });
        }

        const chainHash = await chainCall(() => contract.recordHashes(`${tableId}_${recordId}`));
        if (!chainHash || chainHash === '') {
            return ok(res, {
                status: 'ANCHOR_MISSING',
                message: 'An anchor row exists but no matching hash was found on the blockchain.',
                dbHash: liveDbHash,
                chainHash: null,
                txHash: dbTxHash,
            });
        }

        const isValid = liveDbHash === chainHash;

        await pool.query(
            `INSERT INTO "verification_log"
               ("id", "table_id", "record_id", "computed_hash", "chain_hash", "is_valid")
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [crypto.randomUUID(), tableId, recordId, liveDbHash, chainHash, isValid]
        );

        ok(res, {
            status: isValid ? 'SECURE' : 'TAMPERED',
            message: isValid
                ? 'The record matches its original blockchain anchor exactly.'
                : 'The record in the database no longer matches its blockchain anchor.',
            dbHash: liveDbHash,
            chainHash,
            txHash: dbTxHash,
            blockNumber: block_number,
            anchoredBy: created_by,
        });
    })
);

// ---------------------------------------------------------------------------
// Merkezi hata yonetimi
//
// Buraya ulasan her hata AppError'a normalize edilir, tek bir zarf bicimiyle
// doner ve ham surucu detayi yalnizca sunucu loguna yazilir.
// ---------------------------------------------------------------------------
app.use((req, _res, next) => next(new NotFoundError(`No route matches ${req.method} ${req.path}.`)));

// eslint-disable-next-line no-unused-vars -- Express hata middleware'i 4 argüman ister
app.use((err, req, res, _next) => {
    const e = normalizeError(err);
    const ref = crypto.randomUUID().slice(0, 8);

    const client = req.apiClient ? `${req.apiClient.name}/${req.apiClient.role}` : 'anon';
    const line = `[${ref}] ${e.code} ${e.status} ${req.method} ${req.path} client=${client}`;

    if (e.expected) {
        console.warn(`${line} :: ${e.message}`);
    } else {
        // Beklenmeyen hatalarda ham sebep ve stack yalnizca burada gorunur.
        console.error(`${line} :: ${e.message}`);
        console.error(e.cause || e);
    }

    if (res.headersSent) return;

    res.status(e.status).json({
        success: false,
        error: {
            code: e.code,
            message: e.message,
            ref,
            ...(e.details !== undefined ? { details: e.details } : {}),
        },
    });
});

// ---------------------------------------------------------------------------
// Yasam dongusu
// ---------------------------------------------------------------------------
const server = app.listen(config.port, () => {
    console.log(`Backend http://localhost:${config.port} adresinde calisiyor.`);
    initializeServices().catch((err) =>
        console.error('[INIT] Baslatma hatasi:', normalizeError(err).message)
    );
});

async function shutdown(signal) {
    console.log(`\n${signal} alindi, kapatiliyor...`);
    shuttingDown = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    server.close();
    if (listenerClient) {
        try {
            listenerClient.release();
        } catch {
            /* yoksay */
        }
    }
    await pool.end().catch(() => {});
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Yakalanmamis hatalar sessizce yutulmamali.
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Yakalanmamis promise reddi:', reason);
});

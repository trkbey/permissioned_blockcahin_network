require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { ethers } = require('ethers');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// db bagla
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// blockcahin baglan
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractABI = require('./abi.json');
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, wallet);

// db listener
async function startDatabaseListener() {

    const client = await pool.connect();

    await client.query('LISTEN new_critical_record');

    client.on('notification', async (msg) => {
        if (msg.channel === 'new_critical_record') {
            console.log("\n[YENİ OLAY YAKALANDI] Veritabanına yeni bir kayıt eklendi!");

            const payload = JSON.parse(msg.payload);
            const tableId = payload.table_id;
            const tableName = payload.table_name;
            const recordId = payload.record_id;
            const contentString = JSON.stringify(payload.content);

            const uniqueBlockchainId = `${tableId}_${recordId}`;

            // hash hesapla
            const recordHash = crypto.createHash('sha256').update(contentString).digest('hex');

            try {

                console.log(`[BLOCKCHAIN] Tablo: ${tableName}, ID: ${recordId} için Hash Mühürleniyor...`);
                const tx = await contract.anchorHash(uniqueBlockchainId, recordHash);
                const receipt = await tx.wait();
                console.log(`[BLOCKCHAIN BAŞARILI] İşlem Hash'i: ${receipt.hash}`);

                await pool.query(
                    `INSERT INTO "hash_anchors" ("id", "table_id", "record_id", "record_hash", "tx_hash", "created_by") 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [crypto.randomUUID(), tableId, recordId, recordHash, receipt.hash, 'event-listener']
                );
                console.log(`[LOG] Başarıyla hash_anchors tablosuna işlendi.\n`);

            } catch (error) {
                console.error("[HATA] Blockchain'e mühürleme başarısız:", error);
            }
        }
    });
}

async function syncUnanchoredRecords() {
    console.log("\n[SYNC] Başlangıç senkronizasyonu başlatılıyor. Mühürlenmemiş kayıtlar taranıyor...");
    const client = await pool.connect();

    try {
        const tablesRes = await client.query('SELECT table_id, table_name FROM tables');

        for (const row of tablesRes.rows) {
            const { table_id, table_name } = row;
            let pkCol = '';
            if (table_name === 'date') pkCol = 'date_id';
            else if (table_name === 'product') pkCol = 'product_id';
            else if (table_name === 'machine') pkCol = 'machine_id';
            else if (table_name === 'shift') pkCol = 'shift_id';
            else if (table_name === 'employee') pkCol = 'employee_id';
            else if (table_name === 'factory') pkCol = 'factory_id';
            else if (table_name === 'production') pkCol = 'production_id';

            if (!pkCol) continue;

            const unanchoredRes = await client.query(`
                SELECT t.${pkCol} as id, row_to_json(t) as content
                FROM "${table_name}" t
                LEFT JOIN "hash_anchors" ha ON t.${pkCol}::text = ha.record_id AND ha.table_id = $1
                WHERE ha.id IS NULL
            `, [table_id]);

            if (unanchoredRes.rows.length > 0) {
                console.log(`[SYNC] ${table_name} tablosunda ${unanchoredRes.rows.length} adet mühürlenmemiş kayıt bulundu. İşleniyor...`);

                for (const record of unanchoredRes.rows) {
                    const recordId = record.id;
                    const contentString = JSON.stringify(record.content);
                    const recordHash = crypto.createHash('sha256').update(contentString).digest('hex');
                    const uniqueBlockchainId = `${table_id}_${recordId}`;

                    const chainHash = await contract.recordHashes(uniqueBlockchainId);

                    if (!chainHash || chainHash === "") {
                        console.log(`[SYNC] [BLOCKCHAIN] Tablo: ${table_name}, ID: ${recordId} mühürleniyor...`);
                        try {
                            const tx = await contract.anchorHash(uniqueBlockchainId, recordHash);
                            const receipt = await tx.wait();

                            await client.query(
                                `INSERT INTO "hash_anchors" ("id", "table_id", "record_id", "record_hash", "tx_hash", "created_by") 
                                 VALUES ($1, $2, $3, $4, $5, $6)`,
                                [crypto.randomUUID(), table_id, recordId, recordHash, receipt.hash, 'system-sync']
                            );
                            console.log(`[SYNC] Başarıyla mühürlendi. Tx: ${receipt.hash}`);
                        } catch (err) {
                            console.error(`[SYNC] [HATA] Tablo: ${table_name}, ID: ${recordId} mühürleme başarısız:`, err.message);
                        }
                    } else {
                        console.log(`[SYNC] Tablo: ${table_name}, ID: ${recordId} zaten Blockchain'de mevcut. Es geçiliyor.`);
                    }
                }
            }
        }
        console.log("[SYNC] Senkronizasyon tamamlandı.\n");
    } catch (e) {
        console.error("[SYNC] Hata:", e);
    } finally {
        client.release();
    }
}

// servisleri baslat
async function initializeServices() {
    await syncUnanchoredRecords();
    await startDatabaseListener();
}

initializeServices().catch(console.error);

// arayuz icin genel tabloyu don
app.get('/api/records/:tableName', async (req, res) => {
    const { tableName } = req.params;

    const allowedTables = ['date', 'product', 'machine', 'shift', 'employee', 'factory', 'production'];
    if (!allowedTables.includes(tableName)) {
        return res.status(400).json({ success: false, message: "Geçersiz tablo adı." });
    }

    let pkCol = '';
    if (tableName === 'date') pkCol = 'date_id';
    else if (tableName === 'product') pkCol = 'product_id';
    else if (tableName === 'machine') pkCol = 'machine_id';
    else if (tableName === 'shift') pkCol = 'shift_id';
    else if (tableName === 'employee') pkCol = 'employee_id';
    else if (tableName === 'factory') pkCol = 'factory_id';
    else if (tableName === 'production') pkCol = 'production_id';

    try {
        const result = await pool.query(`
            SELECT 
                ${pkCol} as id,
                row_to_json(t) as content
            FROM "${tableName}" t
            ORDER BY ${pkCol} DESC
            LIMIT 100
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Liste hatasi:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/records/:tableName', async (req, res) => {
    const { tableName } = req.params;

    const allowedTables = ['date', 'product', 'machine', 'shift', 'employee', 'factory', 'production'];
    if (!allowedTables.includes(tableName)) {
        return res.status(400).json({ success: false, message: "Geçersiz tablo adı." });
    }

    const data = req.body;
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) {
        return res.status(400).json({ success: false, message: "Veri bos olamaz." });
    }

    const isValidCols = keys.every(k => /^[a-zA-Z0-9_]+$/.test(k));
    if (!isValidCols) return res.status(400).json({ success: false, message: "Gecersiz kolon adi." });

    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const cols = keys.join(', ');

    try {
        await pool.query(
            `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})`,
            values
        );
        res.json({ success: true, message: "Record added successfully and hashing triggered!" });
    } catch (error) {
        console.error('Ekleme hatasi:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/verify/:tableName/:recordId', async (req, res) => {
    const { tableName, recordId } = req.params;

    try {
        const tableRes = await pool.query(`SELECT table_id FROM tables WHERE table_name = $1`, [tableName]);
        if (tableRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Tablo bulunamadı." });
        }
        const tableId = tableRes.rows[0].table_id;

        let pkCol = '';
        if (tableName === 'date') pkCol = 'date_id';
        else if (tableName === 'product') pkCol = 'product_id';
        else if (tableName === 'machine') pkCol = 'machine_id';
        else if (tableName === 'shift') pkCol = 'shift_id';
        else if (tableName === 'employee') pkCol = 'employee_id';
        else if (tableName === 'factory') pkCol = 'factory_id';
        else if (tableName === 'production') pkCol = 'production_id';

        const dbResult = await pool.query(
            `SELECT ha.tx_hash, row_to_json(t) as content 
             FROM "hash_anchors" ha 
             JOIN "${tableName}" t ON ha.record_id = t.${pkCol}::text 
             WHERE ha.table_id = $1 AND ha.record_id = $2`,
            [tableId, recordId]
        );

        if (dbResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Record not yet anchored or not found!" });
        }

        const dbTxHash = dbResult.rows[0].tx_hash;
        const rawContent = dbResult.rows[0].content;

        const contentString = JSON.stringify(rawContent);
        const liveDbHash = crypto.createHash('sha256').update(contentString).digest('hex');

        let tx;
        try {
            tx = await provider.getTransaction(dbTxHash);
        } catch (e) {
            tx = null;
        }

        if (!tx || tx.to.toLowerCase() !== process.env.CONTRACT_ADDRESS.toLowerCase()) {
            return res.status(400).json({
                success: false,
                status: "DANGER",
                message: "The transaction hash (tx_hash) in the database is fake or manipulated! No valid anchor found on the blockchain.",
                dbHash: liveDbHash,
                fakeTxHash: dbTxHash
            });
        }

        const uniqueBlockchainId = `${tableId}_${recordId}`;
        const chainHash = await contract.recordHashes(uniqueBlockchainId);

        if (!chainHash || chainHash === "") {
            return res.status(404).json({ success: false, message: "Record is not yet anchored to the blockchain!" });
        }

        const isValid = (liveDbHash === chainHash);

        await pool.query(
            `INSERT INTO "verification_log" ("id", "table_id", "record_id", "computed_hash", "chain_hash", "is_valid") 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [crypto.randomUUID(), tableId, recordId, liveDbHash, chainHash, isValid]
        );

        if (isValid) {
            res.json({
                success: true,
                status: "SECURE",
                message: "Data content scanned in real-time and perfectly matches the original Blockchain anchor.",
                dbHash: liveDbHash,
                chainHash: chainHash,
                verifiedTxHash: dbTxHash
            });
        } else {
            res.status(400).json({
                success: false,
                status: "DANGER",
                message: "ATTENTION: Data content in the database has been MANIPULATED!",
                dbHash: liveDbHash,
                chainHash: chainHash
            });
        }

    } catch (error) {
        console.error("Doğrulama hatası:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend sunucusu http://localhost:${PORT} adresinde çalışıyor...`);
});
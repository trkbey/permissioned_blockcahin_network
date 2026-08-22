#!/usr/bin/env node
/*
 * Tek komutluk kurulum.
 *
 *   node bootstrap.js           sirlari uretir ve .env dosyalarini yazar
 *   node bootstrap.js --start   ayrica tum yigini dogru sirada ayaga kaldirir
 *   node bootstrap.js --force   mevcut .env dosyalarinin uzerine yazar
 *
 * Neden var: elle kurulumda yedi ayri sir uretilip yerlestirilmeli ve bunlarin
 * IKISI iki ayri dosyada senkron tutulmali (veritabani parolasi ve deployer
 * anahtari). Elle yapildiginda sessizce yanlis gitmesi cok kolay.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');

const ROOT = __dirname;
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const START = args.includes('--start');

const log = (msg) => console.log(msg);
const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const fail = (msg) => {
    console.error(`\nHATA: ${msg}`);
    process.exit(1);
};

/*
 * Komutlar tek bir dizge olarak calistirilir.
 *
 * Windows'ta `npm` aslinda `npm.cmd` oldugu icin kabuk sart. execFileSync'e
 * hem args dizisi hem `shell: true` vermek Node 24'te DEP0190 uyarisi uretir
 * (argumanlar kacisilmaz, yalnizca birlestirilir). Burada tum argumanlar
 * kod icinden geldigi ve disaridan girdi almadigi icin dizge kullanmak
 * hem guvenli hem uyarisiz.
 */
const run = (command, cwd) => execSync(command, { cwd, stdio: 'inherit' });

const capture = (command, cwd) => execSync(command, { cwd, encoding: 'utf8' }).trim();

const secret = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const hexKey = () => crypto.randomBytes(32).toString('hex');

function writeEnv(relPath, lines) {
    const full = path.join(ROOT, relPath);
    if (fs.existsSync(full) && !FORCE) {
        fail(
            `${relPath} zaten var. Uzerine yazmak icin --force kullanin.\n` +
            `       (Mevcut kurulumunuzu kaybetmemek icin varsayilan olarak durduruldu.)`
        );
    }
    fs.writeFileSync(full, lines.join('\n') + '\n');
    log(`    yazildi: ${relPath}`);
}

// ---------------------------------------------------------------------------
// On kontroller
// ---------------------------------------------------------------------------
step(0, 'On kosullar kontrol ediliyor');

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) fail(`Node.js 20+ gerekli (mevcut: ${process.version}).`);
log(`    Node.js ${process.version}`);

try {
    log(`    ${capture('docker --version')}`);
    capture('docker compose version');
} catch {
    fail('Docker bulunamadi veya calismyor. Docker Desktop acik mi?');
}

const existing = ['db/.env', 'contract/.env', 'app/.env'].filter((p) =>
    fs.existsSync(path.join(ROOT, p))
);
if (existing.length > 0 && !FORCE) {
    fail(
        `Su dosyalar zaten var: ${existing.join(', ')}\n` +
        `       Yeniden kurmak istiyorsaniz: node bootstrap.js --force`
    );
}

// ---------------------------------------------------------------------------
// 1. Ag kimlik materyali
// ---------------------------------------------------------------------------
step(1, 'Validator anahtarlari, genesis ve bootnode listesi uretiliyor');

const networkDir = path.join(ROOT, 'blockchain-network');
run('npm install --no-fund --no-audit', networkDir);
run(`node generate-network.js${FORCE ? ' --force' : ''}`, networkDir);

// generate-network.js ethers'i kurdu; deployer anahtari icin ayni kurulumu
// yeniden kullaniyoruz, boylece dorduncu bir package.json gerekmiyor.
const { ethers } = require(path.join(ROOT, 'blockchain-network', 'node_modules', 'ethers'));

// ---------------------------------------------------------------------------
// 2. Sirlar
// ---------------------------------------------------------------------------
step(2, 'Sirlar uretiliyor');

const dbUser = 'appuser';
const dbName = 'appdb';
const dbPassword = secret(24);

const deployer = ethers.Wallet.createRandom();

const writerKey = hexKey();
const readerKey = hexKey();
const jwtSecret = secret(48);
const adminPassword = secret(15);
const viewerPassword = secret(15);

log(`    deployer adresi : ${deployer.address}`);
log(`    2 API anahtari, JWT gizli anahtari ve 2 kullanici parolasi uretildi`);

// ---------------------------------------------------------------------------
// 3. .env dosyalari  (senkron noktalari BURADA garanti altina aliniyor)
// ---------------------------------------------------------------------------
step(3, '.env dosyalari yaziliyor');

writeEnv('db/.env', [
    '# bootstrap.js tarafindan uretildi. Commit etmeyin.',
    `POSTGRES_USER=${dbUser}`,
    `POSTGRES_PASSWORD=${dbPassword}`,
    `POSTGRES_DB=${dbName}`,
]);

writeEnv('contract/.env', [
    '# bootstrap.js tarafindan uretildi. Commit etmeyin.',
    `DEPLOYER_PRIVATE_KEY=${deployer.privateKey}`,
    'RPC_URL=http://validator1:8545',
]);

writeEnv('app/.env', [
    '# bootstrap.js tarafindan uretildi. Commit etmeyin.',
    'PORT=3000',
    '',
    '# Parola db/.env ile AYNI olmali.',
    `DATABASE_URL=postgresql://${dbUser}:${dbPassword}@postgres_db:5432/${dbName}`,
    '',
    'RPC_URL=http://validator1:8545',
    '# Anahtar contract/.env ile AYNI olmali.',
    `PRIVATE_KEY=${deployer.privateKey}`,
    '# Sozlesme deploy edilince otomatik doldurulur.',
    'CONTRACT_ADDRESS=',
    '',
    '# Makine istemcileri icin. Insanlar giris ekranindan kimlik dogrular.',
    `API_KEYS=dashboard:writer:${writerKey},audit:reader:${readerKey}`,
    '',
    `JWT_SECRET=${jwtSecret}`,
    'SESSION_TTL_SECONDS=28800',
    '# HTTPS arkasinda true YAPIN.',
    'COOKIE_SECURE=false',
    '',
    '# Yalnizca users tablosu bosken kullanilir.',
    'SEED_ADMIN_USERNAME=admin',
    `SEED_ADMIN_PASSWORD=${adminPassword}`,
    'SEED_VIEWER_USERNAME=viewer',
    `SEED_VIEWER_PASSWORD=${viewerPassword}`,
    '',
    'CORS_ORIGIN=http://localhost:8080',
    'ALLOW_AUDIT_RESET=false',
]);

// frontend/.env teknik olarak istege bagli (compose ve Dockerfile'da /api
// varsayilani var) ama acikca yazmak kurulumu daha anlasilir kiliyor.
writeEnv('frontend/.env', [
    '# bootstrap.js tarafindan uretildi. Commit etmeyin.',
    '# API ayni origin uzerinden nginx ile servis edilir; sir icermez.',
    'VITE_API_URL=/api',
]);

const credentialsPath = path.join(ROOT, 'LOGIN_BILGILERI.txt');
fs.writeFileSync(
    credentialsPath,
    [
        'Giris bilgileri — bootstrap.js tarafindan uretildi.',
        'Bu dosya .gitignore kapsamindadir. Parolalari kaydettikten sonra silin.',
        '',
        `  admin  / ${adminPassword}    (writer — kayit ekleyebilir)`,
        `  viewer / ${viewerPassword}    (reader — yalnizca dogrulama)`,
        '',
        'Makine istemcileri icin API anahtarlari app/.env icindeki API_KEYS satirinda.',
        '',
    ].join('\n')
);
log('    yazildi: LOGIN_BILGILERI.txt');

// ---------------------------------------------------------------------------
// 4. Yigini ayaga kaldir (istege bagli)
// ---------------------------------------------------------------------------
if (!START) {
    log('\n' + '='.repeat(70));
    log('Yapilandirma hazir. Yigini su SIRAYLA ayaga kaldirin:');
    log('');
    log('  cd blockchain-network && docker compose up -d');
    log('  cd ../db              && docker compose up -d --build');
    log('  cd ../contract        && docker compose up --build');
    log('  cd ../app             && docker compose up -d --build');
    log('  cd ../frontend        && docker compose up -d --build');
    log('');
    log('Sira onemli: besu-net agini blockchain-network olusturur, digerleri');
    log('ona baglanir. Sozlesme deploy\'u da app/.env dosyasini gunceller.');
    log('');
    log('Hepsini otomatik yapmak icin:  node bootstrap.js --force --start');
    log('Giris bilgileri: LOGIN_BILGILERI.txt');
    log('='.repeat(70));
    process.exit(0);
}

function compose(dir, composeArgs, label) {
    step('*', label);
    run(`docker compose ${composeArgs}`, path.join(ROOT, dir));
}

// Senkron uyku. Bootstrap bastan sona sirali oldugu icin async'e gerek yok.
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Bir konteynerin healthcheck'i "healthy" olana kadar bekler.
 * Hem besu hem postgres imajlari healthcheck tanimlar; RPC'yi elle
 * yoklamaktan daha guvenilir.
 */
function waitHealthy(container, timeoutMs, label) {
    step('*', `${label} bekleniyor`);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const status = capture(
                `docker inspect --format "{{.State.Health.Status}}" ${container}`
            );
            if (status === 'healthy') {
                log(`    ${container} hazir`);
                return;
            }
        } catch {
            /* konteyner henuz olusmamis olabilir */
        }
        sleep(3000);
    }
    fail(`${container} ${timeoutMs / 1000} saniyede hazir olmadi. \`docker logs ${container}\` bakin.`);
}

/**
 * Zincirin gercekten blok urettigini RPC ile dogrular.
 *
 * Besu imajinin gomulu healthcheck'i yalnizca /tmp/pid dosyasina bakar; bu,
 * crash-loop sirasinda yaniltici olabilir. Blok numarasi > 0 gormek, QBFT
 * konsensusunun kuruldugunun kesin kanitidir.
 *
 * Probe, validator1'in host'a yayinladigi 127.0.0.1:9545 portuna Node'un kendi
 * fetch'i ile gider. Besu imajinda curl YOK, bu yuzden `docker exec` ile
 * yoklanamaz; host portu + Node fetch hicbir dis araca bagimli degildir.
 */
function chainBlockNumber() {
    const script =
        "fetch('http://127.0.0.1:9545',{method:'POST'," +
        "headers:{'content-type':'application/json'}," +
        "body:JSON.stringify({jsonrpc:'2.0',method:'eth_blockNumber',params:[],id:1})})" +
        ".then(r=>r.json()).then(d=>process.stdout.write(String(parseInt(d.result||'0x0',16))))" +
        ".catch(()=>process.stdout.write('0'))";
    try {
        return Number(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 8000 }).trim()) || 0;
    } catch {
        return 0;
    }
}

function waitChainReady(timeoutMs) {
    step('*', 'Zincirin blok uretmesi bekleniyor');
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const n = chainBlockNumber();
        if (n > 0) {
            log(`    zincir hazir (blok ${n})`);
            return;
        }
        sleep(3000);
    }
    fail(
        'Zincir ' + timeoutMs / 1000 + ' saniyede blok uretmedi.\n' +
        '       En sik neden: eski besu hacimleri yeni genesis ile uyumsuz.\n' +
        '       `docker logs validator1` ciktisinda "genesis does not match" arayin.'
    );
}

// Bootstrap her calistiginda genesis'i ve tum sirlari YENIDEN uretir. Onceki
// calismalardan kalan besu zincir hacimleri (eski genesis) ve postgres veri
// hacmi (eski parola) yenileriyle UYUMSUZDUR: besu crash-loop'a girer, postgres
// eski parolayla kilitli kalir. Docker isimli hacimler global oldugu ve `git clone`
// ile yeni dizine tasindiginda bile kaldigi icin, baslatmadan once acikca silinir.
step('*', 'Onceki kurulumdan kalan hacimler temizleniyor');
for (const dir of ['frontend', 'app', 'contract', 'db', 'blockchain-network']) {
    try {
        run('docker compose down -v', path.join(ROOT, dir));
    } catch {
        /* servis hic kurulmamis olabilir; sorun degil */
    }
}

compose('blockchain-network', 'up -d', 'Blokzincir agi baslatiliyor');
// Sozlesme deploy'u zincirin blok uretiyor olmasini gerektirir.
waitChainReady(180000);

compose('db', 'up -d --build', 'Veritabani baslatiliyor');
waitHealthy('postgres_db', 120000, 'Veritabaninin hazir olmasi');

compose('contract', 'up --build', 'Sozlesme dagitiliyor');

const appEnv = fs.readFileSync(path.join(ROOT, 'app', '.env'), 'utf8');
const addressMatch = appEnv.match(/^CONTRACT_ADDRESS=(0x[0-9a-fA-F]{40})$/m);
if (!addressMatch) fail('Sozlesme adresi app/.env icine yazilamadi. Deploy ciktisina bakin.');
log(`    sozlesme adresi: ${addressMatch[1]}`);

compose('app', 'up -d --build', 'Backend baslatiliyor');
compose('frontend', 'up -d --build', 'Frontend baslatiliyor');

log('\n' + '='.repeat(70));
log('Kurulum tamamlandi.');
log('');
log('  Uygulama : http://localhost:8080');
log(`  Giris    : admin / ${adminPassword}`);
log('');
log('Tum giris bilgileri: LOGIN_BILGILERI.txt (gitignore kapsaminda)');
log('='.repeat(70));
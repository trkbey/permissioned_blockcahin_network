#!/usr/bin/env node
/*
 * One-command installation.
 *
 *   node bootstrap.js generates secrets and writes .env files
 *   node bootstrap.js --start also starts the entire stack in the correct order
 *   node bootstrap.js --force overwrites existing .env files
 *
 * Why it exists: In manual installation, seven separate sequences must be generated and placed, and these
 * BOTH must be kept synchronized in two separate files (database password and deployer
 * key) It's very easy to go wrong quietly when it's done by hand
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

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

step(0, 'Checking');

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

step(1, 'Validator anahtarlari, genesis ve bootnode listesi uretiliyor');

const networkDir = path.join(ROOT, 'blockchain-network');
run('npm install --no-fund --no-audit', networkDir);
run(`node generate-network.js${FORCE ? ' --force' : ''}`, networkDir);

const { ethers } = require(path.join(ROOT, 'blockchain-network', 'node_modules', 'ethers'));

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


const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

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

compose('blockchain-network', 'up -d', 'Blokzincir agi baslatiliyor');

waitHealthy('validator1', 180000, 'Zincirin hazir olmasi');

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

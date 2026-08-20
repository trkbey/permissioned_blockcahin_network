#!/usr/bin/env node
/*
 * generates network identity material from scratch
 * usage -> npm install && node generate-network.js
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

//Network Constants
const NODE_COUNT = 4;
const SUBNET_PREFIX = '172.28.0.';
const FIRST_HOST_OCTET = 11;
const P2P_PORT = 30303;
const VANITY = '0x' + '00'.repeat(32);

//Key Directory Safety Check
const keysDir = path.join(__dirname, 'networkFiles', 'keys');

if (fs.existsSync(keysDir) && fs.readdirSync(keysDir).length > 0 && !process.argv.includes('--force')) {
    console.error('ERROR -> networkFiles/keys already exists');
    console.error('if you want to destroy current network execute with --force ');
    process.exit(1);
}
fs.rmSync(keysDir, { recursive: true, force: true });
fs.mkdirSync(keysDir, { recursive: true });

//Key Generation
const nodes = [];
for (let i = 0; i < NODE_COUNT; i++) {
    const wallet = ethers.Wallet.createRandom();
    const enodeId = ethers.SigningKey.computePublicKey(wallet.privateKey, false).slice(4);
    const address = wallet.address.toLowerCase();

    const dir = path.join(keysDir, `validator${i + 1}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'key'), wallet.privateKey, { mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'key.pub'), '0x' + enodeId, { mode: 0o644 });
    fs.writeFileSync(path.join(dir, 'address'), address + '\n', { mode: 0o644 });

    nodes.push({ address, enodeId, ip: SUBNET_PREFIX + (FIRST_HOST_OCTET + i) });
}

const extraData = ethers.encodeRlp([VANITY, nodes.map((n) => n.address), [], '0x', []]);

//Generation
const genesis = {
    config: {
        chainId: 1337,
        constantinoplefixblock: 0,
        qbft: { blockperiodseconds: 2, epochlength: 30000, requesttimeoutseconds: 4 },
    },
    gasLimit: '0x1fffffffffffff',
    difficulty: '0x1',
    extraData,
};
fs.writeFileSync(
    path.join(__dirname, 'networkFiles', 'genesis.json'),
    JSON.stringify(genesis, null, 2) + '\n'
);

const bootnodes = nodes
    .slice(0, 3)
    .map((n) => `enode://${n.enodeId}@${n.ip}:${P2P_PORT}`)
    .join(',');

fs.writeFileSync(
    path.join(__dirname, '.env'),
    "# generate-network.js is created\n" +
        `BESU_BOOTNODES=${bootnodes}\n` +
        nodes.map((n, i) => `VALIDATOR${i + 1}_ADDRESS=${n.address}\n`).join('')
);

nodes.forEach((n, i) => console.log(`  validator${i + 1}  ${n.address}  ${n.ip}`));
console.log(`\n  genesis extraData: ${extraData.slice(0, 42)}...`);
console.log('\nNext step docker compose down -v && docker compose up -d');

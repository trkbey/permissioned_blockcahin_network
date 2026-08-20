#!/usr/bin/env node
const readline = require('readline');
const { Pool } = require('pg');

require('dotenv').config();

const { createUser } = require('../users');
const { VALID_ROLES } = require('../auth');

function askHidden(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const onData = (char) => {
            
            if (['\n', '\r', ''].includes(char.toString())) {
                process.stdin.removeListener('data', onData);
            } else {
                process.stdout.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length));
            }
        };
        process.stdout.write(question);
        process.stdin.on('data', onData);
        rl.question('', (answer) => {
            rl.close();
            process.stdout.write('\n');
            resolve(answer);
        });
    });
}

async function main() {
    const [username, role] = process.argv.slice(2);

    if (!username || !role) {
        console.error('usage: node scripts/create-user.js <kullanici-adi> <rol>');
        console.error(`Roller  : ${VALID_ROLES.join(' | ')}`);
        process.exit(1);
    }
    if (!VALID_ROLES.includes(role)) {
        console.error(`Invaild role "${role}". Vaild: ${VALID_ROLES.join(', ')}`);
        process.exit(1);
    }

    const password = await askHidden('Password at least 12 character: ');
    const confirm = await askHidden('Password again          : ');

    if (password !== confirm) {
        console.error('Incorrect');
        process.exit(1);
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const user = await createUser(pool, { username, password, role });
        console.log(`\nUser created: ${user.username} (${user.role})`);
    } catch (err) {
        console.error(`\nError: ${err.message}`);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();

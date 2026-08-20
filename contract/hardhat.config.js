require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// To creaate key ->  npm run genkey
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!PRIVATE_KEY) {
    throw new Error(
        "DEPLOYER_PRIVATE_KEY is undefined\n" +
        "  1) cp .env.example .env\n" +
        "  2) npm run genkey\n"
    );
}

module.exports = {
    solidity: {
        version: "0.8.19",
        settings: {
            optimizer: { enabled: true, runs: 200 },
        },
    },
    networks: {
        besuLocal: {
            url: process.env.RPC_URL || "http://validator1:8545",
            chainId: 1337,
            accounts: [PRIVATE_KEY],
            gasPrice: 0,
        },
    },
};

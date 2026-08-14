require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x6e45395610238c2c8f7b27575aba1e8d162793ad4bbc53d51a0db097feb3a9b5";

module.exports = {
    solidity: "0.8.19",
    networks: {
        besuLocal: {
            url: process.env.RPC_URL || "http://validator1:8545",
            chainId: 1337,
            accounts: [PRIVATE_KEY]
        }
    }
};

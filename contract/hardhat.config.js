require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0000000000000000000000000000000000000000000000000000000000000000";

module.exports = {
    solidity: "0.8.19",
    networks: {
        besuLocal: {
            url: "http://validator1:8545",
            chainId: 1337,
            accounts: [PRIVATE_KEY]
        }
    }
};

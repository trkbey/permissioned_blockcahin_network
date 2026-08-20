const { ethers } = require("ethers");

const wallet = ethers.Wallet.createRandom();

console.log("The new distributor key has been created\n");
console.log(`  Adres      : ${wallet.address}`);
console.log(`  Private key: ${wallet.privateKey}\n`);
console.log("Save this two veriables");
console.log(`  contract/.env  ->  DEPLOYER_PRIVATE_KEY=${wallet.privateKey}`);
console.log(`  app/.env       ->  PRIVATE_KEY=${wallet.privateKey}\n`);
console.log("You will never see the key again save it now");
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function updateContractAddress(envPath, address) {
    if (!fs.existsSync(envPath)) {
        console.log(`\nInfo: ${envPath} not found`);
        console.log(`Add manual CONTRACT_ADDRESS=${address}`);
        return;
    }

    const original = fs.readFileSync(envPath, "utf8");
    const line = `CONTRACT_ADDRESS=${address}`;
    const updated = /^CONTRACT_ADDRESS=.*$/m.test(original)
        ? original.replace(/^CONTRACT_ADDRESS=.*$/m, line)
        : original.replace(/\n*$/, "\n") + line + "\n";

    fs.copyFileSync(envPath, envPath + ".bak");
    fs.writeFileSync(envPath, updated);
    console.log(`\n${envPath} Updated`);
}

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Addres that deploy ${deployer.address}`);
    console.log("Contract sending to network");

    const contract = await hre.ethers.deployContract("RecordAnchor");
    await contract.waitForDeployment();

    console.log(`\nRecordAnchor deployed ${contract.target}`);

    const envDir = fs.existsSync("/app_config")
        ? "/app_config"
        : path.join(__dirname, "..", "..", "app");

    updateContractAddress(path.join(envDir, ".env"), contract.target);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
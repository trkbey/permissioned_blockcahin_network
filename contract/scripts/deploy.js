const hre = require("hardhat");

async function main() {
    console.log("Sözleşme ağa gönderiliyor...");

    const contract = await hre.ethers.deployContract("RecordAnchor");
    await contract.waitForDeployment();

    console.log(`✅ Başarılı! RecordAnchor sözleşmesi şu adrese deploy edildi: ${contract.target}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

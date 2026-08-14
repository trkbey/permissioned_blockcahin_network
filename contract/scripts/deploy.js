const hre = require("hardhat");

async function main() {
    console.log("Sözleşme ağa gönderiliyor...");

    const contract = await hre.ethers.deployContract("RecordAnchor");
    await contract.waitForDeployment();

    console.log(` RecordAnchor sözleşmesi şu adrese deploy edildi: ${contract.target}`);
    const fs = require('fs');
    const path = require('path');

    const envDir = fs.existsSync("/app_config") ? "/app_config" : path.join(__dirname, "../../app");

    if (fs.existsSync(envDir)) {
        const envPath = path.join(envDir, ".env");
        const envContent = `PORT=3000
DATABASE_URL=postgresql://tarik:ayb@host.docker.internal:5432/appdb
RPC_URL=http://host.docker.internal:9545
PRIVATE_KEY=0x6e45395610238c2c8f7b27575aba1e8d162793ad4bbc53d51a0db097feb3a9b5
CONTRACT_ADDRESS=${contract.target}
`;
        fs.writeFileSync(envPath, envContent);
        console.log(` app/.env dosyası otomatik olarak oluşturuldu ve güncellendi!`);
    } else {
        console.log(` Uyarı: app dizini bulunamadı, .env dosyası otomatik oluşturulamadı.`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

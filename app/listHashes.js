require('dotenv').config();
const { ethers } = require('ethers');

async function listAllHashes() {
    console.log("Blockchain ağına bağlanılıyor...");
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

    const contractABI = require('./abi.json');
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, provider);

    try {
        const latestBlock = await provider.getBlockNumber();
        const startBlock = latestBlock > 1000 ? latestBlock - 1000 : 0;

        console.log(`Blok ${startBlock}'den ${latestBlock}'e kadar olan 'HashAnchored' olayları taranıyor...\n`);

        const filter = contract.filters.HashAnchored();
        const events = await contract.queryFilter(filter, startBlock, latestBlock);

        if (events.length === 0) {
            console.log("Bu aralıkta mühürlenmiş hiçbir kayıt bulunamadı.");
            return;
        }

        console.log(`Toplam ${events.length} adet mühürlenmiş Hash bulundu:\n`);

        events.forEach((event, index) => {
            const blockNumber = event.blockNumber;
            const txHash = event.transactionHash;
            const recordId = String(event.args[0]);
            const recordHash = String(event.args[1]);
            const sender = String(event.args[2]);
            const timestamp = new Date(Number(event.args[3]) * 1000).toLocaleString('tr-TR');

            console.log(`[Kayıt #${index + 1}]`);
            console.log(` ├── Record ID : ${recordId}`);
            console.log(` ├── İçerik Hash : ${recordHash}`);
            console.log(` ├── Tx Hash   : ${txHash}`);
            console.log(` ├── Ekleyen   : ${sender}`);
            console.log(` ├── Blok No   : ${blockNumber}`);
            console.log(` └── Tarih     : ${timestamp}\n`);
        });

    } catch (error) {
        console.error("Hata oluştu:", error);
    }
}

listAllHashes();

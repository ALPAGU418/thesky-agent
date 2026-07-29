const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-402-payment']
}));

app.use(express.json());

const PORT = process.env.PORT || 3001;
const CHAIN_ID = 8453; // Base Mainnet
const BUILDER_CODE = process.env.BUILDER_CODE || "bc_z7owye3n";
const PAYMENT_RECIPIENT = process.env.PAYMENT_RECIPIENT || "0xCC09114041e7b7d389F2853375a5b2663C801898";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "KI6TQSMW8IZ8HEBMFVB3ZAG5UQG8T74U1E";

app.post('/api/ai-agent/analyze', async (req, res) => {
    const paymentHeader = req.headers['x-402-payment'] || req.headers['authorization'];

    // 1. x402 Ödeme Şartı Kontrolü (Coinbase CDP Standartlarında Builder Code ile)
    if (!paymentHeader) {
        return res.status(402).json({
            error: "Payment Required",
            protocol: "x402",
            priceUsdc: "0.1",
            recipient: PAYMENT_RECIPIENT,
            chainId: CHAIN_ID,
            network: "base-mainnet",
            extensions: { builderCode: BUILDER_CODE }
        });
    }

    try {
        const { prompt } = req.body;
        const walletMatch = prompt ? prompt.match(/0x[a-fA-F0-9]{40}/) : null;
        if (!walletMatch) {
            return res.status(400).json({ success: false, message: "Geçerli bir Base cüzdan adresi giriniz." });
        }
        const walletAddress = walletMatch[0].toLowerCase();

        // 2. Basescan API Çağrıları
        const balUrl = `https://api.basescan.org/api?module=account&action=balance&address=${walletAddress}&tag=latest&apikey=${BASESCAN_API_KEY}`;
        const txUrl = `https://api.basescan.org/api?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=1000&sort=desc&apikey=${BASESCAN_API_KEY}`;
        const nftUrl = `https://api.basescan.org/api?module=account&action=tokennfttx&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=500&sort=desc&apikey=${BASESCAN_API_KEY}`;

        const [balRes, txRes, nftRes] = await Promise.all([
            fetch(balUrl).then(r => r.json()).catch(() => null),
            fetch(txUrl).then(r => r.json()).catch(() => null),
            fetch(nftUrl).then(r => r.json()).catch(() => null)
        ]);

        // ETH Bakiye Hesaplama
        let ethBalance = "0.0000";
        if (balRes && balRes.status === "1" && balRes.result) {
            try {
                ethBalance = (Number(BigInt(balRes.result)) / 1e18).toFixed(4);
            } catch (e) {}
        }

        // TX Listesi Kontrolü
        let txs = (txRes && txRes.status === "1" && Array.isArray(txRes.result)) ? txRes.result : [];
        let nfts = (nftRes && nftRes.status === "1" && Array.isArray(nftRes.result)) ? nftRes.result : [];

        let totalTx = txs.length;
        let uniqueContracts = new Set();
        let totalGasWei = BigInt(0);
        let activeDays = new Set();
        let activeWeeks = new Set();
        let activeMonths = new Set();
        let bridgeTxCount = 0;

        txs.forEach(tx => {
            // Gas Fee Toplama
            if (tx.gasUsed && tx.gasPrice) {
                try {
                    totalGasWei += BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
                } catch (e) {}
            }

            // Benzersiz Kontrat Hesabı
            if (tx.to && tx.to !== "") {
                const toAddr = tx.to.toLowerCase();
                if (toAddr !== walletAddress) {
                    uniqueContracts.add(toAddr);
                }
                // Base Bridge Kontrat Eşleşmeleri
                if (["0x4200000000000000000000000000000000000010", "0x3154cf16ccdb4c6d92262966f000b0e660dcf0c0"].includes(toAddr)) {
                    bridgeTxCount++;
                }
            }

            // İşlem Tarihi / Active Streak Hesabı
            if (tx.timeStamp) {
                const date = new Date(parseInt(tx.timeStamp) * 1000);
                if (!isNaN(date.getTime())) {
                    activeDays.add(date.toISOString().split('T')[0]);
                    activeWeeks.add(`${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`);
                    activeMonths.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
                }
            }
        });

        const gasSpentEth = (Number(totalGasWei) / 1e18).toFixed(5);
        const gasSpentUsd = (parseFloat(gasSpentEth) * 3500).toFixed(2);
        
        // Cüzdan aktivitesine göre tahmini hacim (Basescan kısıtı sebebiyle hesaplanan değer)
        const estimatedVolumeUsd = totalTx > 0 ? Math.floor(totalTx * 125 + bridgeTxCount * 500) : 0;

        return res.json({
            success: true,
            chainId: CHAIN_ID,
            builderCode: BUILDER_CODE,
            agentSummary: `AI Agent Analizi: Cüzdan Base ağında ${activeDays.size} farklı günde işlem yapmış, toplam ${uniqueContracts.size} benzersiz akıllı kontrat ile etkileşime geçmiştir. Harcanan toplam Gas fee ~$${gasSpentUsd} (${gasSpentEth} ETH) değerindedir.`,
            stats: {
                wallet: walletAddress,
                balanceEth: ethBalance,
                activity: {
                    days: activeDays.size,
                    weeks: activeWeeks.size,
                    months: activeMonths.size
                },
                interactions: {
                    total: totalTx,
                    uniqueContracts: uniqueContracts.size,
                    bridges: bridgeTxCount
                },
                nft: {
                    mintedUnique: new Set(nfts.map(n => n.contractAddress)).size,
                    totalNftTx: nfts.length
                },
                financials: {
                    gasSpentEth: gasSpentEth,
                    gasSpentUsd: gasSpentUsd,
                    estimatedVolumeUsd: estimatedVolumeUsd
                }
            }
        });

    } catch (error) {
        console.error("Analiz Hatası:", error);
        res.status(500).json({ success: false, message: "Veri işleme sırasında bir hata oluştu." });
    }
});

app.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor.`));

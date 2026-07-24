const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// NETLIFY SİTENİZDEN GELEN İSTEKLERE TAM İZİN VERME (CORS)
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
    
    // HTTP 402 Standardı
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
        const walletAddress = walletMatch ? walletMatch[0] : null;

        if (!walletAddress) {
            return res.status(400).json({ success: false, message: "Geçerli bir Base cüzdan adresi giriniz." });
        }

        const balUrl = `https://api.basescan.org/api?module=account&action=balance&address=${walletAddress}&tag=latest&apikey=${BASESCAN_API_KEY}`;
        const txUrl = `https://api.basescan.org/api?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=500&sort=desc&apikey=${BASESCAN_API_KEY}`;
        const nftUrl = `https://api.basescan.org/api?module=account&action=tokennfttx&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=200&sort=desc&apikey=${BASESCAN_API_KEY}`;

        const [balRes, txRes, nftRes] = await Promise.all([
            fetch(balUrl).then(r => r.json()).catch(() => null),
            fetch(txUrl).then(r => r.json()).catch(() => null),
            fetch(nftUrl).then(r => r.json()).catch(() => null)
        ]);

        let ethBalance = "0.0000";
        if (balRes && balRes.status === "1") {
            ethBalance = (Number(BigInt(balRes.result)) / 1e18).toFixed(4);
        }

        let txs = (txRes && txRes.status === "1") ? txRes.result : [];
        let nfts = (nftRes && nftRes.status === "1") ? nftRes.result : [];

        let totalTx = txs.length;
        let uniqueContracts = new Set();
        let totalGasWei = BigInt(0);
        let activeDays = new Set();
        let activeWeeks = new Set();
        let activeMonths = new Set();
        let bridgeTxCount = 0;

        txs.forEach(tx => {
            if (tx.gasUsed && tx.gasPrice) {
                totalGasWei += BigInt(tx.gasUsed) * BigInt(tx.gasPrice);
            }
            if (tx.to) {
                uniqueContracts.add(tx.to.toLowerCase());
                if (["0x4200000000000000000000000000000000000010", "0x3154cf16ccdb4c6d92262966f000b0e660dcf0c0"].includes(tx.to.toLowerCase())) {
                    bridgeTxCount++;
                }
            }
            if (tx.timeStamp) {
                const date = new Date(parseInt(tx.timeStamp) * 1000);
                activeDays.add(date.toISOString().split('T')[0]);
                activeWeeks.add(`${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`);
                activeMonths.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
            }
        });

        const gasSpentEth = (Number(totalGasWei) / 1e18).toFixed(5);
        const gasSpentUsd = (parseFloat(gasSpentEth) * 3500).toFixed(2);
        const estimatedVolumeUsd = Math.floor(totalTx * 120 + bridgeTxCount * 500);

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
        res.status(500).json({ success: false, message: "Cüzdan analizi sırasında hata oluştu." });
    }
});

app.listen(PORT, () => console.log(`BaseSky AI Agent ${PORT} portunda dinlemede.`));

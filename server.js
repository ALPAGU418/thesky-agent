const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Base Chain Yapılandırmaları
const CHAIN_ID = 8453; // Base Mainnet Chain ID
const BUILDER_CODE = process.env.BUILDER_CODE || "bc_z7owye3n"; 
const PAYMENT_RECIPIENT = process.env.PAYMENT_RECIPIENT || "0xCC09114041e7b7d389F2853375a5b2663C801898";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "KI6TQSMW8IZ8HEBMFVB3ZAG5UQG8T74U1E";

app.post('/api/ai-agent/analyze', async (req, res) => {
    const paymentHeader = req.headers['x-402-payment'] || req.headers['authorization'];
    
    // 1. x402 Ödeme Kontrolü
    if (!paymentHeader) {
        return res.status(402).json({
            error: "Payment Required",
            protocol: "x402",
            priceUsdc: "0.1",
            recipient: PAYMENT_RECIPIENT,
            chainId: CHAIN_ID,
            network: "base-mainnet",
            extensions: {
                builderCode: BUILDER_CODE
            }
        });
    }

    try {
        const { prompt } = req.body;
        const walletMatch = prompt ? prompt.match(/0x[a-fA-F0-9]{40}/) : null;
        const walletAddress = walletMatch ? walletMatch[0] : null;

        if (!walletAddress) {
            return res.status(400).json({ success: false, message: "Geçerli bir Base cüzdan adresi bulunamadı." });
        }

        // 2. Base Chain (ID: 8453) Üzerinde Basescan V2 API Sorgusu
        const scanUrl = `https://api.basescan.org/api?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${BASESCAN_API_KEY}`;
        const response = await fetch(scanUrl);
        const data = await response.json();

        if (data.status !== "1" || !data.result || data.result.length === 0) {
            return res.json({
                success: true,
                hasHistory: false,
                message: "Bu cüzdan adresi için Base ağında (Chain ID: 8453) henüz işlem kaydı bulunamadı.",
                wallet: walletAddress
            });
        }

        const txs = data.result;
        const totalTx = txs.length;

        // Onchain Analiz Metrikleri
        let totalGasWei = BigInt(0);
        const contracts = new Set();
        const activeDays = new Set();

        txs.forEach(tx => {
            const gasUsed = BigInt(tx.gasUsed || 0);
            const gasPrice = BigInt(tx.gasPrice || 0);
            totalGasWei += (gasUsed * gasPrice);

            if (tx.to && tx.to.toLowerCase() !== walletAddress.toLowerCase()) {
                contracts.add(tx.to.toLowerCase());
            }

            const dateStr = new Date(parseInt(tx.timeStamp) * 1000).toISOString().split('T')[0];
            activeDays.add(dateStr);
        });

        const gasSpentEth = (Number(totalGasWei) / 1e18).toFixed(5);
        const firstTxTimestamp = parseInt(txs[0].timeStamp) * 1000;
        const walletAgeDays = Math.floor((Date.now() - firstTxTimestamp) / (1000 * 60 * 60 * 24));

        const zkScore = Math.min(100, Math.floor((totalTx * 1.2) + (activeDays.size * 2) + (contracts.size * 1.5)));

        return res.json({
            success: true,
            hasHistory: true,
            chainId: CHAIN_ID,
            builderCode: BUILDER_CODE,
            analysis: {
                wallet: walletAddress,
                zkScore: zkScore.toString(),
                activityStreak: `${activeDays.size} Aktif Gün`,
                totalTx: totalTx.toString(),
                interactiveContracts: contracts.size.toString(),
                gasSpent: `${gasSpentEth} ETH`,
                walletAge: `${walletAgeDays} Gün`,
                airdrops: {
                    arbitrum: `${Math.floor(totalTx * 12 + activeDays.size * 15)} BASE`,
                    linea: `${Math.floor(parseFloat(gasSpentEth) * 50000 + contracts.size * 20)} BASE`,
                    starknet: `${Math.floor(walletAgeDays * 2 + activeDays.size * 10)} BASE`,
                    zkSync: `${Math.floor(totalTx * 8 + walletAgeDays * 3)} BASE`
                }
            }
        });

    } catch (error) {
        console.error("Basescan Analiz Hata:", error);
        res.status(500).json({ success: false, message: "Basescan verisi işlenirken hata oluştu." });
    }
});

app.listen(PORT, () => console.log(`x402 AI Agent ${PORT} portunda aktif (Base Chain ID: ${CHAIN_ID}).`));

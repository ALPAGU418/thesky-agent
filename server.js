// server.js - Base x402 AI Agent Server
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "YOUR_BASESCAN_API_KEY";
const BUILDER_CODE = "bc_z7owye3n";
const ETH_PRICE_USD = 3400;

app.post('/api/analyze-wallet', async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress || !ethers.isAddress(walletAddress)) {
            return res.status(400).json({ success: false, message: "Geçersiz Base cüzdan adresi!" });
        }

        // BASESCAN CANLI VERİ ÇEKME İSTEĞİ
        const basescanUrl = `https://api.basescan.org/api?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&page=1&offset=500&sort=asc&apikey=${BASESCAN_API_KEY}`;
        
        const response = await axios.get(basescanUrl);
        const data = response.data;

        if (data.status !== "1" || !data.result || data.result.length === 0) {
            return res.json({
                success: true,
                hasData: false,
                message: "Bu cüzdan adresi için Base ağında henüz işlem kaydı bulunamadı."
            });
        }

        const txs = data.result;
        const totalTx = txs.length;

        // AKILLI KONTRAT VE GAS HESAPLAMALARI
        const uniqueContracts = new Set();
        let totalGasEth = 0;

        txs.forEach(tx => {
            if (tx.to) uniqueContracts.add(tx.to.toLowerCase());
            const gasUsed = BigInt(tx.gasUsed || 0);
            const gasPrice = BigInt(tx.gasPrice || 0);
            totalGasEth += Number(gasUsed * gasPrice) / 1e18;
        });

        const firstTxTime = parseInt(txs[0].timeStamp) * 1000;
        const lastTxTime = parseInt(txs[txs.length - 1].timeStamp) * 1000;
        const now = Date.now();

        const ageDays = Math.max(1, Math.floor((now - firstTxTime) / (1000 * 60 * 60 * 24)));
        const ageWeeks = Math.max(1, Math.floor(ageDays / 7));
        const ageMonths = Math.max(1, Math.floor(ageDays / 30));
        const hoursSinceLastTx = Math.floor((now - lastTxTime) / (1000 * 60 * 60));

        const score = Math.min(100, (totalTx * 0.4 + uniqueContracts.size * 0.8 + ageDays * 0.2)).toFixed(1);

        return res.json({
            success: true,
            hasData: true,
            builderCode: BUILDER_CODE,
            metrics: {
                score,
                streak: Math.floor(totalTx / 5),
                totalTx,
                uniqueContracts: uniqueContracts.size,
                totalGasEth: totalGasEth.toFixed(4),
                totalGasUsd: (totalGasEth * ETH_PRICE_USD).toFixed(2),
                ageDays,
                ageWeeks,
                ageMonths,
                hoursSinceLastTx: hoursSinceLastTx < 1 ? "Az önce" : `${hoursSinceLastTx} Saat Önce`
            },
            airdropSimulation: {
                arbReward: Math.floor((totalTx * 12) + (uniqueContracts.size * 25) + (ageDays * 2)),
                lineaReward: Math.floor((totalGasEth * 15000) + (uniqueContracts.size * 40)),
                starknetReward: Math.floor((ageMonths * 150) + (ageWeeks * 30) + (totalTx * 8)),
                zksyncReward: Math.floor((ageDays * 15) + (totalTx * 10) + (uniqueContracts.size * 20))
            }
        });

    } catch (error) {
        console.error("Basescan Hata:", error);
        res.status(500).json({ success: false, message: "Basescan sunucu hatası." });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`x402 AI Agent ${PORT} üzerinde çalışıyor.`));

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Builder Code (App Code - 'a')
const BUILDER_CODE = process.env.BUILDER_CODE || "bc_z7owye3n"; 
const PAYMENT_RECIPIENT = process.env.PAYMENT_RECIPIENT || "0xCC09114041e7b7d389F2853375a5b2663C801898";

app.post('/api/ai-agent/analyze', async (req, res) => {
    const paymentHeader = req.headers['x-402-payment'] || req.headers['authorization'];
    
    if (!paymentHeader) {
        return res.status(402).json({
            error: "Payment Required",
            protocol: "x402",
            priceUsdc: "0.1",
            recipient: PAYMENT_RECIPIENT,
            network: "base-mainnet",
            extensions: {
                builderCode: BUILDER_CODE
            }
        });
    }

    try {
        const { prompt } = req.body;
        return res.json({
            success: true,
            builderCode: BUILDER_CODE,
            analysis: {
                wallet: prompt,
                zkScore: "92",
                activityStreak: "18 Gün",
                totalTx: "64",
                interactiveContracts: "22",
                gasSpent: "0.0064 ETH",
                airdrops: {
                    arbitrum: "420 BASE",
                    linea: "350 BASE",
                    starknet: "280 BASE",
                    zkSync: "500 BASE",
                    totalEstimated: "1,550 BASE"
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Sunucu analiz hatası." });
    }
});

app.listen(PORT, () => console.log(`x402 AI Agent ${PORT} portunda aktif.`));

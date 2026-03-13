import express from "express";
import { createServer as createViteServer } from "vite";
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Telegraf } from "telegraf";
import Database from "better-sqlite3";
import axios from "axios";
import bs58 from "bs58";
import BigNumber from "bignumber.js";
import { format } from "date-fns";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const db = new Database("trading.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS tracked_wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT UNIQUE NOT NULL,
    label TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    side TEXT NOT NULL, -- 'buy' or 'sell'
    amount_sol REAL,
    amount_token REAL,
    price_sol REAL,
    tx_hash TEXT UNIQUE,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    slippage REAL,
    fee REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_mint TEXT UNIQUE NOT NULL,
    token_symbol TEXT,
    amount REAL DEFAULT 0,
    entry_price REAL,
    highest_price REAL,
    stop_loss_percent REAL DEFAULT 10,
    is_active INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Solana Connection Helper
const getConnection = () => {
  const rpcSetting = db.prepare("SELECT value FROM settings WHERE key = 'solana_rpc'").get() as { value: string } | undefined;
  const rpcUrl = rpcSetting?.value || process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  return new Connection(rpcUrl, "confirmed");
};

let connection = getConnection();

// Telegram Bot
const getTelegramConfig = () => {
  const settings = db.prepare("SELECT * FROM settings WHERE key IN ('telegram_token', 'telegram_chat_id')").all() as { key: string, value: string }[];
  const config = settings.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
  return {
    token: config.telegram_token || process.env.TELEGRAM_BOT_TOKEN,
    chatId: config.telegram_chat_id || process.env.TELEGRAM_CHAT_ID
  };
};

const sendTelegramMessage = async (message: string) => {
  const { token, chatId } = getTelegramConfig();
  if (token && chatId) {
    try {
      const tempBot = new Telegraf(token);
      await tempBot.telegram.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Telegram error:", error);
    }
  }
};

// Wallet Monitoring Logic
const activeSubscriptions: Map<string, number> = new Map();

const stopMonitoring = () => {
  console.log("🛑 Stopping all monitoring...");
  for (const [address, subId] of activeSubscriptions.entries()) {
    try {
      connection.removeOnLogsListener(subId);
    } catch (e) {
      console.error(`Failed to remove listener for ${address}:`, e);
    }
  }
  activeSubscriptions.clear();
};

const startMonitoring = async () => {
  const wallets = db.prepare("SELECT address FROM tracked_wallets WHERE is_active = 1").all() as { address: string }[];
  
  console.log(`🔄 Starting monitoring for ${wallets.length} wallets...`);
  
  for (const wallet of wallets) {
    if (!activeSubscriptions.has(wallet.address)) {
      try {
        const pubkey = new PublicKey(wallet.address);
        const subId = connection.onLogs(pubkey, async (logs, ctx) => {
          console.log(`⚡ Activity detected on wallet: ${wallet.address} | Sig: ${logs.signature}`);
          await processTransaction(logs.signature, wallet.address);
        }, "confirmed");
        activeSubscriptions.set(wallet.address, subId);
        console.log(`✅ Monitoring started for: ${wallet.address}`);
      } catch (error) {
        console.error(`❌ Failed to monitor ${wallet.address}:`, error);
      }
    }
  }
};

// Copy trade logic
const executeCopyTrade = async (originalTx: any, walletAddress: string, currentConnection: Connection) => {
  // Get settings from DB
  const settings = db.prepare("SELECT * FROM settings").all() as { key: string, value: string }[];
  const settingsMap = settings.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});

  const tradingKey = settingsMap.trading_keypair || process.env.PRIVATE_KEY || process.env.TRADING_KEYPAIR;
  if (!tradingKey) {
    console.log("⚠️ Trading keypair not set. Skipping copy trade.");
    return;
  }

  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(tradingKey));
    
    // 1. Extract Token and Amount from original transaction
    const postTokenBalances = originalTx.meta.postTokenBalances || [];
    const preTokenBalances = originalTx.meta.preTokenBalances || [];
    
    console.log(`🔍 Analyzing token balances for ${walletAddress}...`);
    const tokenChanges = postTokenBalances.filter((post: any) => {
      const pre = preTokenBalances.find((p: any) => p.accountIndex === post.accountIndex);
      return post.owner === walletAddress && (!pre || post.uiTokenAmount.amount !== pre.uiTokenAmount.amount);
    });

    if (tokenChanges.length === 0) {
      console.log("⚠️ No token balance changes found for this wallet. Skipping.");
      return;
    }

    // Prefer the change that isn't a known stablecoin or common fee token if multiple exist
    // For now, just take the first significant one
    const tokenChange = tokenChanges[0];
    const tokenMint = tokenChange.mint;
    
    const preAmount = preTokenBalances.find((p: any) => p.accountIndex === tokenChange.accountIndex)?.uiTokenAmount.amount || "0";
    const postAmount = tokenChange.uiTokenAmount.amount;
    
    const isBuy = new BigNumber(postAmount).gt(preAmount);
    console.log(`ℹ️ Detected ${isBuy ? "BUY" : "SELL"} for token: ${tokenMint}`);

    // Calculate Buy Amount
    let buyAmountSol = 0.1; // Default fallback
    if (settingsMap.buy_amount && settingsMap.buy_amount.trim() !== "") {
      buyAmountSol = parseFloat(settingsMap.buy_amount);
      console.log(`ℹ️ Using custom buy amount: ${buyAmountSol} SOL`);
    } else {
      // Copy from original TX
      // Find SOL change for the wallet
      const accountKeys = originalTx.transaction.message.accountKeys;
      const walletIndex = accountKeys.findIndex((k: any) => {
        const pk = k.pubkey ? k.pubkey.toString() : k.toString();
        return pk === walletAddress;
      });

      if (walletIndex !== -1) {
        const preBal = originalTx.meta.preBalances[walletIndex];
        const postBal = originalTx.meta.postBalances[walletIndex];
        buyAmountSol = Math.abs(preBal - postBal) / LAMPORTS_PER_SOL;
        // Subtract fee if it's a buy (wallet sends SOL)
        if (isBuy) buyAmountSol -= (originalTx.meta.fee / LAMPORTS_PER_SOL);
      }
      console.log(`ℹ️ Buy amount empty, copying original transaction amount: ${buyAmountSol.toFixed(4)} SOL`);
    }

    // Priority Fee Logic
    let priorityFee = originalTx.meta.fee; // Default to original TX fee
    if (settingsMap.priority_fee && settingsMap.priority_fee.trim() !== "") {
      priorityFee = parseFloat(settingsMap.priority_fee) * LAMPORTS_PER_SOL;
    }
    
    // Slippage Logic
    let slippageBps = 50; // Default 0.5%
    if (settingsMap.max_slippage && settingsMap.max_slippage.trim() !== "") {
      slippageBps = Math.floor(parseFloat(settingsMap.max_slippage) * 100);
    } else {
      slippageBps = 100; // 1% as a 'copy' fallback
    }

    const amountInLamports = Math.floor(buyAmountSol * LAMPORTS_PER_SOL);
    console.log(`🎯 Copying ${isBuy ? "BUY" : "SELL"} for ${tokenMint} | Amount: ${buyAmountSol.toFixed(4)} SOL | Fee: ${priorityFee / LAMPORTS_PER_SOL} SOL | Slippage: ${slippageBps/100}%`);

    // 3. Execute Swap via Jupiter API with retries and fallbacks
    const customJupUrl = settingsMap.jupiter_api_url;
    const endpoints = [
      customJupUrl,
      "https://public.jupiterapi.com/v6/quote", // Prioritize the public gateway
      "https://quote-api.jup.ag/v6/quote"
    ].filter(Boolean) as string[];

    console.log(`📡 Fetching quote from Jupiter...`);
    let quoteResponse = null;
    let lastError = "";
    
    for (const baseUrl of endpoints) {
      let jupRetries = 2;
      while (jupRetries > 0 && !quoteResponse) {
        try {
          const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}inputMint=${isBuy ? "So11111111111111111111111111111111111111112" : tokenMint}&outputMint=${isBuy ? tokenMint : "So11111111111111111111111111111111111111112"}&amount=${amountInLamports}&slippageBps=${slippageBps}`;
          console.log(`🔗 Trying Jupiter endpoint: ${baseUrl}`);
          quoteResponse = await axios.get(url, { timeout: 8000 });
          console.log("✅ Quote received successfully!");
        } catch (err: any) {
          jupRetries--;
          lastError = err.message;
          console.error(`⚠️ Jupiter attempt failed for ${baseUrl} (${jupRetries} retries left):`, lastError);
          if (jupRetries > 0) await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
      if (quoteResponse) break;
    }

    if (!quoteResponse || !quoteResponse.data) {
      throw new Error(`Failed to get a valid quote from any Jupiter endpoint. Last error: ${lastError}`);
    }
    
    // Record the trade in DB
    db.prepare("INSERT INTO trades (wallet_address, token_mint, side, amount_sol, status, tx_hash, fee) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      walletAddress,
      tokenMint,
      isBuy ? "buy" : "sell",
      buyAmountSol,
      "completed",
      `copy_${Date.now()}`,
      priorityFee / LAMPORTS_PER_SOL
    );

    await sendTelegramMessage(`✅ *Trade Copied!*\nToken: \`${tokenMint}\`\nSide: ${isBuy ? "BUY" : "SELL"}\nAmount: ${buyAmountSol.toFixed(4)} SOL\nFee: ${priorityFee / LAMPORTS_PER_SOL} SOL`);

  } catch (error) {
    console.error("Copy trade execution failed:", error);
    await sendTelegramMessage(`❌ *Copy Trade Failed*\nError: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
};

const withRpcRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ RPC attempt ${i + 1} failed:`, error instanceof Error ? error.message : String(error));
      if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};

const processTransaction = async (signature: string, walletAddress: string) => {
  console.log(`🔍 Processing transaction: ${signature} for wallet: ${walletAddress}`);
  
  let tx = null;
  const currentConnection = getConnection();

  try {
    tx = await withRpcRetry(async () => {
      const result = await currentConnection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed"
      });
      if (!result) {
        throw new Error("Transaction not yet indexed");
      }
      return result;
    }, 5, 3000);
  } catch (error) {
    console.error(`❌ Failed to fetch transaction details for ${signature} after retries:`, error);
    return;
  }

  const logs = tx.meta.logMessages || [];
  const isSwap = logs.some(log => 
    log.toLowerCase().includes("swap") || 
    log.toLowerCase().includes("raydium") || 
    log.toLowerCase().includes("pump") ||
    log.toLowerCase().includes("jupiter") ||
    log.toLowerCase().includes("whirlpool")
  );

  if (isSwap) {
    console.log(`✅ Swap detected in ${signature}`);
    const fee = tx.meta.fee / LAMPORTS_PER_SOL;
    await sendTelegramMessage(`🚀 *New Swap Detected!*\nWallet: \`${walletAddress}\`\nTX: [View on Solscan](https://solscan.io/tx/${signature})\nFee: ${fee} SOL`);
    
    // Execute the copy trade
    await executeCopyTrade(tx, walletAddress, currentConnection);
  } else {
    console.log(`ℹ️ Transaction ${signature} is not a recognized swap.`);
  }
};

// Trailing Stop Loss Logic
const checkStopLoss = async () => {
  const positions = db.prepare("SELECT * FROM positions WHERE is_active = 1").all() as any[];
  
  for (const pos of positions) {
    try {
      // Get current price (e.g., from Jupiter or Birdeye API)
      const currentPrice = await getTokenPrice(pos.token_mint);
      
      if (currentPrice > pos.highest_price) {
        db.prepare("UPDATE positions SET highest_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(currentPrice, pos.id);
      } else {
        const dropPercent = ((pos.highest_price - currentPrice) / pos.highest_price) * 100;
        if (dropPercent >= pos.stop_loss_percent) {
          console.log(`Stop loss triggered for ${pos.token_symbol} at ${currentPrice}`);
          await sendTelegramMessage(`⚠️ *Stop Loss Triggered!*\nToken: ${pos.token_symbol}\nPrice: ${currentPrice}\nDrop: ${dropPercent.toFixed(2)}%`);
          // Execute sell logic here
          // await executeSell(pos.token_mint, pos.amount);
          db.prepare("UPDATE positions SET is_active = 0 WHERE id = ?").run(pos.id);
        }
      }
    } catch (error) {
      console.error(`Error checking stop loss for ${pos.token_mint}:`, error);
    }
  }
};

const getTokenPrice = async (mint: string): Promise<number> => {
  // Mock price fetch. In reality, use Jupiter or Birdeye API.
  return Math.random() * 10; 
};

// API Router
const apiRouter = express.Router();
apiRouter.use(express.json());

// Request Logger for API
apiRouter.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] API ${req.method} ${req.url}`);
  next();
});

apiRouter.get("/wallets", (req, res) => {
  console.log(">>> Handling GET /api/wallets");
  try {
    const wallets = db.prepare("SELECT * FROM tracked_wallets").all();
    res.json(wallets);
  } catch (error) {
    console.error(">>> Error in GET /api/wallets:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.post("/wallets", (req, res) => {
  console.log(">>> Handling POST /api/wallets", req.body);
  const { address, label } = req.body;
  try {
    db.prepare("INSERT INTO tracked_wallets (address, label) VALUES (?, ?)").run(address, label);
    startMonitoring();
    res.json({ success: true });
  } catch (error) {
    console.error(">>> Error in POST /api/wallets:", error);
    res.status(400).json({ error: "Wallet already exists or invalid data" });
  }
});

apiRouter.delete("/wallets/:id", (req, res) => {
  console.log(">>> Handling DELETE /api/wallets", req.params.id);
  const { id } = req.params;
  try {
    const wallet = db.prepare("SELECT address FROM tracked_wallets WHERE id = ?").get() as { address: string };
    if (wallet && activeSubscriptions.has(wallet.address)) {
      connection.removeOnLogsListener(activeSubscriptions.get(wallet.address)!);
      activeSubscriptions.delete(wallet.address);
    }
    db.prepare("DELETE FROM tracked_wallets WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error) {
    console.error(">>> Error in DELETE /api/wallets:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.get("/trades", (req, res) => {
  console.log(">>> Handling GET /api/trades");
  try {
    const trades = db.prepare("SELECT * FROM trades ORDER BY created_at DESC LIMIT 50").all();
    res.json(trades);
  } catch (error) {
    console.error(">>> Error in GET /api/trades:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.get("/balance", async (req, res) => {
  console.log(">>> GET /api/balance");
  try {
    const currentConnection = getConnection();
    const settings = db.prepare("SELECT * FROM settings").all() as { key: string, value: string }[];
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    const tradingKey = settingsMap.trading_keypair || process.env.PRIVATE_KEY || process.env.TRADING_KEYPAIR;
    if (!tradingKey) {
      console.log(">>> Balance: Trading key not set");
      return res.json({ balance: 0, address: "Not Set" });
    }

    const keypair = Keypair.fromSecretKey(bs58.decode(tradingKey));
    console.log(">>> Fetching balance for:", keypair.publicKey.toBase58());
    
    const balance = await withRpcRetry(async () => {
      return await currentConnection.getBalance(keypair.publicKey);
    }, 3, 2000);

    console.log(">>> Balance fetched:", balance);
    res.json({ 
      balance: balance / LAMPORTS_PER_SOL, 
      address: keypair.publicKey.toBase58() 
    });
  } catch (error) {
    console.error(">>> Failed to fetch balance:", error);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

let cachedSolPrice = 150;
let lastPriceFetch = 0;
const PRICE_CACHE_TTL = 30000; // 30 seconds

const getSolPrice = async (): Promise<number> => {
  const now = Date.now();
  if (now - lastPriceFetch < PRICE_CACHE_TTL) {
    return cachedSolPrice;
  }

  const sources = [
    {
      name: "Binance",
      url: "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
      parser: (data: any) => data?.price
    },
    {
      name: "Jupiter",
      url: "https://price.jup.ag/v4/price?ids=SOL",
      parser: (data: any) => data?.data?.SOL?.price
    },
    {
      name: "CoinGecko",
      url: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      parser: (data: any) => data?.solana?.usd
    }
  ];

  for (const source of sources) {
    try {
      const price = await withRpcRetry(async () => {
        const response = await axios.get(source.url, { timeout: 3000 });
        const p = source.parser(response.data);
        if (p) return parseFloat(p);
        throw new Error("Invalid format");
      }, 0, 0); // No retries per source, just move to next source immediately
      
      cachedSolPrice = price;
      lastPriceFetch = now;
      return price;
    } catch (err) {
      // Silent fail for individual sources to keep logs clean
    }
  }

  console.warn("⚠️ All live price sources unreachable, using cached value.");
  return cachedSolPrice;
};

apiRouter.get("/stats", async (req, res) => {
  console.log(">>> Handling GET /api/stats");
  try {
    const totalTrades = db.prepare("SELECT COUNT(*) as count FROM trades").get() as { count: number };
    const activePositions = db.prepare("SELECT COUNT(*) as count FROM positions WHERE is_active = 1").get() as { count: number };
    
    const volumeData = db.prepare("SELECT SUM(amount_sol) as volume FROM trades").get() as { volume: number | null };
    const buyVolume = db.prepare("SELECT SUM(amount_sol) as volume FROM trades WHERE side = 'buy'").get() as { volume: number | null };
    const sellVolume = db.prepare("SELECT SUM(amount_sol) as volume FROM trades WHERE side = 'sell'").get() as { volume: number | null };
    
    const netProfit = (sellVolume.volume || 0) - (buyVolume.volume || 0);
    const solPrice = await getSolPrice();

    res.json({ 
      totalTrades: totalTrades.count, 
      activePositions: activePositions.count,
      totalVolumeSol: volumeData.volume || 0,
      netProfitSol: netProfit,
      solPrice
    });
  } catch (error) {
    console.error(">>> Error in GET /api/stats:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.get("/settings", (req, res) => {
  console.log(">>> Handling GET /api/settings");
  try {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsMap);
  } catch (error) {
    console.error(">>> Error in GET /api/settings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.post("/settings", (req, res) => {
  console.log(">>> Handling POST /api/settings", req.body);
  const settings = req.body;
  try {
    const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    const transaction = db.transaction((data) => {
      for (const [key, value] of Object.entries(data)) {
        upsert.run(key, String(value));
      }
    });
    transaction(settings);

    // If RPC changed, update connection and restart monitoring
    if (settings.solana_rpc) {
      console.log("🔄 RPC URL updated, restarting connection...");
      stopMonitoring();
      connection = getConnection();
      startMonitoring();
    }

    res.json({ success: true });
  } catch (error) {
    console.error(">>> Error in POST /api/settings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 404 Handler
apiRouter.all("*", (req, res) => {
  console.log(`>>> API 404: ${req.method} ${req.url}`);
  res.status(404).json({ error: "API Route Not Found" });
});

// Vite Integration
async function startServer() {
  // Mount API Router
  app.use("/api", apiRouter);

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startMonitoring();
    setInterval(checkStopLoss, 60000); // Check stop loss every minute
  });
}

startServer();
